import type { Metadata } from 'next'
import { CalendarDays, Mail, MailSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { GoogleDisconnect } from '@/components/settings/google-disconnect'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { connectionInfo, googleIntegrationsReady } from '@/modules/google/connections'
import { GOOGLE_SERVICE_LABEL, isGoogleService, type GoogleService } from '@/modules/google/scopes'
import { gmailReplyDetectionOn } from '@/modules/orbit/sequences/replies'

export const metadata: Metadata = { title: 'Google' }

type ServiceCopy = { icon: ReactNode; what: string; access: string }
const COPY: Record<GoogleService, ServiceCopy> = {
  calendar: {
    icon: <CalendarDays />,
    what: 'Meetings you schedule in Flowbit go on your Google Calendar with a Google Meet link, and move or cancel with it. Your own upcoming Google events show, read-only, on the Meetings calendar.',
    access: 'Access asked for: create and change events on your calendars (calendar.events). Flowbit never reads your email or contacts.',
  },
  gmail: {
    icon: <Mail />,
    what: 'Orbit sequence emails go from your own Gmail address, so replies land in your inbox. Without it they go from Flowbit with replies set to come to you.',
    access: 'Access asked for: send email on your behalf (gmail.send). Flowbit cannot read your inbox with it; replies are spotted through each sequence mail’s own reply address, or mark them with the Replied button on the lead.',
  },
  gmail_read: {
    icon: <MailSearch />,
    what: 'Flowbit reads the Gmail threads your Orbit sequences started and stops a sequence as soon as the lead replies, logging the reply on the lead.',
    access: 'Access asked for: read your Gmail (gmail.readonly), a restricted Google scope. Google requires a CASA security assessment before this can be offered to everyone; until then only test users added in Google Cloud can connect. Flowbit reads only the sequence threads, headers only.',
  },
}

const ERRORS: Record<string, string> = {
  not_configured: 'Google connections are not set up on this Flowbit server yet. Ask whoever runs it to add the Google client and APP_ENCRYPTION_KEY.',
  denied: 'You cancelled on the Google screen, so nothing was connected.',
  state: 'That sign-in link expired or belonged to another session. Try Connect again.',
  scope: 'Google did not grant the access Flowbit needs. Try again and keep the box ticked on the Google screen.',
  no_refresh: 'Google did not return a lasting token. Remove Flowbit under myaccount.google.com → Security → Third-party access, then connect again.',
  failed: 'Google did not respond. Try again in a moment.',
  service: 'Unknown Google service.',
}

/** Settings → Integrations → Google: each member connects their own Google Calendar (and Gmail) here. */
export default async function GoogleIntegrationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember()
  const ready = googleIntegrationsReady()
  const SERVICES: readonly GoogleService[] = gmailReplyDetectionOn() ? ['calendar', 'gmail', 'gmail_read'] : ['calendar', 'gmail']
  const infos = await Promise.all(SERVICES.map((s) => connectionInfo(ctx, ctx.memberId, s)))
  const error = ERRORS[first(sp.error) ?? '']
  const connected = first(sp.connected)
  return (
    <>
      <PageHeader title="Google" description="Your own Google account, for you only. Nobody else in the workspace can see or use it." breadcrumb={breadcrumbFor('/app/settings/integrations/google', ctx)} />
      <div className="space-y-4">
        {!ready ? <Notice tone="warning">{ERRORS.not_configured}</Notice> : null}
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {isGoogleService(connected) ? <Notice tone="success">{GOOGLE_SERVICE_LABEL[connected]} connected.</Notice> : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SERVICES.map((service, i) => {
            const info = infos[i]
            const badge = info.broken ? <Badge tone="warning">Reconnect</Badge> : info.connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>
            return (
              <Card key={service} variant="solid" className="space-y-4 rounded-[10px]">
                <SurfaceHeader icon={COPY[service].icon} label={GOOGLE_SERVICE_LABEL[service]} actions={badge} />
                <p className="text-sm text-fg-2">{COPY[service].what}</p>
                <p className="text-xs text-fg-3">{COPY[service].access}</p>
                {info.broken && info.lastError ? <p className="text-xs text-warning">{info.lastError}</p> : null}
                {info.connected && info.connectedAt ? <p className="text-xs text-fg-3">Connected on {formatDate(info.connectedAt)}.</p> : null}
                <div className="flex flex-wrap gap-2">
                  {ready && (!info.connected || info.broken) ? <Button variant="primary" size="sm" href={`/api/integrations/google/start?service=${service}`}>{info.broken ? 'Connect again' : `Connect ${GOOGLE_SERVICE_LABEL[service]}`}</Button> : null}
                  {info.connected ? <GoogleDisconnect service={service} /> : null}
                </div>
              </Card>
            )
          })}
        </div>
        <p className="text-xs text-fg-3">Tokens are encrypted before they are stored. Disconnect removes them and withdraws Flowbit&apos;s access at Google.</p>
      </div>
    </>
  )
}
