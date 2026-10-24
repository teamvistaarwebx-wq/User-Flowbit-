import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound, redirect } from 'next/navigation'
import { History, Zap } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { TableCard } from '@/components/settings/surface'
import { AutomationEditor } from '@/components/automations/automation-editor'
import { RunHistory } from '@/components/automations/run-history'
import { automationDetail, runHistory } from '@/modules/automations/queries'

export const metadata: Metadata = { title: 'Automation' }

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ perm: 'org.manage' })
  if (!isValidObjectId(id)) notFound()
  const detail = await automationDetail(ctx, id)
  if (!detail) notFound()
  if (detail.bridgeHref) redirect(detail.bridgeHref)
  const runs = await runHistory(ctx, { automationId: id, limit: 50 })
  return (
    <>
      <PageHeader title={detail.name} icon={<Zap />} back={{ href: '/app/settings/automations', label: 'Automations' }} description={detail.description}>
        <Badge tone={detail.enabled ? 'success' : 'neutral'}>{detail.enabled ? 'On' : 'Off'}</Badge>
      </PageHeader>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <AutomationEditor detail={detail} />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <TableCard icon={<History />} label="Run history" description="Every run of this automation.">
            <RunHistory runs={runs} showRule={false} />
          </TableCard>
        </div>
      </div>
    </>
  )
}
