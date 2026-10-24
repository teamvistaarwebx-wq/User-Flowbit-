import type { Metadata } from 'next'
import { MessageSquare } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDateTime } from '@/lib/dates'
import { appUrl, encryptionKey, isSlackConfigured } from '@/lib/env'
import { first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CopyButton } from '@/components/settings/copy-button'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { SlackChannelForm, SlackDisconnect } from '@/components/integrations/slack-forms'
import { SlackInstall } from '@/models/integrations/SlackInstall'

export const metadata: Metadata = { title: 'Slack' }

const ERRORS: Record<string, string> = {
  not_configured: 'The Slack app is not set up on this Flowbit server yet (SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET and APP_ENCRYPTION_KEY).',
  denied: 'Slack was not connected.',
  state: 'That install link expired or belonged to another session. Try again.',
  failed: 'Slack did not finish the install. Try again in a moment.',
  taken: 'That Slack workspace is already connected to another Flowbit workspace.',
}

function UrlRow({ url }: { url: string }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
      <code className="min-w-0 flex-1 truncate text-xs text-fg-2">{url}</code>
      <CopyButton value={url} />
    </div>
  )
}

/** Settings → Integrations → Slack: install per workspace, the /flowbit command, the message shortcut and channel updates. */
export default async function SlackPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ perm: 'org.manage' })
  const install = await ctx.db(SlackInstall).findOne({}, { botTokenSealed: 0 }).lean()
  const ready = isSlackConfigured() && Boolean(encryptionKey())
  const error = ERRORS[first(sp.error) ?? '']
  return (
    <>
      <PageHeader title="Slack" description="Turn Slack messages into Flowbit tasks, add tasks with /flowbit, and post task updates to a channel. People act as themselves: Slack users are matched to members by email." breadcrumb={breadcrumbFor('/app/settings/integrations/slack', ctx)} />
      <div className="space-y-4">
        {!ready ? <Notice tone="warning">{ERRORS.not_configured}</Notice> : null}
        {error ? <Notice tone="warning">{error}</Notice> : null}
        {first(sp.connected) ? <Notice tone="success">Slack connected.</Notice> : null}
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<MessageSquare />} label={install ? `Connected to ${install.teamName}` : 'Not connected'} actions={install ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>} />
          {install ? (
            <>
              <p className="text-sm text-fg-2">Installed by {install.installedByName ?? 'an admin'} on {formatDateTime(install.createdAt)}. In Slack: <code>/flowbit task logo bhejo kal 5 baje @vikram</code>, <code>/flowbit my day</code>, or a message’s ⋯ menu → Create Flowbit task.</p>
              <SlackChannelForm channel={install.notifyChannelName ?? null} events={install.notifyEvents ?? []} />
              <SlackDisconnect />
            </>
          ) : ready ? <Button variant="primary" href="/api/integrations/slack/start">Add to Slack</Button> : null}
        </Card>
        <Card variant="solid" className="space-y-3 rounded-[10px]">
          <SurfaceHeader label="For whoever runs Flowbit" description="Create the Slack app from docs/SLACK-APP-MANIFEST.yml, or check these URLs in api.slack.com/apps." />
          <p className="text-xs text-fg-3">Slash command /flowbit</p>
          <UrlRow url={appUrl('/api/slack/commands')} />
          <p className="text-xs text-fg-3">Interactivity (shortcut and modal)</p>
          <UrlRow url={appUrl('/api/slack/interactions')} />
          <p className="text-xs text-fg-3">OAuth redirect URL</p>
          <UrlRow url={appUrl('/api/integrations/slack/callback')} />
        </Card>
      </div>
    </>
  )
}
