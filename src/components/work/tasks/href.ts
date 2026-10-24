import { taskQueryString, type TaskQuery } from '@/modules/work/tasks/filters'

/** A Tasks URL under `basePath` (which may already carry params such as ?tab=tasks). */
export function tasksHref(basePath: string, q: TaskQuery, patch: Partial<TaskQuery> = {}): string {
  const qs = taskQueryString(q, patch)
  if (!qs) return basePath
  return `${basePath}${basePath.includes('?') ? '&' : '?'}${qs}`
}

/** Filters a page fixes (a project's or space's Tasks tab) and the user can't remove. */
export type LockedFilter = 'project' | 'space' | 'folder' | 'personal' | 'client'
