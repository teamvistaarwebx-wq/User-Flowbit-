'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown, Crown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { HEAD_ROW, rowClass } from '../shared/table'
import { PRESENCE_TONE, ProjectLogos } from './member-bits'
import type { TeamMember } from './members-table'
import { LoadBar } from './workload-view'

type SortKey = 'name' | 'status' | 'role' | 'load' | 'open' | 'projects'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

/** Checked in first, then on break, then offline, then on leave. */
const PRESENCE_RANK = { in: 0, break: 1, out: 2, leave: 3 } as const

const VALUE: Record<SortKey, (m: TeamMember) => string | number> = {
  name: (m) => m.name.toLowerCase(),
  status: (m) => PRESENCE_RANK[m.presence.state],
  role: (m) => `${m.role === 'lead' ? 0 : 1}${(m.title ?? '').toLowerCase()}`,
  load: (m) => m.load,
  open: (m) => m.open,
  projects: (m) => m.projects.length,
}

export function sortMembers(rows: readonly TeamMember[], sort: Sort): TeamMember[] {
  const get = VALUE[sort.key]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    if (x === y) return a.name.localeCompare(b.name)
    return (x < y ? -1 : 1) * sign
  })
}

function SortTh({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k
  const icon: ReactNode = active ? (sort.dir === 'asc' ? <ArrowUp /> : <ArrowDown />) : <ChevronsUpDown className="opacity-50" />
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('h-[33px] whitespace-nowrap px-3 text-left text-[13px] font-normal text-white', className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded-md transition-colors hover:text-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 [&_svg]:size-3.5">
        {label}
        {icon}
      </button>
    </th>
  )
}

/** The members as a sortable table: name, status, role, load this week, open tasks, projects. */
export function MemberList({ members, actions }: { members: TeamMember[]; actions?: (m: TeamMember) => ReactNode }) {
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const rows = useMemo(() => sortMembers(members, sort), [members, sort])
  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className={HEAD_ROW}>
            <SortTh label="Member" k="name" sort={sort} onSort={onSort} className="pl-[23px]" />
            <SortTh label="Status" k="status" sort={sort} onSort={onSort} />
            <SortTh label="Role" k="role" sort={sort} onSort={onSort} />
            <SortTh label="Load this week" k="load" sort={sort} onSort={onSort} />
            <SortTh label="Open" k="open" sort={sort} onSort={onSort} />
            <SortTh label="Projects" k="projects" sort={sort} onSort={onSort} />
            {actions ? <th scope="col" aria-label="Actions" className="pr-[23px]" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className={rowClass()}>
              <td className="py-2.5 pl-[23px] pr-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" marker={m.presence.state} markerLabel={m.presenceText} />
                  <span className="truncate text-sm font-medium text-white">{m.name}</span>
                </span>
              </td>
              <td className={cn('px-3 text-[13px]', PRESENCE_TONE[m.presence.state])}>{m.presenceText}</td>
              <td className="px-3">
                <span className="flex items-center gap-2 text-[13px] text-[#959596]">
                  {m.role === 'lead' ? <Badge tone="violet" icon={<Crown className="size-3" />}>Lead</Badge> : null}
                  <span className="truncate">{m.title || '—'}</span>
                </span>
              </td>
              <td className="px-3 py-2"><LoadBar logged={m.load} planned={m.planned} className="min-w-[150px]" /></td>
              <td className="px-3 text-[13px] tabular-nums text-white">{m.open}{m.overdue ? <span className="text-[#FF2D31]"> · {m.overdue} late</span> : null}</td>
              <td className="px-3"><ProjectLogos projects={m.projects} /></td>
              {actions ? <td className="pr-[23px] text-right">{actions(m)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
