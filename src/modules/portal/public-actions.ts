'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'
import { fail, ok, publicAction, toResultError, type ActionResult } from '@/lib/actions'
import { APPROVAL_DECISIONS } from './access'
import { decideApproval } from './approvals'
import { endPortalSession, getPortalViewer, portalPath, requestPortalCode, verifyPortalCode } from './session'

/** Client portal actions (no Flowbit member session): sign in with an emailed code, sign out, approve or ask for changes. */

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'Open the portal link again')
const email = z.string().trim().toLowerCase().email('Enter your email')

export const requestPortalCodeAction = publicAction(z.object({ slug, email }), async (input) => {
  const res = await requestPortalCode(input.slug, input.email)
  return res.ok ? ok(res.message) : fail(res.error)
})

export const verifyPortalCodeAction = publicAction(z.object({ slug, email, code: z.string().trim().min(6, 'Enter the 6-digit code').max(10) }), async (input) => {
  const res = await verifyPortalCode(input.slug, input.email, input.code)
  return res.ok ? ok('Signed in.', undefined, portalPath(input.slug)) : fail(res.error, { code: res.error })
})

export const portalSignOutAction = publicAction(z.object({ slug }), async (input) => {
  await endPortalSession(input.slug)
  return ok('Signed out.', undefined, portalPath(input.slug, '/login'))
})

const decisionSchema = z.object({ slug, taskId: z.string().regex(/^[a-f0-9]{24}$/i, 'Open the item again'), decision: z.enum(APPROVAL_DECISIONS), comment: z.string().max(2000).optional().default('') })

export async function decideApprovalAction(raw: z.input<typeof decisionSchema>): Promise<ActionResult> {
  try {
    const input = decisionSchema.parse(raw)
    const viewer = await getPortalViewer(input.slug)
    if (!viewer) return fail('Your session has ended. Sign in again.')
    const done = await decideApproval(viewer, input)
    revalidatePath(portalPath(input.slug))
    return ok(input.decision === 'approved' ? `Approved ${done.key}. The team has been told.` : `Sent. The team will make the changes to ${done.key}.`)
  } catch (error) {
    unstable_rethrow(error)
    return toResultError(error, 'portal.decide')
  }
}
