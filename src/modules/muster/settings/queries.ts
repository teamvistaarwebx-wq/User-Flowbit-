import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { DEFAULT_WORK_WEEK, weekday } from '@/lib/dates'
import { Holiday } from '@/models/muster/Holiday'
import { MusterPolicy } from '@/models/muster/Policy'
import { readPolicy, type Policy } from './defaults'

type DbCtx = Pick<Ctx, 'db' | 'org'>

/** The workspace's Muster policy, with defaults for anything missing. */
export async function getPolicy(ctx: Pick<Ctx, 'db'>): Promise<Policy> {
  const doc = await ctx.db(MusterPolicy).findOne({}).lean()
  return readPolicy(doc)
}

export type OrgCalendar = {
  workWeek: number[]
  /** Company (non-optional) holiday dates. */
  holidays: string[]
  holidayNames: Map<string, string>
  isWorkday: (date: string) => boolean
}

/** Work week and company holidays between two dates (optional holidays excluded). */
export async function orgCalendar(ctx: DbCtx, from: string, to: string): Promise<OrgCalendar> {
  const workWeek = ctx.org.workWeek?.length ? [...ctx.org.workWeek] : [...DEFAULT_WORK_WEEK]
  const rows = await ctx.db(Holiday).find({ date: { $gte: from, $lte: to }, isOptional: { $ne: true } }).lean()
  const holidayNames = new Map(rows.map((h) => [h.date, h.name]))
  return { workWeek, holidays: [...holidayNames.keys()], holidayNames, isWorkday: (d) => workWeek.includes(weekday(d)) }
}
