import type { Metadata } from 'next'
import { CreditCard, Webhook } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { timeAgo } from '@/lib/dates'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CopyButton } from '@/components/settings/copy-button'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { RazorpayForm } from '@/components/payments/razorpay-form'
import { gatewayInfo } from '@/modules/payments/gateway'

export const metadata: Metadata = { title: 'Razorpay' }

/** Settings → Integrations → Razorpay: the workspace's own account for payment links on its invoices. */
export default async function RazorpaySettingsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const info = await gatewayInfo(ctx.orgId)
  return (
    <>
      <PageHeader title="Razorpay" description="Collect invoice payments into your own Razorpay account. Paid links record the receipt, thank the client and stop reminders by themselves." breadcrumb={breadcrumbFor('/app/settings/integrations/razorpay')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card variant="solid" className="space-y-5 rounded-[10px]">
          <SurfaceHeader icon={<CreditCard />} label="API keys" actions={info.connected ? <Badge tone={info.mode === 'live' ? 'success' : 'warning'}>{info.mode === 'live' ? 'Live' : 'Test mode'}</Badge> : <Badge>Not connected</Badge>} />
          {!info.encryptionReady ? <Notice tone="warning">This server has no APP_ENCRYPTION_KEY, so keys cannot be stored safely yet. Ask whoever runs Flowbit to set it.</Notice> : null}
          <RazorpayForm saved={{ connected: info.connected, keyId: info.keyId, keySecret: info.keySecret, webhookSecret: info.webhookSecret }} disabled={!info.encryptionReady} />
          <p className="text-xs text-fg-3">Keys are encrypted before they are stored and never shown again. Flowbit uses them only to create payment links for your invoices.</p>
        </Card>
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<Webhook />} label="Webhook" description="In Razorpay → Webhooks, add this URL with the event payment_link.paid and the same webhook secret." />
          {info.webhookUrl ? (
            <>
              <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
                <code className="min-w-0 flex-1 truncate text-xs text-white/80">{info.webhookUrl}</code>
                <CopyButton value={info.webhookUrl} />
              </div>
              <p className="text-xs text-fg-3">{info.lastEventAt ? `Last payment received ${timeAgo(info.lastEventAt)}.` : 'No payment received through it yet.'}</p>
            </>
          ) : (
            <p className="text-sm text-fg-2">Save your keys first; your webhook URL appears here.</p>
          )}
        </Card>
      </div>
    </>
  )
}
