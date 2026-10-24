import type { Metadata } from 'next'
import Link from 'next/link'
import { Target } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { PageHeader } from '@/components/ui/page-header'
import { NewLeadForm } from '@/components/orbit/new-lead-form'
import { SolidCard } from '@/components/orbit/parts'
import { loadChoices } from '@/modules/orbit/choices'

export const metadata: Metadata = { title: 'New lead' }

export default async function NewLeadPage() {
  const ctx = await requireMember({ product: 'orbit', perm: 'leads.write' })
  const { cfg, choices } = await loadChoices(ctx)
  const ready = choices.sources.length > 0 && choices.sectors.length > 0
  return (
    <>
      <PageHeader title="New lead" description="Under 30 seconds. Everything else is editable later." breadcrumb={breadcrumbFor('/app/orbit/leads/new')} icon={<Target />} />
      <SolidCard className="max-w-3xl rounded-[12px] pt-5">
        {ready ? (
          <NewLeadForm choices={choices} canAssign={ctx.can('orbit.close')} defaultReviewerId={cfg.defaultReviewerId} today={todayIST()} />
        ) : (
          <p className="text-[13px] text-fg-2">
            Add a source and a sector in Orbit settings first.{' '}
            {ctx.can('orbit.settings') ? <Link className="text-link transition-colors hover:text-white" href="/app/orbit/settings?tab=sources">Open settings</Link> : 'Ask an admin to add them.'}
          </p>
        )}
      </SolidCard>
    </>
  )
}
