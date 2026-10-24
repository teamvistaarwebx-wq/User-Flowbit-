import type { Ctx } from '@/lib/ctx'
import type { ReportScope } from '@/modules/work/reports/scope'
import type { ReportSection } from '@/modules/work/reports/sections'
import { assigneeReport, overdueReport, projectHealthReport, throughputReport } from '@/modules/work/reports/task-reports'
import { timeReport } from '@/modules/work/reports/time-report'
import { ProjectSection, TimeSection } from './other-sections'
import { AssigneeSection, OverdueSection, ThroughputSection } from './task-sections'

type Props = { ctx: Ctx; section: ReportSection; range: { from: string; to: string }; scope: ReportScope; approvedOnly: boolean; approvedHref: string }

/** Loads only the selected section's data and renders it (server component). */
export async function ReportSectionHost({ ctx, section, range, scope, approvedOnly, approvedHref }: Props) {
  switch (section) {
    case 'throughput':
      return <ThroughputSection data={await throughputReport(ctx, range, scope)} />
    case 'overdue':
      return <OverdueSection data={await overdueReport(ctx, scope)} />
    case 'assignees':
      return <AssigneeSection data={await assigneeReport(ctx, range, scope, approvedOnly)} />
    case 'projects':
      return <ProjectSection data={await projectHealthReport(ctx, range, scope, approvedOnly)} />
    case 'time':
      return <TimeSection data={await timeReport(ctx, range, scope, approvedOnly)} approvedHref={approvedHref} approvedOnly={approvedOnly} />
  }
}
