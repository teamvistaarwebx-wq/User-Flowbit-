import type { Metadata } from 'next'
import { BellRing } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { NotificationGrid } from '@/components/settings/notification-grid'
import { PersonalDelivery } from '@/components/settings/personal-delivery'
import { TableCard } from '@/components/settings/surface'
import { personalGridRows } from '@/modules/messaging/grid-rows'
import { loadPersonalPrefs, loadWorkspacePrefs } from '@/modules/messaging/prefs-store'
import { setMyChannel } from '@/modules/messaging/settings-actions'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { whatsAppEnabled } from '@/modules/features/flags'
import { canMessageOnWhatsApp } from '@/modules/whatsapp/recipients'

export const metadata: Metadata = { title: 'My alerts' }

/** The snooze end as ISO while it is still ahead, else null. */
const activeSnooze = (until: Date | null): string | null => (until && until.getTime() > Date.now() ? until.toISOString() : null)

/** Personal notification settings (notifications-v2 §5): overrides, digest, quiet hours and snooze. */
export default async function MyAlertsPage() {
  const ctx = await requireMember({ allowBlocked: true })
  const [workspace, personal, connected, whatsappOn] = await Promise.all([loadWorkspacePrefs(ctx.orgId), loadPersonalPrefs(ctx.orgId, ctx.userId), isWhatsAppConnected(ctx.orgId), whatsAppEnabled()])
  const optedIn = canMessageOnWhatsApp({ id: String(ctx.userId), phone: ctx.user.phone, phoneVerifiedAt: ctx.user.phoneVerifiedAt, whatsapp: ctx.user.whatsapp })
  const whatsappBlocked = !connected ? 'WhatsApp alerts arrive once your workspace connects WhatsApp' : !optedIn ? 'Verify your number and turn on WhatsApp in Settings → My account' : null
  const snoozed = activeSnooze(personal.snoozeUntil)
  return (
    <>
      <PageHeader title="My alerts" help="alerts-digests-briefs" description={`What reaches you from ${ctx.org.name}, and where. Untouched switches follow the workspace alerts. A digest batches your alerts into one message instead of many.`} breadcrumb={breadcrumbFor('/app/settings/profile/notifications')} />
      <div className="grid grid-cols-12 gap-4">
        <TableCard className="col-span-12 xl:col-span-8" icon={<BellRing strokeWidth={1.5} />} label="Alerts" description={`Emails go to ${ctx.user.email}. Security emails always go${whatsappOn ? '; payslip contents never go by WhatsApp (only a "payslip ready" note)' : ''}.`}>
          <NotificationGrid rows={personalGridRows(workspace, personal, { inapp: true, email: true, whatsapp: connected && optedIn })} setCell={setMyChannel} followLabel="workspace default" whatsappBlocked={whatsappBlocked} />
        </TableCard>
        <div className="col-span-12 xl:col-span-4">
          <PersonalDelivery
            digest={personal.digest}
            quietMode={personal.quietMode}
            quietHours={personal.quietHours}
            workspaceQuiet={workspace.quietHours.enabled ? `${workspace.quietHours.start} to ${workspace.quietHours.end}` : null}
            snoozedUntil={snoozed}
            hasOverrides={personal.groups.length > 0 || personal.digest !== 'off' || personal.quietMode !== 'workspace'}
          />
        </div>
      </div>
    </>
  )
}
