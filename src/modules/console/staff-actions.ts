'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { readTaxRules, type TaxRules } from '@/modules/muster/tax/rules'
import { fail, ok } from '@/lib/actions'
import { STAFF_ROLE_LABEL, STAFF_ROLES } from '@/lib/console/roles'
import { consoleAction, type StaffCtx } from '@/lib/console/session'
import { mergeConsoleSettings, TEMPLATE_KEYS } from '@/lib/console/settings-defaults'
import { MAX_FIRST_YEAR_DISCOUNT_PERCENT } from '@/lib/first-year-discount'
import { WA_TEMPLATE_KEYS } from '@/modules/whatsapp/templates'
import { HANDOVER_STEPS } from '@/lib/console/handover'
import { NotFoundError } from '@/lib/errors'
import { emailLayout, sendMail } from '@/lib/mail'
import { checkbox, objectId } from '@/lib/validation'
import { ConsoleSettings } from '@/models/console/ConsoleSettings'
import { Staff } from '@/models/console/Staff'
import { StaffSession } from '@/models/console/StaffSession'
import { createStaff, issueSetupLink, SETUP_LINK_HOURS } from './staff-provision'

/** Staff and Settings (console spec 7.2), Admin only. Every change is audited per staff member. */

const refresh = () => revalidatePath('/console', 'layout')

async function sendSetupLink(email: string, name: string, link: string) {
  const title = 'Your Flowbit Console account'
  const mail = emailLayout({ title, paragraphs: [`Hi ${name}, choose your Console password with the button below. The link works once, for ${SETUP_LINK_HOURS} hours.`, 'Then sign in and set up two-factor sign-in with an authenticator app.'], cta: { label: 'Choose password', href: link } })
  await sendMail({ to: email, subject: title, ...mail, kind: 'security', secrets: [link.split('token=')[1] ?? ''] })
}

async function loadStaff(p: StaffCtx, id: string) {
  const staff = await p.raw(Staff).findById(id).lean()
  if (!staff) throw new NotFoundError('That staff member')
  return staff
}

/** Refuses a change that would leave the Console with no active Admin. */
async function keepsAnAdmin(p: StaffCtx, changingId: string): Promise<boolean> {
  return (await p.raw(Staff).countDocuments({ role: 'admin', status: 'active', _id: { $ne: changingId } })) > 0
}

export const addStaff = consoleAction(
  'staff.manage',
  z.object({ email: z.string().trim().toLowerCase().email('Enter an email'), name: z.string().trim().min(2, 'Enter a name').max(80), role: z.enum(STAFF_ROLES) }),
  async (input, p) => {
    if (await p.raw(Staff).exists({ email: input.email })) return fail('That email is already Console staff.', { email: 'Already staff' })
    const created = await createStaff({ email: input.email, name: input.name, role: input.role, createdBy: p.staff.id })
    if (created.setupLink) await sendSetupLink(input.email, input.name, created.setupLink)
    await p.audit({ action: 'console.staff_added', summary: `Added ${input.name} (${input.email}) as ${STAFF_ROLE_LABEL[input.role]}` })
    refresh()
    return ok(`${input.name} added. They got an email with a link to choose a password.`, { link: created.setupLink })
  },
)

export const setStaffRole = consoleAction('staff.manage', z.object({ staffId: objectId, role: z.enum(STAFF_ROLES) }), async (input, p) => {
  const staff = await loadStaff(p, input.staffId)
  if (staff.role === 'admin' && input.role !== 'admin' && !(await keepsAnAdmin(p, input.staffId))) return fail('The Console needs at least one active Admin.')
  await p.raw(Staff).updateOne({ _id: staff._id }, { $set: { role: input.role } })
  await p.audit({ action: 'console.staff_role_changed', summary: `${staff.name} is now ${STAFF_ROLE_LABEL[input.role]}`, meta: { before: staff.role, after: input.role } })
  refresh()
  return ok(`${staff.name} is now ${STAFF_ROLE_LABEL[input.role]}.`)
})

const active = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true')

