import { PROJECT_STATUSES } from '@/modules/work/projects/constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/modules/work/tasks/constants'
import type { CsvRow } from '@/modules/muster/import/csv'
import type { CheckedRow } from '../types'
import { firstSeen, isRealDay, key, pick, rowResult } from './common'

/** Work import: projects, and tasks that may point at a project by code or name (pure). */

export const PROJECT_COLUMNS = [
  { key: 'name', required: true, example: 'Website relaunch' },
  { key: 'code', example: 'WEB-01', help: 'Left blank: PROJ-001, PROJ-002…' },
  { key: 'client', example: 'Acme Traders', help: 'An existing client name.' },
  { key: 'lead_email', example: 'riya.sharma@example.com', help: 'A member; blank = you.' },
  { key: 'status', example: 'active', help: PROJECT_STATUSES.join(', ') },
  { key: 'start_date', example: '2026-11-01' },
  { key: 'end_date', example: '2027-01-31' },
  { key: 'description', example: 'New site and blog' },
] as const

export const TASK_COLUMNS = [
  { key: 'title', required: true, example: 'Write the home page copy' },
  { key: 'project', example: 'WEB-01', help: 'Project code or name; blank = no project.' },
  { key: 'assignee_email', example: 'riya.sharma@example.com' },
  { key: 'status', example: 'todo', help: TASK_STATUSES.join(', ') },
  { key: 'priority', example: 'medium', help: TASK_PRIORITIES.join(', ') },
  { key: 'due_date', example: '2026-11-15' },
  { key: 'description', example: '' },
] as const

export type ProjectRecord = { name: string; code?: string; clientId?: string; leadId?: string; status: (typeof PROJECT_STATUSES)[number]; startDate?: string; endDate?: string; description?: string }
export type TaskRecord = { title: string; projectId?: string; assigneeId?: string; status: (typeof TASK_STATUSES)[number]; priority: (typeof TASK_PRIORITIES)[number]; dueDate?: string; description?: string }

export type WorkLookups = {
  /** Lower-cased email -> member id (active members). */
  members: ReadonlyMap<string, string>
  /** Lower-cased client name -> id. */
  clients: ReadonlyMap<string, string>
  /** Upper-cased codes already used by projects. */
  projectCodes: ReadonlySet<string>
  /** Lower-cased project code or name -> id. */
  projects: ReadonlyMap<string, string>
}

const enumOf = <T extends string>(values: readonly T[], raw: string, fallback: T): T | null => {
  if (!raw) return fallback
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_') as T
  return values.includes(v) ? v : null
}

function dateField(raw: string, label: string, errors: string[]): string | undefined {
  if (!raw) return undefined
  if (isRealDay(raw)) return raw
  errors.push(`${label} "${raw}" is not a real day. Use YYYY-MM-DD.`)
  return undefined
}

export function checkProjectRows(rows: readonly CsvRow[], lookups: WorkLookups): CheckedRow<ProjectRecord>[] {
  const seenCode = firstSeen()
  return rows.map((row) => {
    const errors: string[] = []
    const name = pick(row, 'name', 'project', 'project_name').slice(0, 100)
    if (!name) errors.push('Project name is missing.')
    const code = pick(row, 'code', 'project_code').toUpperCase().slice(0, 20) || undefined
    if (code && lookups.projectCodes.has(code)) errors.push(`Project code ${code} is already in use.`)
    const earlier = code ? seenCode(code, row.line) : null
    if (earlier != null) errors.push(`Project code ${code} is also on line ${earlier}.`)
    const clientName = pick(row, 'client')
    const clientId = clientName ? lookups.clients.get(key(clientName)) : undefined
    if (clientName && !clientId) errors.push(`No client called "${clientName}". Import clients first or leave it blank.`)
    const leadEmail = pick(row, 'lead_email', 'lead', 'owner_email')
    const leadId = leadEmail ? lookups.members.get(key(leadEmail)) : undefined
    if (leadEmail && !leadId) errors.push(`No active member with the email "${leadEmail}".`)
    const status = enumOf(PROJECT_STATUSES, pick(row, 'status'), 'active')
    if (!status) errors.push(`Status "${pick(row, 'status')}" is not one of ${PROJECT_STATUSES.join(', ')}.`)
    const startDate = dateField(pick(row, 'start_date', 'start'), 'Start date', errors)
    const endDate = dateField(pick(row, 'end_date', 'end', 'due_date'), 'End date', errors)
    if (startDate && endDate && endDate < startDate) errors.push('The end date is before the start date.')
    return rowResult(row.line, name, errors, [], { name, code, clientId, leadId, status: status ?? 'active', startDate, endDate, description: pick(row, 'description').slice(0, 1000) || undefined })
  })
}

export function checkTaskRows(rows: readonly CsvRow[], lookups: WorkLookups): CheckedRow<TaskRecord>[] {
  return rows.map((row) => {
    const errors: string[] = []
    const title = pick(row, 'title', 'task', 'name').slice(0, 200)
    if (!title) errors.push('Task title is missing.')
    const projectRaw = pick(row, 'project', 'project_code')
    const projectId = projectRaw ? lookups.projects.get(key(projectRaw)) : undefined
    if (projectRaw && !projectId) errors.push(`No project with the code or name "${projectRaw}".`)
    const assigneeRaw = pick(row, 'assignee_email', 'assignee', 'owner_email')
    const assigneeId = assigneeRaw ? lookups.members.get(key(assigneeRaw)) : undefined
    if (assigneeRaw && !assigneeId) errors.push(`No active member with the email "${assigneeRaw}".`)
    const status = enumOf(TASK_STATUSES, pick(row, 'status'), 'todo')
    if (!status) errors.push(`Status "${pick(row, 'status')}" is not one of ${TASK_STATUSES.join(', ')}.`)
    const priority = enumOf(TASK_PRIORITIES, pick(row, 'priority'), 'medium')
    if (!priority) errors.push(`Priority "${pick(row, 'priority')}" is not one of ${TASK_PRIORITIES.join(', ')}.`)
    const dueDate = dateField(pick(row, 'due_date', 'due'), 'Due date', errors)
    return rowResult(row.line, title, errors, [], { title, projectId, assigneeId, status: status ?? 'todo', priority: priority ?? 'medium', dueDate, description: pick(row, 'description').slice(0, 10000) || undefined })
  })
}
