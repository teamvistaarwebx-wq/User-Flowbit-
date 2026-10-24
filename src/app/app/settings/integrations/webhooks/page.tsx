import type { Metadata } from 'next'
import { Webhook } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { encryptionKey } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { WebhookForm, WebhookRowActions } from '@/components/integrations/webhook-forms'
import { WebhookDelivery } from '@/models/integrations/WebhookDelivery'
import { WebhookEndpoint } from '@/models/integrations/WebhookEndpoint'

export const metadata: Metadata = { title: 'Webhooks' }

/** Settings → Integrations → Webhooks: Zapier-friendly signed events with retries and a delivery log. */
export default async function WebhooksPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const [endpoints, deliveries] = await Promise.all([
    ctx.db(WebhookEndpoint).find({}, { secretSealed: 0 }).sort({ createdAt: -1 }).lean(),
    ctx.db(WebhookDelivery).find({}, { payload: 0 }).sort({ createdAt: -1 }).limit(50).lean(),
  ])
  const hostOf = new Map(endpoints.map((e) => [String(e._id), new URL(e.url).host]))
  return (
    <>
      <PageHeader title="Webhooks" description="Send Flowbit events to Zapier, Make or your own server. Each delivery is signed (X-Flowbit-Signature: t=…,v1=HMAC-SHA256 of “t.body”) and retried for about 9 hours." breadcrumb={breadcrumbFor('/app/settings/integrations/webhooks', ctx)} />
      <div className="space-y-4">
        {!encryptionKey() ? <Notice tone="warning">Set APP_ENCRYPTION_KEY on the server before adding webhooks: their secrets are stored encrypted.</Notice> : null}
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<Webhook />} label="Add a webhook" />
          <WebhookForm />
        </Card>
        <Card variant="solid" className="space-y-3 rounded-[10px]">
          <SurfaceHeader label="Your webhooks" description={`${endpoints.length} of 20`} />
          {endpoints.length ? (
            <ul className="divide-y divide-white/5">
              {endpoints.map((e) => (
                <li key={String(e._id)} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-fg">{e.description || new URL(e.url).host} {e.active ? <Badge tone={e.failingSince ? 'warning' : 'success'}>{e.failingSince ? 'Failing' : 'Active'}</Badge> : <Badge>Paused</Badge>}</p>
                    <p className="truncate text-xs text-fg-3">{e.url}</p>
                    <p className="text-xs text-fg-3">{e.events.join(' · ')} · secret ••••{e.secretLast4}{e.lastDeliveryAt ? ` · last ${timeAgo(e.lastDeliveryAt)}: ${e.lastStatus}` : ''}</p>
                  </div>
                  <WebhookRowActions id={String(e._id)} active={e.active} webhook={{ id: String(e._id), url: e.url, description: e.description ?? '', events: [...e.events], active: e.active }} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-3">No webhooks yet.</p>}
        </Card>
        <Card variant="solid" className="space-y-3 rounded-[10px]">
          <SurfaceHeader label="Delivery log" description="The last 50 deliveries (kept 30 days)." />
          {deliveries.length ? (
            <ul className="divide-y divide-white/5 text-xs">
              {deliveries.map((d) => (
                <li key={String(d._id)} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-fg-2">{d.event}{d.test ? ' (test)' : ''} → {hostOf.get(String(d.endpointId)) ?? 'removed webhook'}</span>
                  <span className={d.status === 'failed' ? 'text-danger' : d.status === 'delivered' ? 'text-fg-3' : 'text-warning'}>
                    {d.status}{d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}{d.lastError && d.status !== 'delivered' ? ` · ${d.lastError}` : ''} · {d.attempts} {d.attempts === 1 ? 'try' : 'tries'} · {formatDateTime(d.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-3">Nothing sent yet.</p>}
        </Card>
      </div>
    </>
  )
}