export const setStaffActive = consoleAction('staff.manage', z.object({ staffId: objectId, active }), async (input, p) => {
  const staff = await loadStaff(p, input.staffId)
  if (String(staff._id) === String(p.staff.id)) return fail('You cannot disable yourself.')
  if (!input.active && staff.role === 'admin' && !(await keepsAnAdmin(p, input.staffId))) return fail('The Console needs at least one active Admin.')
  await p.raw(Staff).updateOne({ _id: staff._id }, { $set: { status: input.active ? 'active' : 'disabled' } })
  if (!input.active) await p.raw(StaffSession).deleteMany({ staffId: staff._id })
  await p.audit({ action: input.active ? 'console.staff_enabled' : 'console.staff_disabled', summary: `${input.active ? 'Enabled' : 'Disabled'} ${staff.name}` })
  refresh()
  return ok(`${staff.name} ${input.active ? 'enabled' : 'disabled and signed out'}.`)
})

/** Clears 2FA and the password, signs them out and sends a new setup link (lost phone, forgotten password). */
export const resetStaffAccess = consoleAction('staff.manage', z.object({ staffId: objectId }), async (input, p) => {
  const staff = await loadStaff(p, input.staffId)
  await p.raw(Staff).updateOne({ _id: staff._id }, { $unset: { totp: 1, passwordHash: 1 }, $set: { recoveryCodeHashes: [] } })
  await p.raw(StaffSession).deleteMany({ staffId: staff._id })
  const link = await issueSetupLink(staff._id)
  await sendSetupLink(staff.email, staff.name, link)
  await p.audit({ action: 'console.staff_access_reset', summary: `Reset the password and two-factor sign-in of ${staff.name}` })
  refresh()
  return ok(`${staff.name} was signed out and got a new setup link by email.`, { link })
})

/**
 * Emails a fresh one-time setup link to every active staff member who has
 * never chosen a Console password, e.g. Admins created by
 * scripts/migrate-staff.ts --all (V2-REVIEW C6: no product password is
 * carried over). Earlier links stop working.
 */
export const sendPendingSetupLinks = consoleAction('staff.manage', z.object({}), async (_input, p) => {
  const pending = await p.raw(Staff).find({ status: 'active', passwordHash: { $in: [null, ''] }, _id: { $ne: p.staff.id } }, { name: 1, email: 1 }).lean()
  if (!pending.length) return ok('Everyone has already chosen a password.')
  for (const staff of pending) {
    const link = await issueSetupLink(staff._id)
    await sendSetupLink(staff.email, staff.name, link)
  }
  await p.audit({ action: 'console.staff_setup_links_sent', summary: `Sent setup links to ${pending.map((s) => s.name).join(', ')}` })
  refresh()
  return ok(`Setup links sent to ${pending.length} ${pending.length === 1 ? 'person' : 'people'}.`)
})

const money = z.coerce.number().min(0).max(1_000_000)

/** The TDS rules textarea: blank restores the defaults; anything else must parse and validate. */
function parseTaxRulesJson(text: string | undefined): { rules?: TaxRules; error: string | null } {
  if (!text) return { error: null }
  try {
    const raw: unknown = JSON.parse(text)
    const read = readTaxRules(raw)
    return read.error ? { error: read.error } : { rules: read.rules, error: null }
  } catch {
    return { error: 'This is not valid JSON. Copy the current rules, edit the numbers only, and paste them back.' }
  }
}
const count = z.coerce.number().int().min(0).max(10_000)

