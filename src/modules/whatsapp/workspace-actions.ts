'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Permission } from '@/lib/catalog'
import { firstName } from '@/lib/utils'
import { WaConnection } from '@/models/whatsapp/WaConnection'
import { recordTest, saveByoConnection, saveTemplateMapping, disconnectWhatsApp, connectionInfo } from './connection'
import { cleanTemplateDef, CUSTOMER_TEMPLATE_KEYS, CUSTOMER_TEMPLATE_SHAPES, mergeCustomerTemplates, type CustomerTemplateKey } from './customer-templates'
import { normalizePhone } from './phone'
import { sendWorkspaceTemplate } from './workspace-send'
import { assertWhatsAppOn } from '@/modules/features/flags'

/** Settings → Integrations → WhatsApp (WhatsApp B): connect, test, template mapping, disconnect. `org.manage` only. */

const PATH = '/app/settings/integrations/whatsapp'
const MANAGE = { perm: 'org.manage' } as const

const optionalSecret = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().min(8, 'That looks too short').max(500).optional())

const refresh = () => {
  revalidatePath(PATH)
  revalidatePath('/app', 'layout')
}

export const saveWhatsAppAction = action(
  z.object({
    apiKey: optionalSecret,
    webhookSecret: optionalSecret,
    displayName: z.string().trim().min(2, 'Enter the name customers see on WhatsApp').max(80),
    phone: z.string().trim().min(6, 'Enter the WhatsApp number').max(24),
  }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const phone = normalizePhone(input.phone)
    if (!phone) return fail('Enter the WhatsApp number with its country code, like +91 98765 43210.', { phone: 'Not a valid number' })
    const info = await saveByoConnection(ctx.orgId, { ...input, phone, userId: ctx.userId })
    // Never the secrets themselves: only which ones changed.
    await audit(ctx, { action: 'whatsapp.connected', entity: 'WaConnection', entityId: ctx.orgId, summary: `WhatsApp (own Interakt account) saved for ${phone}${input.apiKey ? ', new API key' : ''}${input.webhookSecret ? ', new webhook secret' : ''}` })
    refresh()
    return ok(info.connected ? 'WhatsApp connected. Add the webhook URL in Interakt, then send a test.' : 'Saved.')
  },
  MANAGE,
)

export const disconnectWhatsAppAction = action(
  z.object({}),
  async (_input, ctx) => {
    await assertWhatsAppOn()
    const removed = await disconnectWhatsApp(ctx.orgId)
    if (removed) await audit(ctx, { action: 'whatsapp.disconnected', entity: 'WaConnection', entityId: ctx.orgId, summary: 'WhatsApp disconnected; the API key and webhook secret were deleted' })
    refresh()
    return ok(removed ? 'Disconnected. The API key and webhook secret are deleted from Flowbit, and the old webhook URL stops working.' : 'WhatsApp was not connected.')
  },
  MANAGE,
)

const TESTABLE = CUSTOMER_TEMPLATE_KEYS.filter((k) => CUSTOMER_TEMPLATE_SHAPES[k].header === 'none')

const SAMPLE: Readonly<Record<string, string>> = { update: 'this is a test message from Flowbit.', item: 'a test approval', summary: '3 tasks due, 1 meeting', meeting: 'Test meeting at 4 pm', decision: 'this is a test of leave decisions', number: 'INV/TEST/0001', amount: '₹1,000', dueDate: 'today', days: '3', sender: 'Flowbit' }

export const testWhatsAppAction = action(
  z.object({ to: z.string().trim().min(6, 'Enter a number').max(24), key: z.enum(TESTABLE as [CustomerTemplateKey, ...CustomerTemplateKey[]]).default('task_alert') }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const info = await connectionInfo(ctx.orgId)
    if (!info.connected) return fail('Connect WhatsApp first.')
    const values = { ...SAMPLE, name: firstName(ctx.user.name), business: ctx.org.name }
    const result = await sendWorkspaceTemplate({ orgId: ctx.orgId, to: input.to, key: input.key, values, extras: { buttonValue: 'app' }, kind: 'whatsapp_test', event: 'whatsapp.test', essential: true, userId: ctx.userId, title: 'WhatsApp test message', note: `Test sent by ${ctx.user.name}` })
    const error = result.ok ? undefined : result.error
    await recordTest(ctx.orgId, { ok: result.ok, to: normalizePhone(input.to) ?? input.to, error })
    refresh()
    if (!result.ok) return fail(`The test did not go out: ${error ?? 'unknown error'}`)
    return ok(result.status === 'sent' ? 'Test sent. It should arrive on that phone in a few seconds.' : 'Test queued. Check Settings → Messages log for its status.')
  },
  MANAGE,
)

