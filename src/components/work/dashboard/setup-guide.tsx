import Link from 'next/link'
import { CheckCircle2, Circle, PlayCircle } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { HANDOVER_HINT, HANDOVER_LABEL, HANDOVER_STEPS, handoverProgress, showSetupGuide, stepDone } from '@/lib/console/handover'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { consoleSettings } from '@/modules/console/settings-query'
import { workspaceHasSample } from '@/modules/activation/store'
import { SampleDataButton } from '@/components/activation/sample-data-button'

/**
 * The "Setup guide" card on Home (console spec 9): the handover checklist the
 * Flowbit team ticks in the Console, with a help video per step. Reads only
 * the checklist of this workspace; links come from Console settings.
 */
/** Whether Home shows the Setup guide (a Console handover is running and the member can manage the workspace). */
export async function setupGuideVisible(ctx: Ctx): Promise<boolean> {
  if (!ctx.can('org.manage')) return false
  const account = await ConsoleAccount.findOne({ orgId: ctx.orgId }, { handover: 1 }).lean()
  return showSetupGuide(account?.handover, ctx.org.createdAt)
}

export async function SetupGuideCard({ ctx }: { ctx: Ctx }) {
  if (!ctx.can('org.manage')) return null
  const account = await ConsoleAccount.findOne({ orgId: ctx.orgId }, { handover: 1 }).lean()
  const state = account?.handover
  if (!showSetupGuide(state, ctx.org.createdAt)) return null
  const [{ helpLinks }, progress, hasSample] = [await consoleSettings(), handoverProgress(state), await workspaceHasSample(ctx)]
  return (
    <section className="card-solid rounded-[10px] px-[23px] py-[18px]" aria-labelledby="setup-guide">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-guide" className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Setup guide</h2>
        <span className="text-xs text-fg-2">{progress.done} of {progress.total} done{progress.started ? ' · with the Flowbit team' : ''}</span>
      </header>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {HANDOVER_STEPS.map((step) => {
          const done = stepDone(state, step)
          const href = helpLinks[step]
          return (
            <li key={step} className="flex gap-2.5 rounded-[8px] bg-white/[0.03] px-3 py-2.5">
              {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#2DCBAF]" /> : <Circle className="mt-0.5 size-4 shrink-0 text-fg-2" />}
              <span className="min-w-0">
                <span className={done ? 'block text-sm text-fg-2 line-through' : 'block text-sm text-white'}>{HANDOVER_LABEL[step]}</span>
                <span className="block text-xs text-fg-2">{HANDOVER_HINT[step]}</span>
                {step === 'data' && !done ? (
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Link href="/app/settings/import" className="text-xs text-link">Import from a spreadsheet</Link>
                    <SampleDataButton loaded={hasSample} />
                  </span>
                ) : null}
                {href && href !== '#' ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-1 ml-2 inline-flex items-center gap-1 text-xs text-link"><PlayCircle className="size-3" /> Watch how</a> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
