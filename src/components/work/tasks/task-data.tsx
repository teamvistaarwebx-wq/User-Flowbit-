'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { onLeaveOn } from '@/modules/work/presence-core'
import type { Person, TaskData } from './types'

type TaskDataApi = TaskData & {
  person: (id: string | null | undefined) => Person | undefined
  nameOf: (id: string | null | undefined) => string
  activePeople: Person[]
  /** Name, photo and today's leave marker, for avatar stacks. */
  avatar: (id: string) => { name: string; src?: string; away: boolean }
}

const Ctx = createContext<TaskDataApi | null>(null)

/** People, pickers and permissions for Work client components (names on cards, pickers in dialogs). */
export function TaskDataProvider({ value, children }: { value: TaskData; children: ReactNode }) {
  const api = useMemo<TaskDataApi>(() => {
    const byId = new Map(value.people.map((p) => [p.id, p]))
    return {
      ...value,
      person: (id) => (id ? byId.get(id) : undefined),
      nameOf: (id) => (id ? (byId.get(id)?.name ?? 'Someone') : 'Someone'),
      activePeople: value.people.filter((p) => p.active),
      avatar: (id) => {
        const p = byId.get(id)
        return { name: p?.name ?? 'Someone', src: p?.avatarUrl, away: onLeaveOn(p?.leaveDates, value.today) }
      },
    }
  }, [value])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/** The Tasks data when a provider is above (Tasks screens), else null (Home). */
export const useOptionalTaskData = (): TaskDataApi | null => useContext(Ctx)

export function useTaskData(): TaskDataApi {
  const value = useContext(Ctx)
  if (!value) throw new Error('useTaskData must be used inside <TaskDataProvider>')
  return value
}
