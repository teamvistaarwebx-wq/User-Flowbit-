'use client'

import { useState, type ReactNode } from 'react'
import { GitCommitHorizontal, History } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { Segmented } from '@/components/ui/tabs'
import type { TimelineEntryData } from '@/modules/orbit/record-types'
import { ActivityRow } from './activity-row'
import { TableCard } from './parts'

type Filter = 'all' | 'activity' | 'stage'

export type RecordTimelineProps = {
  entries: TimelineEntryData[]
  today: string
  canDelete: boolean
  empty: ReactNode
  /** Card title (default "Timeline"). */
  title?: string
  /** Render only the filter and the list, for a timeline nested inside another card. */
  bare?: boolean
  /** Extra content under the list, inside the card (e.g. the lead's history before conversion). */
  children?: ReactNode
}

/** Merged history of a lead or deal: logged activities and stage changes, newest first, in an "Assign to me" card. */
export function RecordTimeline({ entries, today, canDelete, empty, title = 'Timeline', bare, children }: RecordTimelineProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = entries.filter((e) => filter === 'all' || e.kind === filter)
  const activities = entries.filter((e) => e.kind === 'activity').length
  const filterControl = entries.length ? (
    <Segmented
      value={filter}
      onChange={setFilter}
      options={[
        { value: 'all', label: `All ${entries.length}` },
        { value: 'activity', label: `Activities ${activities}` },
        { value: 'stage', label: `Stage changes ${entries.length - activities}` },
      ]}
    />
  ) : null

  const list =
    shown.length === 0 ? (
      <div className="px-3 py-8 text-center text-[13px] text-fg-2">{empty}</div>
    ) : (
      <ul className="space-y-px">
        {shown.map((e) =>
          e.kind === 'activity' ? (
            <ActivityRow key={`a-${e.item.id}`} item={e.item} today={today} canAct={false} canDelete={canDelete} showRelated={false} />
          ) : (
            <li key={`s-${e.id}`} className="flex items-start gap-3 rounded-[8px] px-3 py-2.5">
              <span aria-hidden className="mt-px flex h-5 w-5 shrink-0 items-center justify-center text-icon-muted">
                <GitCommitHorizontal className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">
                  {e.from ? (
                    <>
                      {e.from} <span className="text-[#979797]">→</span> {e.to}
                    </>
                  ) : (
                    `Created at ${e.to}`
                  )}
                  {e.entity === 'deal' ? <span className="ml-2 text-xs text-[#979797]">on the deal</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-[#979797]">
                  {formatDateTime(e.at)} · {e.who}
                </p>
                {e.reason ? <p className="mt-1 text-[13px] text-fg-2">{e.reason}</p> : null}
              </div>
            </li>
          ),
        )}
      </ul>
    )

  if (bare) {
    return (
      <div className="space-y-3">
        {filterControl}
        {list}
      </div>
    )
  }
  return (
    <TableCard icon={<History />} title={title} subtitle="Logged activity and stage changes, newest first" actions={filterControl}>
      <div className="border-t border-line px-[11px] py-2">{list}</div>
      {children ? <div className="px-[23px] pb-5">{children}</div> : null}
    </TableCard>
  )
}
