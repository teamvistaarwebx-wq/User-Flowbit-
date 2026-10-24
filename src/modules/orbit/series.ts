import 'server-only'
import type { Model } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { addDays, eachDay } from '@/lib/dates'
import type { Filter } from './scope'
import { istRange } from './time-ranges'

const TZ = 'Asia/Kolkata'

/** Count per IST day for the last `days` days ending `today` (zeros filled). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dailyCounts(ctx: Ctx, model: Model<any>, match: Filter, field: string, days: number, today: string): Promise<{ days: string[]; counts: number[] }> {
  const list = eachDay(addDays(today, -(days - 1)), today)
  const { start, end } = istRange(list[0], today)
  const rows = await ctx.db(model).aggregate<{ _id: string; n: number }>([
    { $match: { ...match, [field]: { $gte: start, $lt: end } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ } }, n: { $sum: 1 } } },
  ])
  const byDay = new Map(rows.map((r) => [r._id, r.n]))
  return { days: list, counts: list.map((d) => byDay.get(d) ?? 0) }
}
