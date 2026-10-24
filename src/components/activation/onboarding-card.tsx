import type { ReactNode } from 'react'
import type { Ctx } from '@/lib/ctx'
import { checklistFor } from '@/modules/activation/store'
import { ChecklistCard } from '@/components/activation/checklist-card'
import { SetupGuideCard, setupGuideVisible } from '@/components/work/dashboard/setup-guide'

/**
 * Home's one onboarding card (audit A19): the Setup guide while a Flowbit handover runs, otherwise the Get
 * started checklist, otherwise `fallback` (the empty-workspace card), never two or three stacked.
 */
export async function OnboardingCard({ ctx, fallback }: { ctx: Ctx; fallback?: ReactNode }) {
  if (await setupGuideVisible(ctx)) return <SetupGuideCard ctx={ctx} />
  const { show } = await checklistFor(ctx)
  if (show) return <ChecklistCard ctx={ctx} />
  return (
    <>
      <ChecklistCard ctx={ctx} />
      {fallback}
    </>
  )
}