export const saveConsoleSettings = consoleAction(
  'settings.edit',
  z.object({
    prices: z.record(z.string(), money).default({}),
    limits: z.object({
      freeSeats: count,
      freeMonths: count,
      trialDays: count,
      salesExtensionDays: count,
      setupsPerWeek: count,
      yearlyDiscountPercent: z.coerce.number().int('Use a whole number').min(0, 'Use 0 to 90').max(MAX_FIRST_YEAR_DISCOUNT_PERCENT, 'Use 0 to 90'),
    }),
    templates: z.object(Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, z.string().trim().max(1000)])) as Record<(typeof TEMPLATE_KEYS)[number], z.ZodString>),
    helpLinks: z.object(Object.fromEntries(HANDOVER_STEPS.map((k) => [k, z.string().trim().max(500)])) as Record<(typeof HANDOVER_STEPS)[number], z.ZodString>),
    whatsapp: z
      .object({
        templates: z.record(z.string(), z.object({ name: z.string().trim().max(512), language: z.string().trim().max(10), params: z.string().trim().max(200) })).default({}),
        rates: z.record(z.string(), z.coerce.number().min(0).max(99)).default({}),
      })
      .optional(),
    wallet: z
      .object({
        rates: z.record(z.string(), z.coerce.number().min(0).max(100)).default({}),
        byoFee: z.coerce.number().min(0).max(100).default(0),
        lowBalance: z.coerce.number().min(0).max(1_000_000).default(200),
        allowance: z.record(z.string(), count).default({}),
      })
      .optional(),
    features: z.object({ whatsapp: checkbox }).optional(),
    ai: z.object({ caps: z.record(z.string(), count).default({}) }).optional(),
    meetings: z.object({ caps: z.record(z.string(), z.coerce.number().min(0).max(10_000)).default({}) }).optional(),
    /** Salary TDS rules as JSON (modules/muster/tax/rules). */
    taxRules: z.string().trim().max(20_000).optional(),
  }),
  async (input, p) => {
    const waTemplates = Object.fromEntries(Object.entries(input.whatsapp?.templates ?? {}).map(([k, t]) => [k, { name: t.name, language: t.language, params: t.params.split(',').map((x) => x.trim()).filter(Boolean) }]))
    const paise = (rupees: number) => Math.round(rupees * 100)
    const wallet = input.wallet ? { rates: Object.fromEntries(Object.entries(input.wallet.rates).map(([k, v]) => [k, paise(v)])), byoFeePaise: paise(input.wallet.byoFee), lowBalancePaise: paise(input.wallet.lowBalance), allowance: input.wallet.allowance } : undefined
    const tax = parseTaxRulesJson(input.taxRules)
    if (tax.error) return fail('The salary TDS rules need attention.', { taxRules: tax.error })
    const next = mergeConsoleSettings({ ...input, tax: tax.rules, whatsapp: { templates: waTemplates as never, rates: (input.whatsapp?.rates ?? {}) as never }, wallet: wallet as never, features: { whatsapp: input.features?.whatsapp ?? false }, ai: { caps: (input.ai?.caps ?? {}) as never }, meetings: { caps: (input.meetings?.caps ?? {}) as never } })
    const bad = HANDOVER_STEPS.filter((k) => input.helpLinks[k] && next.helpLinks[k] !== input.helpLinks[k])
    if (bad.length) return fail('Help links must start with https:// or /, or be #.', Object.fromEntries(bad.map((k) => [`helpLinks.${k}`, 'Use https://…, /… or #'])))
    const badWa = WA_TEMPLATE_KEYS.filter((k) => waTemplates[k] && (next.whatsapp.templates[k].name !== waTemplates[k].name || next.whatsapp.templates[k].language !== waTemplates[k].language || next.whatsapp.templates[k].params.join(',') !== waTemplates[k].params.join(',')))
    if (badWa.length) return fail('Some WhatsApp templates need attention: lower-case names with _, a language like en or en_US, and only the listed variables.', Object.fromEntries(badWa.map((k) => [`whatsapp.templates.${k}.name`, 'Check the name, language and variables'])))
    const before = mergeConsoleSettings((await p.raw(ConsoleSettings).findOne({ key: 'global' }).lean()) as Parameters<typeof mergeConsoleSettings>[0])
    await p.raw(ConsoleSettings).updateOne({ key: 'global' }, { $set: { ...next, updatedBy: p.staff.id } }, { upsert: true })
    await p.audit({
      action: 'console.settings_saved',
      summary: `Saved Console settings (prices, limits incl. a ${next.limits.yearlyDiscountPercent}% first-year yearly discount, templates, help links, WhatsApp templates and rates, wallet prices, feature switches, AI caps, meeting hours, salary TDS rules)`,
      meta: { yearlyDiscountPercent: { before: before.limits.yearlyDiscountPercent, after: next.limits.yearlyDiscountPercent } },
    })
    refresh()
    return ok('Settings saved.')
  },
)
