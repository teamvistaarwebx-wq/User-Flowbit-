'use client'

import { ArrowUpDown, CalendarDays, Check, Kanban, List, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { SORT_FIELDS, SORT_LABEL, type TaskQuery, type TaskView } from '@/modules/work/tasks/filters'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu'
import { SearchInput } from '@/components/ui/search-input'
import { Segmented } from '@/components/ui/tabs'
import { FilterPanel } from './filter-panel'
import { tasksHref, type LockedFilter } from './href'
import { SavedViewsMenu } from './saved-views-menu'
import type { SavedViewOption } from './types'

const VIEWS: { value: TaskView; label: ReactNode }[] = [
  { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="size-3.5" />List</span> },
  { value: 'board', label: <span className="inline-flex items-center gap-1.5"><Kanban className="size-3.5" />Board</span> },
  { value: 'calendar', label: <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Calendar</span> },
]

export type TaskToolbarProps = {
  query: TaskQuery
  basePath: string
  locked?: LockedFilter[]
  savedViews?: SavedViewOption[]
}

/** View switcher, search, filters, "Me", sort and saved views. Everything lives in the URL. */
export function TaskToolbar({ query, basePath, locked = [], savedViews }: TaskToolbarProps) {
  const router = useRouter()
  const go = (patch: Partial<TaskQuery>) => router.push(tasksHref(basePath, query, { page: 1, saved: null, ...patch }))
  const sortItems: MenuItem[] = [
    { type: 'label', label: 'Sort by' },
    { label: 'Manual / newest', icon: !query.sort ? <Check /> : <span className="size-4" />, onSelect: () => go({ sort: null }) },
    ...SORT_FIELDS.map((f) => ({ label: SORT_LABEL[f], icon: query.sort === f ? <Check /> : <span className="size-4" />, onSelect: () => go({ sort: f }) })),
    { type: 'separator' },
    { label: 'Ascending', icon: query.order === 'asc' ? <Check /> : <span className="size-4" />, onSelect: () => go({ order: 'asc' }), disabled: !query.sort },
    { label: 'Descending', icon: query.order === 'desc' ? <Check /> : <span className="size-4" />, onSelect: () => go({ order: 'desc' }), disabled: !query.sort },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented options={VIEWS} value={query.view} onChange={(view) => go({ view })} />
      <SearchInput placeholder="Search tasks, keys, tags" className="sm:w-64" />
      <FilterPanel query={query} basePath={basePath} locked={locked} />
      {!query.personal ? (
        <button
          type="button"
          aria-pressed={query.mine}
          onClick={() => {
            play('toggle', { on: !query.mine })
            go({ mine: !query.mine })
          }}
          className={cn(
            'press inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150',
            query.mine ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.18] bg-control text-white hover:border-white/30',
          )}
        >
          <UserRound className="size-3.5" /> Me
        </button>
      ) : null}
      {query.view !== 'calendar' ? (
        <DropdownMenu
          align="end"
          items={sortItems}
          trigger={
            <Button variant="secondary" size="sm" icon={<ArrowUpDown className="size-3.5" />}>
              {query.sort ? SORT_LABEL[query.sort] : 'Sort'}
            </Button>
          }
        />
      ) : null}
      {savedViews ? <SavedViewsMenu views={savedViews} query={query} basePath={basePath} /> : null}
    </div>
  )
}
