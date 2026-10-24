/** Picks a lead's or deal's next step from its planned activities. Pure. */

export type PlannedLike = {
  _id: unknown
  status: string
  title?: string | null
  type: string
  dueDate?: string | null
  dueTime?: string | null
  createdAt?: Date | string | null
}

export type NextFollowUp = { activityId: unknown; title: string; type: string; dueDate: string; dueTime: string | null }

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0)

/** Earliest planned activity by due date, then due time (no time last), then creation. */
export function pickNext(activities: readonly PlannedLike[]): NextFollowUp | null {
  const planned = activities.filter((a) => a.status === 'planned' && a.dueDate)
  if (!planned.length) return null
  const sorted = [...planned].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return String(a.dueDate) < String(b.dueDate) ? -1 : 1
    if ((a.dueTime ?? null) !== (b.dueTime ?? null)) {
      if (!a.dueTime) return 1
      if (!b.dueTime) return -1
      return a.dueTime < b.dueTime ? -1 : 1
    }
    return time(a.createdAt) - time(b.createdAt)
  })
  const n = sorted[0]
  return { activityId: n._id, title: n.title ?? '', type: n.type, dueDate: String(n.dueDate), dueTime: n.dueTime ?? null }
}

export type DueState = 'overdue' | 'today' | 'upcoming'

export const dueState = (dueDate: string, today: string): DueState => (dueDate < today ? 'overdue' : dueDate === today ? 'today' : 'upcoming')
