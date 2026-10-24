import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { SequenceSendCount } from '@/models/orbit/SequenceSendCount'
import type { ExitReason } from './rules'

/** Enrolment writes shared by the runner and the actions. */

type Scope = Pick<Ctx, 'db'>
type Id = Types.ObjectId | string

/** Stops every live enrolment of these leads (Replied, removed, lead closed). Returns how many stopped. */
export async function exitLeadEnrollments(scope: Scope, leadIds: readonly Id[], reason: ExitReason, at: Date = new Date()): Promise<number> {
  if (!leadIds.length) return 0
  const res = await scope.db(SequenceEnrollment).updateMany({ leadId: { $in: leadIds }, status: 'active' }, { $set: { status: 'exited', exitReason: reason, finishedAt: at, claimedUntil: null } })
  return res.modifiedCount
}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/**
 * Takes one send from the sender's daily allowance, atomically: false when
 * `cap` is already used today. The first send of the day creates the counter;
 * when two runs create it at once, the unique index lets one win and the
 * other falls back to the conditional increment.
 */
export async function takeDailySend(scope: Scope, memberId: Id, day: string, cap: number): Promise<boolean> {
  if (cap <= 0) return false
  const increment = () => scope.db(SequenceSendCount).findOneAndUpdate({ memberId, day, count: { $lt: cap } }, { $inc: { count: 1 } }, { returnDocument: 'after' }).lean()
  if (await increment()) return true
  try {
    await scope.db(SequenceSendCount).create({ memberId, day, count: 1 })
    return true
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    return Boolean(await increment())
  }
}

/** Gives a send back when the email did not go out. */
export async function returnDailySend(scope: Scope, memberId: Id, day: string): Promise<void> {
  await scope.db(SequenceSendCount).updateOne({ memberId, day, count: { $gt: 0 } }, { $inc: { count: -1 } })
}
