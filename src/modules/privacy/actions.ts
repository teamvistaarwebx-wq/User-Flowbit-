'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { ActionResult } from '@/lib/action-types'
import { audit } from '@/lib/audit'
import { eraseSubject, SUBJECT_LABEL } from './core'
import { subjectId, subjectRefSchema } from './refs'
import { loadSubject, mongoPrivacyStore } from './store'
import { findSubjects, type FoundSubject } from './search'

/**
 * DPDP erasure of one person's data in this workspace (owners and admins:
 * `org.manage`). The audit entry names the record id and what was removed,
 * never the person, so the log does not keep what was erased.
 */
export const erasePersonalData = action(
  z.object({ ref: subjectRefSchema, confirm: z.literal('ERASE', { error: 'Type ERASE to confirm' }) }),
  async (input, ctx) => {
    const subject = await loadSubject(ctx, input.ref)
    if (!subject) return fail('That person was not found in this workspace.')
    const result = await eraseSubject(mongoPrivacyStore(ctx), subject)
    if (!result.ok) return fail(result.error)
    const removed = Object.entries(result.counts).filter(([, n]) => n > 0).map(([c, n]) => `${c} ${n}`).join(', ')
    await audit(ctx, { action: 'privacy.erased', entity: input.ref.kind === 'lead' ? 'Lead' : input.ref.kind === 'member' ? 'Member' : 'Client', entityId: subjectId(input.ref), summary: `Erased the personal data of a ${SUBJECT_LABEL[input.ref.kind]} (DPDP request)${removed ? `: ${removed}` : ''}`, meta: { kind: input.ref.kind, counts: result.counts } })
    revalidatePath('/app', 'layout')
    return ok(`The ${SUBJECT_LABEL[input.ref.kind]}'s personal data was erased.`)
  },
  { perm: 'org.manage', allowReadOnly: true },
)

/** Settings → Privacy: people matching an email or phone number. */
export const searchPersonalData = action(
  z.object({ query: z.string().trim().min(5, 'Enter a full email address or phone number').max(200) }),
  async (input, ctx): Promise<ActionResult<FoundSubject[]>> => ok(undefined, await findSubjects(ctx, input.query)),
  { perm: 'org.manage', allowReadOnly: true },
)