/** The template mapping: name, language, category and variable order per Flowbit template. */
export const saveTemplateMappingAction = action(
  z.object({ templates: z.record(z.string(), z.object({ name: z.string().trim().max(512), language: z.string().trim().max(10), category: z.string().trim().max(20), params: z.string().trim().max(300) })).default({}) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const rows = Object.entries(input.templates).filter(([k]) => (CUSTOMER_TEMPLATE_KEYS as readonly string[]).includes(k))
    const parsed = rows.map(([k, t]) => [k, { name: t.name, language: t.language, category: t.category, params: t.params.split(',').map((x) => x.trim()).filter(Boolean) }] as const)
    const bad = parsed.filter(([k, t]) => !cleanTemplateDef(k as CustomerTemplateKey, t))
    if (bad.length) return fail('Some templates need attention: lower-case names with _, a language like en or hi, and only the listed variables.', Object.fromEntries(bad.map(([k]) => [`templates.${k}.name`, 'Check the name, language and variables'])))
    await saveTemplateMapping(ctx.orgId, mergeCustomerTemplates(Object.fromEntries(parsed)))
    await audit(ctx, { action: 'whatsapp.templates_saved', entity: 'WaConnection', entityId: ctx.orgId, summary: `WhatsApp template mapping saved (${parsed.length} templates)` })
    refresh()
    return ok('Template mapping saved.')
  },
  MANAGE,
)

/** The employee WhatsApp bot (§0b.17): only with the workspace's own Interakt account (BYO). */
export const setWhatsAppBotAction = action(
  z.object({ enabled: z.boolean() }),
  async ({ enabled }, ctx) => {
    await assertWhatsAppOn()
    const info = await connectionInfo(ctx.orgId)
    if (enabled && (!info.connected || info.mode !== 'byo')) return fail('Connect WhatsApp with your own Interakt account first.')
    await WaConnection.updateOne({ orgId: ctx.orgId }, { $set: { botEnabled: enabled } })
    await audit(ctx, { action: enabled ? 'whatsapp.bot_on' : 'whatsapp.bot_off', entity: 'WaConnection', entityId: ctx.orgId, summary: `Employee WhatsApp bot turned ${enabled ? 'on' : 'off'}` })
    refresh()
    return ok(enabled ? 'Employee bot is on. Employees with a verified, opted-in number can write menu to your WhatsApp number.' : 'Employee bot is off.')
  },
  MANAGE,
)

const MAX_CANNED = 30
const INBOX_PERMS = { anyPerm: ['clients.write', 'activities.write', 'collections.write'] as Permission[] }

/** Saved replies for the inbox: anyone who can reply there can add or remove them. */
export const saveCannedReplyAction = action(
  z.object({ title: z.string().trim().min(2, 'Give it a short name').max(60), text: z.string().trim().min(2, 'Write the reply').max(1000) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const res = await WaConnection.updateOne({ orgId: ctx.orgId, [`cannedReplies.${MAX_CANNED - 1}`]: { $exists: false } }, { $push: { cannedReplies: { title: input.title, text: input.text } } })
    if (!res.modifiedCount) return fail(`Keep at most ${MAX_CANNED} saved replies, or connect WhatsApp first.`)
    revalidatePath('/app/whatsapp', 'layout')
    revalidatePath(PATH)
    return ok(`Saved reply "${input.title}" added.`)
  },
  INBOX_PERMS,
)

export const deleteCannedReplyAction = action(
  z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) }),
  async ({ id }, ctx) => {
    await assertWhatsAppOn()
    await WaConnection.updateOne({ orgId: ctx.orgId }, { $pull: { cannedReplies: { _id: id } } })
    revalidatePath('/app/whatsapp', 'layout')
    revalidatePath(PATH)
    return ok('Saved reply removed.')
  },
  INBOX_PERMS,
)
