'use client'

import { useEffect } from 'react'

/**
 * The order of the tasks on screen (list, board, calendar, Home), so J/K in the task panel
 * moves to the next or previous one. The view shown last registers its order.
 */
let order: readonly string[] = []

export function setTaskOrder(ids: readonly string[]): void {
  order = ids
}

/** The task `step` places after (1) or before (-1) `id` in the current order, if any. */
export function neighbourTask(id: string, step: 1 | -1): string | null {
  const at = order.indexOf(id)
  if (at < 0) return null
  return order[at + step] ?? null
}

/** Registers the ids in screen order while the view is mounted. */
export function TaskOrder({ ids }: { ids: readonly string[] }) {
  const key = ids.join(',')
  useEffect(() => {
    setTaskOrder(key ? key.split(',') : [])
  }, [key])
  return null
}

/** Event the panel's E shortcut sends to the title editor of that task. */
export const EDIT_TITLE_EVENT = 'flowbit:edit-task-title'
