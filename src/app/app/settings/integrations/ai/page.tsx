import type { Metadata } from 'next'
import { Bot, History, Link2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { appUrl } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CopyButton } from '@/components/settings/copy-button'
import { Notice, SurfaceHeader } from '@/components/settings/surface'
import { McpSwitch, RevokeButton, UndoBatchButton } from '@/components/mcp/connected-apps'
import { mcpRefusal, MCP_FREE_REFUSAL } from '@/modules/mcp/access'
import { NEVER_RULES } from '@/modules/mcp/never'
import { mcpEnabledFor } from '@/modules/mcp/session'
import { connectedApps, mcpHistory } from '@/modules/mcp/settings-query'

export const metadata: Metadata = { title: 'Connected apps' }

/** Settings → Integrations → Connected apps (AI): the MCP connection URL, who connected what, history with undo, and the admin switch. */
export default async function ConnectedAppsPage() {
  const ctx = await requireMember()
  const [enabled, apps, history] = await Promise.all([mcpEnabledFor(ctx.orgId), connectedApps(ctx), mcpHistory(ctx)])
  const refusal = mcpRefusal(ctx.entitlements, enabled)
  const url = appUrl('/mcp')
  const admin = ctx.can('org.manage')
  const live = apps.filter((a) => !a.revokedAt)
  return (
    <>
      <PageHeader title="Connected apps" help="search-and-arc" description="Let Claude or ChatGPT read and update Flowbit as you, within your role. Every change shows as “you via the app” and can be undone for 7 days. Arc is the assistant inside Work; this connects outside apps." breadcrumb={breadcrumbFor('/app/settings/integrations/ai', ctx)} />
      <div className="space-y-4">
        {refusal ? <Notice tone="warning">{refusal}</Notice> : null}
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<Link2 />} label="Connect an AI app" actions={admin ? <div className="flex items-center gap-2 text-xs text-fg-3">AI apps for this workspace <McpSwitch enabled={enabled} /></div> : null} />
          <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
            <code className="min-w-0 flex-1 truncate text-xs text-fg-2">{url}</code>
            <CopyButton value={url} />
          </div>
          <div className="grid gap-4 text-sm text-fg-2 lg:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-fg">Claude</p>
              <p>Settings → Connectors → Add custom connector. Name it Flowbit, paste the URL above, then Connect. Sign in to Flowbit, pick this workspace and tick what Claude may do.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-fg">ChatGPT</p>
              <p>Settings → Apps &amp; Connectors → Advanced → turn on Developer mode, then Create. Paste the URL, choose OAuth, and sign in to Flowbit the same way.</p>
            </div>
          </div>
          <p className="text-xs text-fg-3">Never possible through AI apps: {NEVER_RULES.map((r) => r.label.toLowerCase()).join('; ')}. Invoices and quotes are drafts only; people data is the directory and leave only.</p>
          {ctx.entitlements.accountType === 'free' ? <p className="text-xs text-warning">{MCP_FREE_REFUSAL}</p> : null}
        </Card>

        <Card variant="solid" className="space-y-3 rounded-[10px]">
          <SurfaceHeader icon={<Bot />} label={admin ? 'Apps connected in this workspace' : 'Your connected apps'} description={`${live.length} active`} />
          {apps.length ? (
            <ul className="divide-y divide-white/5">
              {apps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-fg">{a.clientName} {a.revokedAt ? <Badge>Revoked</Badge> : <Badge tone="success">Active</Badge>}</p>
                    <p className="text-xs text-fg-3">Connected by {a.mine ? 'you' : a.by} on {formatDateTime(a.connectedAt)} · {a.lastUsedAt ? `last used ${timeAgo(a.lastUsedAt)}` : 'not used yet'}</p>
                    <p className="text-xs text-fg-3">{a.scopes.join(' · ')}</p>
                  </div>
                  {!a.revokedAt && (a.mine || admin) ? <RevokeButton id={a.id} /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-3">No AI app is connected yet.</p>}
        </Card>

        <Card variant="solid" className="space-y-3 rounded-[10px]">
          <SurfaceHeader icon={<History />} label="History" description="Changes AI apps made. Undo removes what a batch created and puts back what it changed, for 7 days." />
          {history.length ? (
            <ul className="divide-y divide-white/5">
              {history.map((b) => (
                <li key={b.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{b.label} {b.status === 'undone' ? <Badge>Undone</Badge> : null}</p>
                      <p className="text-xs text-fg-3">{b.by} · {formatDateTime(b.at)} · {b.changes} {b.changes === 1 ? 'change' : 'changes'}{b.failed ? ` · ${b.failed} failed` : ''}</p>
                    </div>
                    {b.canUndo ? <UndoBatchButton id={b.id} /> : null}
                  </div>
                  <ul className="space-y-0.5 text-xs text-fg-2">
                    {b.lines.slice(0, 12).map((l, i) => (
                      <li key={i}>
                        {l.status === 'done' ? '✓' : l.status === 'failed' ? '✕' : '–'} {l.link ? <a className="text-link hover:underline" href={l.link}>{l.summary}</a> : l.summary}
                        {l.error ? <span className="text-fg-3"> ({l.error})</span> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-3">Nothing yet.</p>}
        </Card>
      </div>
    </>
  )
}
