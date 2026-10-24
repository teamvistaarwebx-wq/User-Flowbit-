'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ListTree, LoaderCircle, Search, TrendingUp, Workflow } from 'lucide-react'
import { toast } from '@/lib/toast'
import { arcSearch } from '@/modules/work/arc/actions'
import { BreakdownDialog, OutlineDialog, ProgressDialog, type ArcAction, type ArcPickers } from './quick-actions'

/** Home's Arc suggestion chips: #171717 pills, 40 tall, 14/500 near-white. */
const chip = 'press inline-flex h-10 items-center gap-2 rounded-full bg-control px-4 text-sm font-medium text-[#F1F1F1] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-[#1f1f1f]'

/** The big ask pill (Home's gradient glass with the blush lip) plus the three quick-action chips from the Figma Arc card. */
export function ArcPrompt({ pickers, today, initialQuery, initialAction }: { pickers: ArcPickers; today: string; initialQuery?: string; initialAction?: ArcAction }) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery ?? '')
  const [pending, startTransition] = useTransition()
  const fired = useRef(false)

  const submit = (value: string) => {
    const term = value.trim()
    if (!term) return
    startTransition(async () => {
      const result = await arcSearch({ q: term })
      if (!result.ok) return void toast.error(result.error)
      setQ('')
      if (result.redirect) router.push(result.redirect)
      else router.refresh()
    })
  }

  // Opened from a Home Arc chip: the matching dialog starts open; drop ?action so a reload doesn't reopen it.
  useEffect(() => {
    if (initialAction) router.replace('/app/arc', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction])

  useEffect(() => {
    if (!initialQuery || fired.current) return
    fired.current = true
    router.replace('/app/arc', { scroll: false })
    submit(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
        className="edge-stroke relative flex h-16 items-center gap-3 rounded-full bg-[image:var(--grad-arc-pill)] pl-5 pr-2.5 backdrop-blur-[12px] [--stroke:linear-gradient(180deg,rgba(177,156,185,0.9)_0%,rgba(177,156,185,0.25)_45%,rgba(245,220,240,0.6)_80%,#F5DCF0_100%)]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-[#F5DCF0] blur-[1.5px]" />
        <div className="contents">
          <Search className="size-5 shrink-0 text-white" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={120}
            placeholder="Search your workspace: a task key like VW-42, a project, a person, “overdue”…"
            aria-label="Ask Arc"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[#C1B8C4] focus:outline-none"
          />
          <button type="submit" disabled={pending || !q.trim()} aria-label="Search" className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#3B2A72] transition-opacity disabled:opacity-40">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2.5">
        <OutlineDialog pickers={pickers} today={today} defaultOpen={initialAction === 'outline'} trigger={<button type="button" className={chip}><Workflow className="size-4" /> Outline a project</button>} />
        <BreakdownDialog pickers={pickers} defaultOpen={initialAction === 'breakdown'} trigger={<button type="button" className={chip}><ListTree className="size-4" /> Break down a task</button>} />
        <ProgressDialog pickers={pickers} defaultOpen={initialAction === 'progress'} trigger={<button type="button" className={chip}><TrendingUp className="size-4" /> Progress update</button>} />
      </div>
    </div>
  )
}
