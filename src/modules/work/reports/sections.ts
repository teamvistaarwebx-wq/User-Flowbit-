export const REPORT_SECTIONS = ['throughput', 'overdue', 'assignees', 'projects', 'time'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]
export const SECTION_LABELS: Record<ReportSection, string> = { throughput: 'Throughput', overdue: 'Overdue', assignees: 'By assignee', projects: 'Project health', time: 'Time by project' }
export const isSection = (v: string | undefined): v is ReportSection => (REPORT_SECTIONS as readonly string[]).includes(v ?? '')
