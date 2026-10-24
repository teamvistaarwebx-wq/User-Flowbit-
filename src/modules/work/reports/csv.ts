import 'server-only'
import Papa from 'papaparse'
import { PAPA_SAFE } from '@/lib/csv-safe'
import type { Ctx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { hoursDecimal, formatHM } from '../time/format'
import type { ReportSection } from './sections'
import { assigneeReport, overdueReport, projectHealthReport, throughputReport } from './task-reports'
import { timeReport } from './time-report'
import type { ReportScope } from './scope'

const pct = (v: number | null) => (v === null ? '' : `${v}%`)

/** CSV text for a report section (Indian dates, decimal hours and h:mm). */
export async function reportCsv(ctx: Ctx, section: ReportSection, range: { from: string; to: string }, scope: ReportScope, approvedOnly: boolean): Promise<string> {
  switch (section) {
    case 'throughput': {
      const r = await throughputReport(ctx, range, scope)
      return Papa.unparse(r.rows.map((x) => ({ Date: formatDate(x.date), Created: x.created, Completed: x.completed })), PAPA_SAFE)
    }
    case 'overdue': {
      const r = await overdueReport(ctx, scope)
      return Papa.unparse(r.table.map((x) => ({ Key: x.key, Task: x.title, Project: x.project, Assignees: x.assignees.join(', '), Due: formatDate(x.dueDate), 'Days overdue': x.days, Priority: x.priority })), PAPA_SAFE)
    }
    case 'assignees': {
      const rows = await assigneeReport(ctx, range, scope, approvedOnly)
      return Papa.unparse(rows.map((x) => ({ Member: x.name, Open: x.open, Completed: x.completed, Overdue: x.overdue, 'On time': pct(x.onTime), 'Avg cycle (days)': x.cycleDays ?? '', 'Logged hours': hoursDecimal(x.loggedMinutes), 'Logged h:mm': formatHM(x.loggedMinutes), 'Estimate variance': pct(x.variance) })), PAPA_SAFE)
    }
    case 'projects': {
      const rows = await projectHealthReport(ctx, range, scope, approvedOnly)
      return Papa.unparse(rows.map((x) => ({ Code: x.code, Project: x.name, Lead: x.lead, Status: x.status, Health: x.health, Score: x.score ?? '', 'Completion %': x.completion, Open: x.open, Overdue: x.overdue, Blocked: x.blocked, 'Timeline %': x.timeline ?? '', 'Days left': x.daysLeft ?? '', 'Logged hours': hoursDecimal(x.loggedMinutes) })), PAPA_SAFE)
    }
    case 'time': {
      const r = await timeReport(ctx, range, scope, approvedOnly)
      return Papa.unparse(r.detail.map((x) => ({ Project: x.project, Member: x.member, Date: formatDate(x.date), Task: x.task, Minutes: x.minutes, Hours: hoursDecimal(x.minutes), 'h:mm': formatHM(x.minutes), Billable: x.billable ? 'Yes' : 'No', Status: x.status })), PAPA_SAFE)
    }
  }
}
