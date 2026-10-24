import { Hourglass } from 'lucide-react'
import { lifecycleCopy, type LifecycleView } from '@/lib/lifecycle-copy'
import { Notice } from '@/components/settings/surface'
import { ExportLink, ReturnToFreeButton, StartTrialButton, UpgradeLink } from './lifecycle-buttons'

export type LifecyclePanelProps = {
  view: LifecycleView
  trialAvailable: boolean
  /** A trial trimmed to 5 people may return to Free (lib/lifecycle freeReturnRefusal is null). */
  canReturnToFree: boolean
  /** Why it may not, shown when the team is still too big. */
  returnHint: string | null
  isOwner: boolean
  showUpgrade: boolean
}

const TONE = { blocked: 'danger', read_only: 'warning' } as const

/** Settings → Plan & billing: where the workspace is in its lifecycle, days left, what happens next and the actions. */
export function LifecyclePanel({ view, trialAvailable, canReturnToFree, returnHint, isOwner, showUpgrade }: LifecyclePanelProps) {
  const copy = lifecycleCopy(view)
  if (!copy) return null
  const tone = view.stage === 'blocked' || view.stage === 'read_only' ? TONE[view.stage] : 'info'
  return (
    <Notice
      tone={tone}
      icon={<Hourglass strokeWidth={1.5} />}
      className="col-span-12"
      action={
        <>
          {isOwner ? <ExportLink /> : null}
          {canReturnToFree ? <ReturnToFreeButton /> : null}
          {trialAvailable ? <StartTrialButton /> : null}
          {showUpgrade ? <UpgradeLink /> : null}
        </>
      }
    >
      <p className="font-semibold text-fg">{copy.state}</p>
      <p className="text-fg-2">{copy.next}</p>
      {returnHint ? <p className="mt-1 text-[13px] text-[#959596]">{returnHint}</p> : null}
    </Notice>
  )
}
