import type { TaskPriority, TaskStatus } from '@/modules/work/tasks/constants'

/** JSON-safe shapes passed from server pages to Work client components. */

export type Person = {
  id: string
  name: string
  email: string
  title?: string
  department?: string
  active: boolean
  avatarUrl?: string
  /** Approved leave days from today on (Muster), for the leave marker and assignment warnings. */
  leaveDates?: string[]
}

export type ProjectOption = { id: string; name: string; code: string; color: string; clientId?: string }
export type FolderOption = { id: string; name: string; color: string }
export type SpaceOption = { id: string; name: string; color: string; folders: FolderOption[] }
/** `logoUrl`: the client's logo, shown on its tasks. */
export type ClientOption = { id: string; name: string; logoUrl?: string }
export type MilestoneOption = { id: string; title: string; dueDate: string }

/** A relation flag on a card: 'open' while it holds (orange blocked / red blocking), 'clear' once the blocker is done (green). */
export type RelationFlag = 'open' | 'clear' | null
export type RelationFlags = { blockedBy: RelationFlag; blocking: RelationFlag }

export type TaskRow = {
  id: string
  key: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  assigneeIds: string[]
  creatorId: string
  dueDate: string | null
  /** 'HH:mm' (IST) when quick add read a time. */
  dueTime: string | null
  startDate: string | null
  projectId: string | null
  /** The client the task is for (its own, or its project's): rows show the client's logo. */
  clientId: string | null
  spaceId: string | null
  folderId: string | null
  isPersonal: boolean
  sharedWith: string[]
  tags: string[]
  blockedReason: string | null
  order: number
  subtasks: { done: number; total: number }
  checklist: { done: number; total: number }
  flags: RelationFlags
  canEdit: boolean
}

export type SavedViewOption = { id: string; name: string; query: string; shared: boolean; mine: boolean }

/** Everything the Tasks screens need to show names and offer pickers. */
export type TaskData = {
  me: string
  today: string
  people: Person[]
  projects: ProjectOption[]
  spaces: SpaceOption[]
  clients: ClientOption[]
  canWrite: boolean
  canManage: boolean
  personalMode: boolean
}
