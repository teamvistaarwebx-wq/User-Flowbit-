import 'server-only'
import type { Model, Types } from 'mongoose'
import { hasAddOn } from '@/lib/addons'
import { aiMonthIST } from '@/lib/ai-caps'
import type { Scoped } from '@/lib/db/scoped'
import type { Entitlements } from '@/lib/entitlements'
import { DEFAULT_MEETING_CAPS, meetingAllowance, meetingCapSeconds, type MeetingAllowance, type MeetingCaps } from '@/lib/meeting-caps'
import type { OrgLike } from '@/lib/plans'
import { MeetingAiUsage } from '@/models/work/MeetingAiUsage'
import { consoleSettings } from '@/modules/console/settings-query'

/** The Meetings AI hours cap: the add-on (or a trial), then transcribed seconds this IST month against the Console cap. */

export type UsageCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: <M extends Model<any>>(model: M) => Scoped<M>
  entitlements: Pick<Entitlements, 'accountType'>
  org: OrgLike & { subscription?: (OrgLike['subscription'] & { seats?: number | null }) | null }
}

async function caps(): Promise<MeetingCaps> {
  try {
    return (await consoleSettings()).meetings.caps
  } catch (error) {
    console.error('[meetings-ai] Console settings unreadable; using the default hours', error)
    return DEFAULT_MEETING_CAPS
  }
}

export async function usedSecondsThisMonth(ctx: Pick<UsageCtx, 'db'>, at: Date = new Date()): Promise<number> {
  const [row] = await ctx.db(MeetingAiUsage).aggregate<{ seconds: number }>([{ $match: { month: aiMonthIST(at) } }, { $group: { _id: null, seconds: { $sum: '$seconds' } } }])
  return row?.seconds ?? 0
}

export async function meetingAllowanceFor(ctx: UsageCtx, needSeconds = 1): Promise<MeetingAllowance> {
  if (!hasAddOn(ctx.org, 'meetings_ai')) return meetingAllowance(0, 0, needSeconds)
  const cap = meetingCapSeconds(await caps(), ctx.entitlements.accountType, ctx.org.subscription?.seats ?? 1)
  return meetingAllowance(cap, await usedSecondsThisMonth(ctx), needSeconds)
}

/** One row per transcript (unique), so a repeated callback never counts twice. */
export async function recordMeetingUsage(ctx: Pick<UsageCtx, 'db'>, input: { meetingId: Types.ObjectId; transcriptId: Types.ObjectId; seconds: number; provider: string }): Promise<void> {
  try {
    await ctx.db(MeetingAiUsage).create({ ...input, seconds: Math.max(0, Math.round(input.seconds)), month: aiMonthIST() })
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error
  }
}
