import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { Progress } from '@/components/ui/progress'
import { checklistFor } from '@/modules/activation/store'
import { INVITES_NEEDED } from '@/modules/activation/checklist'
import { localeOfUser, translator } from '@/lib/i18n'
import { DismissChecklist } from './dismiss-checklist'
import { SampleDataButton } from './sample-data-button'

/**
 * "Get started" on Home for owners and admins in the first 30 days: five first steps ticked from real data,
 * the sample agency to explore with, and a way to hide it.
 */
export async function ChecklistCard({ ctx }: { ctx: Ctx }) {
  const { show, progress, hasSample } = await checklistFor(ctx)
  if (!show) return hasSample ? <SampleDataBar /> : null
  const percent = Math.round((progress.done / Math.max(1, progress.total)) * 100)
  const t = translator(localeOfUser(ctx.user))
  return (
    <section className="card-solid rounded-[10px] px-4 py-[18px] sm:px-[23px]" aria-labelledby="get-started">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="get-started" className="text-sm font-semibold uppercase tracking-[0.04em] text-white">{t('checklist.title')}</h2>
          <p className="mt-0.5 text-xs text-fg-2">{t('checklist.progress', { done: progress.done, total: progress.total })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SampleDataButton loaded={hasSample} />
          <DismissChecklist />
        </div>
      </header>
      <Progress value={percent} tone="success" size="sm" className="mt-3" label={t('checklist.percent', { n: percent })} />
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {progress.items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="press flex h-full gap-2.5 rounded-[8px] bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]">
              {item.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#2DCBAF]" aria-label={t('checklist.done')} /> : <Circle className="mt-0.5 size-4 shrink-0 text-fg-2" aria-label={t('checklist.todo')} />}
              <span className="min-w-0">
                <span className={item.done ? 'block text-sm text-fg-2 line-through' : 'block text-sm text-white'}>{t(`checklist.${item.key}.label`, { n: INVITES_NEEDED })}</span>
                <span className="block text-xs text-fg-2">{t(`checklist.${item.key}.hint`)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Once the checklist is gone, Home still offers to remove the sample agency while it is loaded. */
export function SampleDataBar() {
  return (
    <section className="card-solid flex flex-wrap items-center justify-between gap-3 rounded-[10px] px-4 py-3 sm:px-[23px]" aria-label="Sample data">
      <p className="text-sm text-fg-2">The sample agency is still in this workspace.</p>
      <SampleDataButton loaded />
    </section>
  )
}
