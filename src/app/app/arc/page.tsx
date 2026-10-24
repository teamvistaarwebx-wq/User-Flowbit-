import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { firstName } from '@/lib/utils'
import { ArcMark } from '@/components/ui/logo'
import { InfoTip } from '@/components/ui/info-tip'
import { ArcPrompt } from '@/components/work/arc/arc-prompt'
import { ClearHistory } from '@/components/work/arc/clear-history'
import { ScrollToEnd } from '@/components/work/arc/scroll-to-end'
import { ArcThread } from '@/components/work/arc/thread'
import type { ArcAction } from '@/components/work/arc/quick-actions'
import { arcOptions, recentRuns } from '@/modules/work/arc/queries'

export const metadata: Metadata = { title: 'Arc' }

/** Home's Arc chips link here with ?action= to open the matching quick action. */
const ACTIONS: readonly ArcAction[] = ['outline', 'breakdown', 'progress']

export default async function ArcPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'arc.use' })
  const [runs, options] = await Promise.all([recentRuns(ctx), arcOptions(ctx)])
  const q = (first(sp.q) ?? '').trim().slice(0, 120)
  const action = ACTIONS.find((a) => a === first(sp.action))

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Home's Arc card, full width: glass lit by a purple light from below, the arc.ai lockup, chips and the ask pill. */}
      <section className="glass relative overflow-hidden rounded-[10px] bg-white/[0.06] px-5 pb-8 pt-7 animate-slide-up sm:px-10 sm:pb-10">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_30%_112%,var(--arc-glow),transparent_70%)]" />
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_95%_105%,rgba(150,135,160,0.35),transparent_70%)]" />
        <div className="relative space-y-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-[9px]">
              <ArcMark size={32} />
              <span className="text-[28px] font-semibold leading-none tracking-[-0.01em] text-white">
                arc<span className="bg-[image:var(--grad-arc-word)] bg-clip-text text-transparent">.ai</span>
              </span>
              {options.ai ? null : <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/80">Suggestions mode</span>}
              <InfoTip concept="search-and-arc" />
            </div>
            {runs.length ? <ClearHistory /> : null}
          </div>
          <div>
            <h1 className="text-xl font-medium leading-7 text-white">
              Hi <span className="text-name">{firstName(ctx.user.name)}</span>, what do you need?
            </h1>
            <p className="mt-1 text-sm text-white/70">{options.ai ? 'Searches your workspace and drafts with Claude.' : 'Searches your workspace and drafts from built-in templates.'}</p>
          </div>
          <ArcPrompt pickers={{ tasks: options.tasks, projects: options.projects, teams: options.teams }} today={todayIST()} initialQuery={q || undefined} initialAction={action} />
          <p className="flex items-center gap-1.5 text-[13px] text-[#C1B8C4]">
            <ShieldCheck className="size-4 shrink-0" /> Arc reads, you decide: drafts change nothing until you click Apply.
          </p>
        </div>
      </section>
      {runs.length ? (
        <>
          <ArcThread runs={runs} userName={ctx.user.name} canPost={ctx.can('posts.write')} />
          <ScrollToEnd marker={runs.at(-1)?.id ?? ''} />
        </>
      ) : (
        <p className="text-center text-[13px] text-fg-2">Ask for a task, project, person, post or meeting, or start with one of the quick actions above.</p>
      )}
    </div>
  )
}
