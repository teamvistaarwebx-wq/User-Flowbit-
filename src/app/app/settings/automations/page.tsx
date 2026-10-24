import type { Metadata } from 'next'
import Link from 'next/link'
import { History, Plus } from 'lucide-react'
import { buttonClass } from '@/components/ui/button-styles'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { EngineNote } from '@/components/automations/engine-note'
import { TableCard } from '@/components/settings/surface'
import { AutomationList } from '@/components/automations/automation-list'
import { RunHistory } from '@/components/automations/run-history'
import { automationList, runHistory } from '@/modules/automations/queries'

export const metadata: Metadata = { title: 'Automations' }

/** Settings → Automations (notifications-v2 §3): ready recipes with on/off switches, and what they did lately. */
export default async function AutomationsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const [rules, runs] = await Promise.all([automationList(ctx), runHistory(ctx, { limit: 30 })])
  return (
    <>
      <PageHeader title="Automations" help="automation-engines" description="When something happens, Flowbit sends the message, alerts the right person or adds the task. Switch each one on or off; open it to change the wording and timing." breadcrumb={breadcrumbFor('/app/settings/automations')} actions={<Link href="/app/settings/automations/new" className={buttonClass('primary', 'sm')}><Plus className="size-4" /> New automation</Link>} />
      <EngineNote current="automations" viewer={ctx} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <AutomationList rules={rules} />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <TableCard icon={<History />} label="Run history" description="The last 30 runs: what was sent, skipped or failed, and why.">
            <RunHistory runs={runs} />
          </TableCard>
        </div>
      </div>
    </>
  )
}
