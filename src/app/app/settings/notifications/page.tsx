import type { Metadata } from 'next'
import { BellRing, MoonStar } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { NotificationGrid } from '@/components/settings/notification-grid'
import { QuietHoursForm } from '@/components/settings/quiet-hours-form'
import { Notice, SurfaceHeader, TableCard } from '@/components/settings/surface'
import { workspaceGridRows } from '@/modules/messaging/grid-rows'
import { loadWorkspacePrefs } from '@/modules/messaging/prefs-store'
import { setWorkspaceChannel } from '@/modules/messaging/settings-actions'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'

export const metadata: Metadata = { title: 'Workspace alerts' }

/** Workspace notification defaults (notifications-v2 §5): what each event sends, on which channel, and the quiet hours. */
export default async function WorkspaceNotificationsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const [workspace, connected] = await Promise.all([loadWorkspacePrefs(ctx.orgId), isWhatsAppConnected(ctx.orgId)])
  return (
    <>
      <PageHeader title="Workspace alerts" help="alerts-digests-briefs" description={`What ${ctx.org.name} sends everyone by default, and where. Each person can change their own in Settings → My alerts.`} breadcrumb={breadcrumbFor('/app/settings/notifications')} />
      <div className="grid grid-cols-12 gap-4">
        <TableCard className="col-span-12 xl:col-span-8" icon={<BellRing strokeWidth={1.5} />} label="Workspace defaults" description="Alerts always land in the bell unless switched off. Email follows these defaults unless a person changes theirs.">
          <NotificationGrid rows={workspaceGridRows(workspace, { inapp: true, email: true, whatsapp: connected })} setCell={setWorkspaceChannel} followLabel="Flowbit default" whatsappBlocked={connected ? null : 'Connect WhatsApp in Settings → Integrations'} />
        </TableCard>
        <div className="col-span-12 space-y-4 xl:col-span-4">
          <section className="card-table p-5">
            <SurfaceHeader icon={<MoonStar strokeWidth={1.5} />} label="Quiet hours" description="Alert emails that arrive in these hours wait and go out together when they end. Security emails always go at once." />
            <div className="mt-4">
              <QuietHoursForm initial={workspace.quietHours} />
            </div>
          </section>
          <Notice tone="info">{connected ? 'WhatsApp alerts go from your workspace’s number to people who verified their number and turned WhatsApp on in Profile. Payslip contents never go by WhatsApp; only a "payslip ready" note.' : 'WhatsApp alerts arrive once your workspace connects WhatsApp in Settings → Integrations. Payslip contents never go by WhatsApp.'}</Notice>
        </div>
      </div>
    </>
  )
}
