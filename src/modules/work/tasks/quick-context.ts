import type { TaskQuery } from './filters'

/**
 * What a new task made from a filtered task view inherits (pure): the one
 * project, client, space and list the view is narrowed to, and "personal".
 * On a client's Tasks tab the client is locked, so a quick-added task
 * belongs to that client without typing !client.
 */
export type TaskViewContext = { projectId?: string; clientId?: string; spaceId?: string; folderId?: string; personal?: boolean }

export function taskViewContext(query: Pick<TaskQuery, 'project' | 'client' | 'space' | 'folder' | 'personal'>, spaceLists: readonly { id: string }[]): TaskViewContext {
  return {
    projectId: query.project.length === 1 ? query.project[0] : undefined,
    clientId: query.client.length === 1 ? query.client[0] : undefined,
    spaceId: query.space ?? undefined,
    folderId: query.folder ?? (spaceLists.length === 1 ? spaceLists[0].id : undefined),
    personal: query.personal || undefined,
  }
}
