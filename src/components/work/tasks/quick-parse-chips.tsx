'use client'

import { BriefcaseBusiness, CalendarDays, Clock3, Component, Flag, Layers, UserRound, X } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { quickAddOptions } from '@/modules/work/tasks/quick-add-actions'
import { EMPTY_QUICK_OPTIONS, parseQuickAdd, quickOptionsFrom, type QuickOptions, type QuickParse, type QuickToken, type QuickTokenKind } from '@/modules/work/tasks/quick-parse'
import { leaveWarning } from '@/modules/work/presence-core'
import { useOptionalTaskData } from './task-data'

/** Options fetched once per page load for inputs outside a Tasks data provider (Home). */
let shared: Promise<QuickOptions> | null = null

function fetchOptions(): Promise<QuickOptions> {
  shared ??= quickAddOptions({})
    .then((res) => (res.ok && res.data ? res.data : EMPTY_QUICK_OPTIONS))
    .catch((error: unknown) => {
      console.error('[tasks] quick add options failed', error)
      shared = null
      return EMPTY_QUICK_OPTIONS
    })
  return shared
}

/** People, projects, lists and clients for @, # and !: from the Tasks data, else loaded on first focus. */
export function useQuickOptions(): { options: QuickOptions; load: () => void } {
  const data = useOptionalTaskData()
  const fromData = useMemo(() => (data ? quickOptionsFrom(data) : null), [data])
  const [loaded, setLoaded] = useState<QuickOptions | null>(null)
  const load = useCallback(() => {
    if (fromData || loaded) return
    void fetchOptions().then(setLoaded)
  }, [fromData, loaded])
  return { options: fromData ?? loaded ?? EMPTY_QUICK_OPTIONS, load }
}

/**
 * Parses the title as it is typed. `personal`: private to-dos stay out of projects, lists and clients,
 * so # and ! are not read. A dismissed chip stays plain text until the input is cleared.
 */
export function useQuickParse(text: string, opts: { personal?: boolean } = {}) {
  const { options, load } = useQuickOptions()
  const [skip, setSkip] = useState<string[]>([])
  const scoped = useMemo<QuickOptions>(() => (opts.personal ? { ...EMPTY_QUICK_OPTIONS, people: options.people } : options), [options, opts.personal])
  const parsed = useMemo<QuickParse>(() => parseQuickAdd(text, scoped, new Date(), skip), [text, scoped, skip])
  const dismiss = useCallback((key: string) => setSkip((list) => [...list, key]), [])
  const reset = useCallback(() => setSkip([]), [])
  const warning = useMemo(() => leaveWarning(options.people, parsed.assigneeIds, parsed.dueDate), [options.people, parsed.assigneeIds, parsed.dueDate])
  return { parsed, dismiss, reset, load, warning }
}

const ICON: Record<QuickTokenKind, ReactNode> = {
  date: <CalendarDays />, time: <Clock3 />, assignee: <UserRound />, project: <Component />, list: <Layers />, space: <Layers />, client: <BriefcaseBusiness />, priority: <Flag />,
}
const LABEL: Record<QuickTokenKind, string> = { date: 'Due', time: 'At', assignee: 'Assign', project: 'Project', list: 'List', space: 'Space', client: 'Client', priority: 'Priority' }

/** What the quick add understood, as chips under the input; X keeps that word as text instead. */
export function QuickChips({ tokens, onDismiss, className, warning }: { tokens: QuickToken[]; onDismiss: (key: string) => void; className?: string; warning?: string | null }) {
  if (!tokens.length) return null
  return (
    <>
      <ul aria-label="Understood from the title" aria-live="polite" className={className ?? 'flex flex-wrap gap-1.5 px-1 pt-1.5'}>
        {tokens.map((t) => (
          <li key={t.key} className="inline-flex h-6 items-center gap-1 rounded-full border border-white/[0.14] bg-control pl-2 pr-1 text-xs text-white [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:text-icon-muted">
            {ICON[t.kind]}
            <span className="text-fg-3">{LABEL[t.kind]}</span>
            <span className="max-w-[160px] truncate">{t.label}</span>
            <button type="button" onClick={() => onDismiss(t.key)} aria-label={`Keep "${t.raw}" as text`} className="press ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-white/10 hover:text-white">
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
      {warning ? <p role="status" className="px-1 pt-1 text-xs text-warning">{warning}. You can still assign them.</p> : null}
    </>
  )
}

/** The parsed fields a quick add sends with its title (only those the text set). */
export function parsedFields(p: QuickParse) {
  return {
    ...(p.dueDate ? { dueDate: p.dueDate } : {}),
    ...(p.dueTime ? { dueTime: p.dueTime } : {}),
    ...(p.assigneeIds.length ? { assigneeIds: p.assigneeIds } : {}),
    ...(p.priority ? { priority: p.priority } : {}),
    ...(p.projectId ? { projectId: p.projectId } : {}),
    ...(p.spaceId ? { spaceId: p.spaceId, folderId: p.folderId } : {}),
    ...(p.clientId ? { clientId: p.clientId } : {}),
  }
}
