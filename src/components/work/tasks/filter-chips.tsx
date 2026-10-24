'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { PRIORITY_LABEL, STATUS_LABEL } from '@/modules/work/tasks/constants'
import { activeFilterCount, DUE_LABEL, type TaskQuery } from '@/modules/work/tasks/filters'
import { tasksHref, type LockedFilter } from './href'
import { useTaskData } from './task-data'

type Chip = { key: string; label: string; patch: Partial<TaskQuery> }

/** Active filters as removable chips, plus "Clear all". */
export function FilterChips({ query, basePath, locked = [] }: { query: TaskQuery; basePath: string; locked?: LockedFilter[] }) {
  const data = useTaskData()
  if (!activeFilterCount(query, locked)) return null
  const without = <T,>(list: T[], item: T) => list.filter((x) => x !== item)
  const chips: Chip[] = [
    ...(query.mine ? [{ key: 'mine', label: 'Assigned to me', patch: { mine: false } }] : []),
    ...(query.created ? [{ key: 'created', label: 'Created by me', patch: { created: false } }] : []),
    ...query.status.map((s) => ({ key: `s-${s}`, label: STATUS_LABEL[s], patch: { status: without(query.status, s) } })),
    ...query.priority.map((p) => ({ key: `p-${p}`, label: `${PRIORITY_LABEL[p]} priority`, patch: { priority: without(query.priority, p) } })),
    ...(query.due ? [{ key: 'due', label: DUE_LABEL[query.due], patch: { due: null } }] : []),
    ...query.assignee.map((id) => ({ key: `a-${id}`, label: data.nameOf(id), patch: { assignee: without(query.assignee, id) } })),
    ...(locked.includes('project') ? [] : query.project.map((id) => ({ key: `pr-${id}`, label: data.projects.find((p) => p.id === id)?.name ?? 'Project', patch: { project: without(query.project, id) } }))),
    ...(locked.includes('client') ? [] : query.client).map((id) => ({ key: `c-${id}`, label: data.clients.find((c) => c.id === id)?.name ?? 'Client', patch: { client: without(query.client, id) } })),
    ...(query.space && !locked.includes('space') ? [{ key: 'space', label: data.spaces.find((s) => s.id === query.space)?.name ?? 'Space', patch: { space: null, folder: null } }] : []),
    ...(query.folder && !locked.includes('folder') ? [{ key: 'folder', label: data.spaces.flatMap((s) => s.folders).find((f) => f.id === query.folder)?.name ?? 'List', patch: { folder: null } }] : []),
    ...(query.tag ? [{ key: 'tag', label: `#${query.tag}`, patch: { tag: null } }] : []),
    ...(query.q ? [{ key: 'q', label: `"${query.q}"`, patch: { q: '' } }] : []),
  ]
  if (!chips.length) return null
  const clearAll = chips.reduce<Partial<TaskQuery>>((acc, c) => ({ ...acc, ...c.patch }), { status: [], priority: [], assignee: [], ...(locked.includes('client') ? {} : { client: [] }), ...(locked.includes('project') ? {} : { project: [] }) })
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Link key={c.key} href={tasksHref(basePath, query, { ...c.patch, page: 1, saved: null })} scroll={false} className="press group inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.18] bg-control pl-3 pr-1.5 text-[13px] text-white transition-colors hover:border-white/30">
          {c.label}
          <X className="size-3.5 text-fg-3 transition-colors group-hover:text-white" aria-label={`Remove ${c.label}`} />
        </Link>
      ))}
      {chips.length > 1 ? (
        <Link href={tasksHref(basePath, query, { ...clearAll, page: 1, saved: null })} scroll={false} className="ml-1 text-[13px] text-fg-2 transition-colors hover:text-white">
          Clear all
        </Link>
      ) : null}
    </div>
  )
}
