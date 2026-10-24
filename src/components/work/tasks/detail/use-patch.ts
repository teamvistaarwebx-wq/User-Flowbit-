'use client'

import { useAction } from '@/components/ui/action-form'
import { updateTask } from '@/modules/work/tasks/actions'

export type TaskPatchInput = Omit<Exclude<Parameters<typeof updateTask>[0], FormData>, 'id'>

/** One field edit on a task: runs updateTask with toast, sound and refresh. */
export function useTaskPatch(id: string) {
  const [run, pending] = useAction(updateTask)
  const patch = (fields: TaskPatchInput) => run({ id, ...fields })
  return [patch, pending] as const
}
