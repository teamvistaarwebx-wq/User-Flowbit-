import type { NextRequest } from 'next/server'
import { Types } from 'mongoose'
import { blockedResponse, getCtx, routeRefused, type Ctx } from '@/lib/ctx'
import { minutesOfDayIST, monthOf, todayIST } from '@/lib/dates'
import { AttendanceDay } from '@/models/AttendanceDay'
import { EXPORT_CODE } from '@/modules/muster/attendance/import'
import { getMonthRegister, getRegister } from '@/modules/muster/attendance/queries'
import { resolveRange } from '@/modules/muster/attendance/range'
import { CELL_META } from '@/modules/muster/attendance/register'
import { toCsv } from '@/modules/muster/import/csv'

export const runtime = 'nodejs'
export const maxDuration = 300

const csv = (body: string, filename: string) =>
  new Response(`﻿${body}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } })

/** 'HH:MM' (24-hour, IST) so the file can be imported again. */
const hhmm = (at: Date | null | undefined) => {
  if (!at) return ''
  const minutes = minutesOfDayIST(at)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** One row per person and day (code, name, date, status, in, out, note, source): the import's own layout. */
async function rangeCsv(ctx: Ctx, from: string, to: string, departmentId?: string): Promise<Response> {
  const range = resolveRange({ range: 'custom', from, to }, todayIST())
  const register = await getRegister(ctx, { start: range.start, end: range.end }, { departmentId })
  const memberIds = register.rows.flatMap((r) => (r.memberId ? [new Types.ObjectId(r.memberId)] : []))
  const days = memberIds.length ? await ctx.db(AttendanceDay).find({ memberId: { $in: memberIds }, date: { $gte: range.start, $lte: range.end } }, { memberId: 1, date: 1, firstIn: 1, lastOut: 1 }).lean() : []
  const times = new Map(days.map((d) => [`${d.memberId}|${d.date}`, d]))
  const columns = ['code', 'name', 'date', 'status', 'in', 'out', 'note', 'source']
  const rows = register.rows.flatMap((r) =>
    r.cells
      .filter((c) => c.status !== 'na' && c.status !== 'upcoming')
      .map((c) => {
        const t = r.memberId ? times.get(`${r.memberId}|${c.date}`) : undefined
        return { code: r.code, name: r.name, date: c.date, status: EXPORT_CODE[c.status] ?? '', in: hhmm(t?.firstIn), out: hhmm(t?.lastOut), note: c.note ?? '', source: c.assumed ? 'assumed (not marked)' : CELL_META[c.status].label }
      }),
  )
  return csv(toCsv(rows, columns), `attendance-${range.start}-to-${range.end}.csv`)
}

/** Month register as CSV (one column per day), or with ?from=&to= one row per person and day. */
export async function GET(request: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster') || !ctx.can('attendance.read')) return new Response('Not allowed', { status: 403 })
  const sp = request.nextUrl.searchParams
  const dept = sp.get('dept') ?? undefined
  if (sp.get('from') && sp.get('to')) return rangeCsv(ctx, sp.get('from')!, sp.get('to')!, dept)
  const raw = sp.get('month') ?? ''
  if (raw && !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return new Response('Use a real month as YYYY-MM, for example 2026-10.', { status: 400 })
  const month = raw || monthOf(todayIST())
  const register = await getMonthRegister(ctx, month, { departmentId: dept })
  const totals = ['Working days', 'Payable days', 'LOP days', 'Present', 'WFH', 'Late', 'Half days', 'Absent', 'Leave', 'Sick leave', 'Unpaid leave']
  const columns = ['Code', 'Name', 'Department', ...register.days.map((d) => d.slice(8)), ...totals]
  const rows = register.rows.map((r) => ({
    Code: r.code, Name: r.name, Department: r.department ?? '',
    ...Object.fromEntries(r.cells.map((c) => [c.date.slice(8), CELL_META[c.status].short])),
    'Working days': r.summary.workingDays, 'Payable days': r.summary.payableDays, 'LOP days': r.summary.lopDays, Present: r.summary.presentDays, WFH: r.summary.wfhDays, Late: r.summary.lateDays,
    'Half days': r.summary.halfDays, Absent: r.summary.absentDays, Leave: r.summary.leaveDays, 'Sick leave': r.summary.sickLeaveDays, 'Unpaid leave': r.summary.unpaidLeaveDays,
  }))
  return csv(toCsv(rows, columns), `attendance-${month}.csv`)
}
