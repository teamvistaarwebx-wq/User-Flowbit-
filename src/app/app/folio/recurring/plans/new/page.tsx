import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { Layers } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { PageHeader } from '@/components/ui/page-header'
import { PlanForm } from '@/components/folio/PlanForm'
import { SetupCallout } from '@/components/folio/SetupCallout'
import { blankPlan, planFormOptions } from '@/components/folio/plan-options'

export const metadata: Metadata = { title: 'New billing plan' }

export default async function NewPlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'recurring.write' })
  const clientId = first(sp.clientId)
  const opts = await planFormOptions(ctx, clientId && isValidObjectId(clientId) ? clientId : undefined)
  return (
    <>
      <PageHeader title="New billing plan" icon={<Layers />} breadcrumb={breadcrumbFor('/app/folio/recurring/plans/new')} back={{ href: '/app/folio/recurring?tab=plans', label: 'Billing plans' }} description="An agreed value, billed in phases. Each phase becomes a draft invoice when you raise it." />
      {opts.ready ? (
        <PlanForm values={blankPlan(opts.defaultEntityId, clientId ?? '')} clients={opts.clients} entities={opts.entities} projects={opts.projects} taxRates={opts.taxRates} />
      ) : (
        <SetupCallout canSetUp={ctx.can('folio.settings')} />
      )}
    </>
  )
}
