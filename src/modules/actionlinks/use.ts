import type { ActionResult } from '@/lib/action-types'
import { isActionChoice, noteProblem, type ActionChoice, type ActionKind } from './kinds'
import { hashActionKey, LINK_PROBLEM_TEXT, linkProblem, readActionToken, type ActionTokenState, type LinkProblem, type Viewer } from './token'

/**
 * Using a one-time action link (pure orchestration, storage injected): check
 * the signature, find the link, check it is live, unused, for this person
 * and offers this choice, claim it atomically (two clicks or a scanner and a
 * human cannot both run it), run the decision through the app's own checks,
 * then mark it used. A decision the app refuses (a locked month, someone
 * decided first, no permission any more) releases the claim and says why.
 */

export type ActionRow = ActionTokenState & Readonly<{ id: string; orgId: string; kind: ActionKind; subjectId: string; memberId: string }>

export type UseDeps = Readonly<{
  secret: string
  find: (keyHash: string) => Promise<ActionRow | null>
  /** Atomically marks the link as being used; false when another request has it. */
  claim: (id: string, now: Date) => Promise<boolean>
  /** ok: the link is spent. Not ok: the claim is released so the person can try again or use the app. */
  finish: (id: string, outcome: Readonly<{ ok: boolean; choice: ActionChoice; message: string }>) => Promise<void>
  execute: (row: ActionRow, choice: ActionChoice, note: string | null) => Promise<ActionResult<unknown>>
}>

export type UseInput = Readonly<{ token: string; choice: string; note?: string | null; viewer: Viewer; now: Date }>

export type UseResult = Readonly<{ ok: true; message: string; row: ActionRow }> | Readonly<{ ok: false; reason: LinkProblem | 'invalid' | 'note' | 'refused'; message: string; row?: ActionRow }>

const problem = (reason: LinkProblem | 'invalid', row?: ActionRow): UseResult => ({ ok: false, reason, message: LINK_PROBLEM_TEXT[reason], row })

/** The link a token points at and whether it can be used now, without claiming it (the landing page). */
export async function inspectActionLink(deps: Pick<UseDeps, 'secret' | 'find'>, token: string): Promise<ActionRow | null> {
  const key = readActionToken(token, deps.secret)
  return key ? deps.find(hashActionKey(key)) : null
}

export async function spendActionLink(deps: UseDeps, input: UseInput): Promise<UseResult> {
  const row = await inspectActionLink(deps, input.token)
  if (!row) return problem('invalid')
  if (!isActionChoice(input.choice)) return problem('wrong_choice', row)
  const found = linkProblem(row, input.viewer, input.choice, input.now)
  if (found) return problem(found, row)
  const note = input.note?.trim() || null
  const badNote = noteProblem(row.kind, input.choice, note)
  if (badNote) return { ok: false, reason: 'note', message: badNote, row }
  if (!(await deps.claim(row.id, input.now))) return problem('busy', row)
  let result: ActionResult<unknown>
  try {
    result = await deps.execute(row, input.choice, note)
  } catch (error) {
    await deps.finish(row.id, { ok: false, choice: input.choice, message: 'failed' })
    throw error
  }
  if (!result.ok) {
    await deps.finish(row.id, { ok: false, choice: input.choice, message: result.error })
    return { ok: false, reason: 'refused', message: result.error, row }
  }
  const message = result.message ?? 'Done.'
  await deps.finish(row.id, { ok: true, choice: input.choice, message })
  return { ok: true, message, row }
}
