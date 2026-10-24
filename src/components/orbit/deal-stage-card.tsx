'use client'

import { CircleX, Flag, RotateCcw, Trophy } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { moveDealStage, reopenDeal } from '@/modules/orbit/deals.actions'
import type { OrbitChoices } from '@/modules/orbit/record-types'
import { Note, OverviewCard, PanelHeader } from './parts'
import { StageTrack } from './stage-track'
import { ReasonDialog, WonDialog } from './stage-dialogs'

export type DealStageCardProps = {
  deal: { id: string; title: string; stage: string; status: 'open' | 'won' | 'lost'; valuePaise: number; closeNote: string | null }
  choices: Pick<OrbitChoices, 'dealStages' | 'lostReasons' | 'wonReasons'>
  can: { edit: boolean; close: boolean }
  /** Folio documents that would be orphaned by a reopen ("Invoice FB/26-27/014"). */
  folioWarning: string | null
  today: string
}

/** Open-stage rail (click to move) plus Won / Lost / Reopen. */
export function DealStageCard({ deal, choices, can, folioWarning, today }: DealStageCardProps) {
  const [move, moving] = useAction(moveDealStage)
  const open = deal.status === 'open'
  const currentIndex = choices.dealStages.findIndex((s) => s.key === deal.stage)
  const stages = [
    ...choices.dealStages.map((s) => ({ key: s.key, label: s.label, sub: `${s.probability}%` })),
    { key: '__closed', label: deal.status === 'won' ? 'Won' : deal.status === 'lost' ? 'Lost' : 'Won / Lost', sub: deal.status === 'won' ? '100%' : deal.status === 'lost' ? '0%' : 'closing' },
  ]
  const closedIndex = stages.length - 1
  return (
    <OverviewCard>
      <PanelHeader icon={<Flag />} title="Stage" subtitle={open && can.edit ? 'Click a stage on the bar to move the deal there.' : undefined} className="mb-5" />
      <StageTrack
        label="Deal stage"
        stages={stages}
        done={deal.status === 'won' ? closedIndex : open ? Math.max(0, currentIndex) : 0}
        current={open ? currentIndex : closedIndex}
        tone={deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'danger' : 'violet'}
        canSelect={(key) => open && can.edit && key !== deal.stage && key !== '__closed'}
        onSelect={(key) => move({ id: deal.id, fromStage: deal.stage, toStage: key })}
        busy={moving}
      />
      {deal.closeNote ? (
        <Note className="mt-5" tone={deal.status === 'won' ? 'info' : 'danger'} icon={deal.status === 'won' ? <Trophy className="text-[#2DCBAF]" /> : <CircleX />}>
          <span className="font-medium text-white">{deal.status === 'won' ? 'Won because' : 'Lost because'}:</span> {deal.closeNote}
        </Note>
      ) : null}
      {can.close ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {open ? (
            <>
              <WonDialog deal={deal} reasons={choices.wonReasons} today={today} trigger={<Button variant="primary" icon={<Trophy className="size-4" />}>Mark won</Button>} />
              <ReasonDialog reasons={choices.lostReasons} target={{ kind: 'deal', id: deal.id, title: deal.title }} trigger={<Button variant="ghost" icon={<CircleX className="size-4" />}>Mark lost</Button>} />
            </>
          ) : (
            <ConfirmDialog
              tone="primary"
              trigger={<Button variant="secondary" icon={<RotateCcw className="size-4" />}>Reopen</Button>}
              title={`Reopen '${deal.title}'?`}
              description={folioWarning ? `${folioWarning} exists for this deal. Void it in Folio if the deal fell through.` : 'It goes back to its last open stage and the close reason is cleared.'}
              confirmLabel="Reopen"
              onConfirm={() => reopenDeal({ id: deal.id })}
            />
          )}
        </div>
      ) : null}
    </OverviewCard>
  )
}
