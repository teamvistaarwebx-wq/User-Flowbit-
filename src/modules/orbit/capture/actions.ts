'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { encryptionKey } from '@/lib/env'
import { lastFour, sealSecret } from '@/lib/secret-box'
import { checkbox, listOf, objectId } from '@/lib/validation'
import { Member } from '@/models/Member'
import { LeadCapture } from '@/models/orbit/LeadCapture'
import { ASSIGN_MODES } from './assign'
import { cleanOrigins, normaliseOrigin, originAllowed } from './guard'
import { pullIndiamart } from './indiamart-job'
import { getLeadCapture, newCaptureKey } from './settings'

/** Orbit → Settings → Lead capture: the website form, the webhook, IndiaMART and who new leads go to (orbit.settings). */

const OPTS = { product: 'orbit', perm: 'orbit.settings' } as const
const PATH = '/app/orbit/settings'
const refresh = () => revalidatePath(PATH)

function requireKey(): Buffer | null {
  return encryptionKey()
}

export const saveLeadFormAction = action(
  z.object({ formEnabled: checkbox, allowedOrigins: z.string().max(4000).optional().default(''), thankYouUrl: z.string().trim().max(500).optional().default('') }),
  async (input, ctx) => {
    await getLeadCapture(ctx.orgId)
    const origins = cleanOrigins(input.allowedOrigins.split(/[\n,]+/))
    if (input.formEnabled && !origins.length) return fail('Add the website the form lives on, for example https://acme.in.', { allowedOrigins: 'Add at least one website' })
    const thankYou = input.thankYouUrl ? normaliseOrigin(input.thankYouUrl) && input.thankYouUrl : ''
    if (input.thankYouUrl && (!thankYou || !originAllowed(input.thankYouUrl, null, origins))) return fail('The thank-you page must be on one of your websites.', { thankYouUrl: 'Use a page on a listed website' })
    await LeadCapture.updateOne({ orgId: ctx.orgId }, { $set: { formEnabled: input.formEnabled, allowedOrigins: origins, thankYouUrl: thankYou || '' } })
    await audit(ctx, { action: 'orbit.lead_form_saved', entity: 'LeadCapture', entityId: ctx.orgId, summary: `Website lead form ${input.formEnabled ? 'on' : 'off'} (${origins.join(', ') || 'no sites'})`, product: 'orbit' })
    refresh()
    return ok(input.formEnabled ? 'Website form is on.' : 'Website form is off.')
  },
  OPTS,
)

export const regenerateCaptureKeyAction = action(
  z.object({ which: z.enum(['form', 'hook']) }),
  async ({ which }, ctx) => {
    await getLeadCapture(ctx.orgId)
    await LeadCapture.updateOne({ orgId: ctx.orgId }, { $set: which === 'form' ? { formKey: newCaptureKey() } : { hookKey: newCaptureKey() } })
    await audit(ctx, { action: 'orbit.capture_key_changed', entity: 'LeadCapture', entityId: ctx.orgId, summary: `New ${which === 'form' ? 'website form' : 'webhook'} URL; the old one stopped working`, product: 'orbit' })
    refresh()
    return ok('New URL made. Update it on your website or in Zapier: the old one no longer works.')
  },
  OPTS,
)

/** Switches the webhook and, when asked, makes a new token (shown once). */
export const saveLeadHookAction = action(
  z.object({ hookEnabled: checkbox, newToken: checkbox }),
  async (input, ctx) => {
    const key = requireKey()
    if (!key) return fail('This server cannot store tokens yet: APP_ENCRYPTION_KEY is not set.')
    const current = await getLeadCapture(ctx.orgId)
    const token = input.newToken || !current.hookTokenLast4 ? randomBytes(24).toString('base64url') : null
    await LeadCapture.updateOne({ orgId: ctx.orgId }, { $set: { hookEnabled: input.hookEnabled, ...(token ? { hookTokenSealed: sealSecret(token, key), hookTokenLast4: lastFour(token) } : {}) } })
    await audit(ctx, { action: 'orbit.lead_hook_saved', entity: 'LeadCapture', entityId: ctx.orgId, summary: `Lead webhook ${input.hookEnabled ? 'on' : 'off'}${token ? ', new token' : ''}`, product: 'orbit' })
    refresh()
    return ok(token ? 'Saved. Copy the token now: it is shown only once.' : 'Saved.', token ? { token } : undefined)
  },
  OPTS,
)

export const saveLeadAssignmentAction = action(
  z.object({ assignMode: z.enum(ASSIGN_MODES), ownerMemberId: z.preprocess((v) => (v === '' ? undefined : v), objectId.optional()), poolMemberIds: listOf(objectId) }),
  async (input, ctx) => {
    const ids = [...new Set([...(input.ownerMemberId ? [input.ownerMemberId] : []), ...input.poolMemberIds])]
    const active = await ctx.db(Member).countDocuments({ _id: { $in: ids }, status: 'active' })
    if (active !== ids.length) return fail('Pick active members of this workspace.')
    if (input.assignMode === 'round_robin' && input.poolMemberIds.length < 1) return fail('Pick who takes turns.', { poolMemberIds: 'Pick at least one person' })
    await getLeadCapture(ctx.orgId)
    await LeadCapture.updateOne({ orgId: ctx.orgId }, { $set: { assignMode: input.assignMode, ownerMemberId: input.ownerMemberId ?? null, poolMemberIds: input.poolMemberIds } })
    refresh()
    return ok(input.assignMode === 'round_robin' ? `New leads go round-robin to ${input.poolMemberIds.length} people.` : 'New leads go to the chosen owner.')
  },
  OPTS,
)

export const saveIndiamartAction = action(
  z.object({ enabled: checkbox, crmKey: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().min(10, 'That key looks too short').max(200).optional()) }),
  async (input, ctx) => {
    const key = requireKey()
    if (!key) return fail('This server cannot store keys yet: APP_ENCRYPTION_KEY is not set.')
    const current = await getLeadCapture(ctx.orgId)
    if (input.enabled && !input.crmKey && !current.indiamart.keyLast4) return fail('Paste your IndiaMART CRM key.', { crmKey: 'Required' })
    await LeadCapture.updateOne({ orgId: ctx.orgId }, { $set: { 'indiamart.enabled': input.enabled, ...(input.crmKey ? { 'indiamart.keySealed': sealSecret(input.crmKey, key), 'indiamart.keyLast4': lastFour(input.crmKey), 'indiamart.lastError': '' } : {}) } })
    await audit(ctx, { action: 'orbit.indiamart_saved', entity: 'LeadCapture', entityId: ctx.orgId, summary: `IndiaMART pull ${input.enabled ? 'on' : 'off'}${input.crmKey ? ', new CRM key' : ''}`, product: 'orbit' })
    refresh()
    return ok(input.enabled ? 'IndiaMART is on. New enquiries arrive every 15 minutes.' : 'IndiaMART is off.')
  },
  OPTS,
)

export const pullIndiamartNowAction = action(
  z.object({}),
  async (_input, ctx) => {
    const outcome = await pullIndiamart(ctx.orgId)
    refresh()
    revalidatePath('/app/orbit/leads')
    if (outcome.error) return fail(`IndiaMART: ${outcome.error}`)
    return ok(outcome.created ? `${outcome.created} new ${outcome.created === 1 ? 'lead' : 'leads'} from IndiaMART.` : 'No new IndiaMART enquiries (IndiaMART allows one check every 5 minutes).')
  },
  OPTS,
)
