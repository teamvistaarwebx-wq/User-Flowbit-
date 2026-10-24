import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Bot, CreditCard, HardDrive, Inbox, KeyRound, Mail, MessageCircle, MessageSquare, Sparkles, Webhook } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { timeAgo } from '@/lib/dates'
import { appUrl, encryptionKey, isAnthropicConfigured, isGoogleConfigured, isRazorpayWebhookConfigured, isResendConfigured, isSlackConfigured, razorpayMode, serverEnv } from '@/lib/env'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CopyButton } from '@/components/settings/copy-button'
import { Member } from '@/models/Member'
import { Message } from '@/models/messaging/Message'
import { StoredFile } from '@/models/StoredFile'
import { User } from '@/models/User'
import { BillingEvent } from '@/models/subscription/BillingEvent'
import { formatBytes, maskKey } from '@/modules/settings/format'
import { gatewayInfo } from '@/modules/payments/gateway'
import { connectionInfo } from '@/modules/whatsapp/connection'
import { whatsAppEnabled } from '@/modules/features/flags'
import { ARC_MODELS } from '@/modules/work/arc/ai-client'
import { aiAllowanceFor, aiTokensThisMonth } from '@/modules/work/arc/usage'
import type { Tone } from '@/lib/status'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { SlackInstall } from '@/models/integrations/SlackInstall'
import { WebhookEndpoint } from '@/models/integrations/WebhookEndpoint'
import { mcpRefusal } from '@/modules/mcp/access'
import { mcpEnabledFor } from '@/modules/mcp/session'
import { emailToTaskCard } from '@/modules/connectors/email/card'
import { personalTaskAddress } from '@/modules/connectors/email/service'

export const metadata: Metadata = { title: 'Integrations' }
const DAY_MS = 86_400_000

function ServiceCard({ icon, name, status, tone, detail, children }: { icon: ReactNode; name: string; status: string; tone: Tone; detail: ReactNode; children?: ReactNode }) {
  return (
    <Card variant="solid" className="flex flex-col gap-3 rounded-[10px]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:stroke-[1.5]">
          {icon}
          {name}
        </h2>
        <Badge tone={tone}>{status}</Badge>
      </div>
      <div className="text-sm text-white/80">{detail}</div>
      {children}
    </Card>
  )
}

function UrlRow({ url }: { url: string }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
      <code className="min-w-0 flex-1 truncate text-xs text-white/80">{url}</code>
      <CopyButton value={url} />
    </div>
  )
}

export default async function IntegrationsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const env = serverEnv()
  const mailCard = emailToTaskCard(env, ctx.has('work') ? personalTaskAddress(ctx) : null, ctx.org.slug)
  const since = new Date(Date.now() - 30 * DAY_MS)
  const [members, mailCounts, files, lastEvent] = await Promise.all([
    ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean(),
    ctx.db(Message).aggregate<{ _id: string; n: number }>([
      { $match: { channel: 'email', createdAt: { $gte: since } } },
      { $group: { _id: { $cond: [{ $eq: ['$skipReason', 'no_provider'] }, 'logged', '$status'] }, n: { $sum: 1 } } },
    ]),
    ctx.db(StoredFile).aggregate<{ n: number; bytes: number }>([{ $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: '$size' } } }]),
    BillingEvent.findOne({ orgId: ctx.orgId, provider: 'razorpay' }, { receivedAt: 1 }).sort({ receivedAt: -1 }).lean(),
  ])
  const [gateway, whatsapp, whatsappOn, ai, tokens] = await Promise.all([gatewayInfo(ctx.orgId), connectionInfo(ctx.orgId), whatsAppEnabled(), aiAllowanceFor(ctx), aiTokensThisMonth(ctx)])
  const googleUsers = await User.countDocuments({ _id: { $in: members.map((m) => m.userId) }, googleId: { $exists: true, $nin: [null, ''] } })
  const mail = (...statuses: string[]) => mailCounts.filter((c) => statuses.includes(c._id)).reduce((sum, c) => sum + c.n, 0)
  const mode = razorpayMode()
  const storage = files[0] ?? { n: 0, bytes: 0 }
  const [aiApps, mcpOn, slack, hooks] = await Promise.all([
    ctx.db(OAuthGrant).countDocuments({ revokedAt: null }),
    mcpEnabledFor(ctx.orgId),
    ctx.db(SlackInstall).findOne({}, { teamName: 1, notifyChannelName: 1 }).lean(),
    ctx.db(WebhookEndpoint).countDocuments({ active: true }),
  ])
  const mcpBlocked = mcpRefusal(ctx.entitlements, mcpOn)

  return (
    <>
      <PageHeader title="Integrations" description="Connect AI apps and your tools, and see the services your Flowbit server runs on. Nothing secret is shown here." breadcrumb={breadcrumbFor('/app/settings/integrations')} />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-fg-3">Apps and connectors</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ServiceCard icon={<Sparkles />} name="Connected apps (AI)" status={mcpBlocked ? 'Off' : `${aiApps} connected`} tone={mcpBlocked ? 'warning' : aiApps ? 'success' : 'neutral'} detail={mcpBlocked ?? 'Claude and ChatGPT read and update Flowbit as each person, within their role, with preview, audit and undo.'}>
          <Link href="/app/settings/integrations/ai" className="text-xs text-link hover:underline">Manage connected apps</Link>
        </ServiceCard>
        <ServiceCard icon={<MessageSquare />} name="Slack" status={slack ? 'Connected' : isSlackConfigured() ? 'Not connected' : 'Not configured'} tone={slack ? 'success' : 'neutral'} detail={slack ? `Connected to ${slack.teamName}${slack.notifyChannelName ? `; updates go to #${slack.notifyChannelName}` : ''}.` : 'Turn messages into tasks, /flowbit task and /flowbit my day, and task updates in a channel.'}>
          <Link href="/app/settings/integrations/slack" className="text-xs text-link hover:underline">{slack ? 'Manage Slack' : 'Set up Slack'}</Link>
        </ServiceCard>
        <ServiceCard icon={<Webhook />} name="Webhooks (Zapier, Make)" status={hooks ? `${hooks} active` : 'None'} tone={hooks ? 'success' : 'neutral'} detail="Signed events: task.created, task.completed, lead.created, deal.won, invoice.issued and invoice.paid, with retries and a delivery log.">
          <Link href="/app/settings/integrations/webhooks" className="text-xs text-link hover:underline">Manage webhooks</Link>
        </ServiceCard>
        <ServiceCard icon={<Inbox />} name="Email to task" status={mailCard.ready ? 'Ready' : 'Not configured'} tone={mailCard.ready ? 'success' : 'neutral'} detail={mailCard.ready ? 'Each member forwards email to their own tasks+ address (Settings → My account). Only the address owner’s own mail is accepted, unless an admin allows teammates (Settings → Security); SPF, DKIM and DMARC must pass when reported.' : 'Needs INBOUND_EMAIL_DOMAIN and INBOUND_EMAIL_SECRET on the server, and the domain’s MX at the inbound provider.'}>
          {mailCard.ready ? (
            <>
              <p className="text-xs text-fg-3">Your address</p>
              <UrlRow url={mailCard.address} />
              <p className="text-xs text-fg-3">Inbound webhook for the mail provider: <code className="break-all">{appUrl('/api/inbound/email')}</code></p>
            </>
          ) : (
            <p className="text-xs font-medium text-warning">{mailCard.hint}</p>
          )}
          <p className="text-xs text-[#959596]">An inbound webhook can also create tasks or leads: Orbit → Settings, lead webhook (send <code>&quot;type&quot;: &quot;task&quot;</code> for a task).</p>
        </ServiceCard>
      </div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-fg-3">Server services</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ServiceCard icon={<KeyRound />} name="Google sign-in" status={isGoogleConfigured() ? 'Ready' : 'Not configured'} tone={isGoogleConfigured() ? 'success' : 'neutral'} detail={`${googleUsers} of ${members.length} members have signed in with Google.`}>
          <p className="text-xs text-[#959596]">Register both redirect URIs in Google Cloud Console (sign-in, then Calendar and Gmail connections):</p>
          <UrlRow url={appUrl('/api/auth/google/callback')} />
          <UrlRow url={appUrl('/api/integrations/google/callback')} />
          <p className="text-xs text-[#959596]">
            Each person connects their own Google Calendar or Gmail in <Link href="/app/settings/integrations/google" className="text-link hover:underline">Settings → Google</Link>.
            {encryptionKey() ? '' : ' Needs APP_ENCRYPTION_KEY on the server first.'}
          </p>
        </ServiceCard>

        <ServiceCard
          icon={<Mail />}
          name="Email delivery"
          status={isResendConfigured() ? 'Sending' : 'Not configured'}
          tone={isResendConfigured() ? 'success' : 'warning'}
          detail={isResendConfigured() ? `From ${env.MAIL_FROM}` : 'Emails are saved in the Messages log instead of being sent.'}
        >
          <p className="text-xs text-[#959596]">
            Last 30 days: {mail('sent', 'delivered', 'read')} sent · {mail('logged')} saved, not sent · {mail('failed')} failed ·{' '}
            <Link href="/app/settings/messages" className="text-link hover:underline">Open the Messages log</Link>
          </p>
          {isResendConfigured() ? (
            <>
              <p className={env.RESEND_WEBHOOK_SECRET ? 'text-xs text-[#959596]' : 'text-xs text-warning'}>
                {env.RESEND_WEBHOOK_SECRET ? 'Delivery webhook secret set: delivered, bounced and spam ticks are recorded.' : 'Add this webhook in Resend and set RESEND_WEBHOOK_SECRET to record delivered, bounced and spam ticks.'}
              </p>
              <UrlRow url={appUrl('/api/webhooks/resend')} />
            </>
          ) : null}
        </ServiceCard>

        <ServiceCard
          icon={<CreditCard />}
          name="Flowbit subscription payments"
          status={mode === 'live' ? 'Live' : mode === 'test' ? 'Test keys' : 'Test mode'}
          tone={mode === 'live' ? 'success' : 'warning'}
          detail={mode === 'none' ? 'No keys set. Checkout simulates payments for local development.' : `Key ${maskKey(env.RAZORPAY_KEY_ID)}`}
        >
          {mode !== 'none' ? (
            <>
              <p className={isRazorpayWebhookConfigured() ? 'text-xs text-[#959596]' : 'text-xs text-warning'}>
                {isRazorpayWebhookConfigured() ? 'Webhook secret set.' : "Webhook secret missing: renewals and failed payments won't be recorded."}
                {lastEvent?.receivedAt ? ` Last event: ${timeAgo(lastEvent.receivedAt)}.` : ''}
              </p>
              <UrlRow url={appUrl('/api/subscription/razorpay/webhook')} />
            </>
          ) : null}
        </ServiceCard>

        <ServiceCard
          icon={<CreditCard />}
          name="Your Razorpay (invoice payments)"
          status={gateway.connected ? (gateway.mode === 'live' ? 'Live' : 'Test mode') : 'Not connected'}
          tone={gateway.connected ? (gateway.mode === 'live' ? 'success' : 'warning') : 'neutral'}
          detail={gateway.connected ? `Key ${gateway.keyId}. Clients can pay invoices online; paid links record the receipt.` : 'Connect your own Razorpay account to add "Pay now" links to your invoices.'}
        >
          <Link href="/app/settings/integrations/razorpay" className="text-xs text-link hover:underline">{gateway.connected ? 'Manage Razorpay' : 'Connect Razorpay'}</Link>
        </ServiceCard>

        {whatsappOn ? <ServiceCard
          icon={<MessageCircle />}
          name="WhatsApp (your own number)"
          status={whatsapp.connected ? 'Connected' : 'Not connected'}
          tone={whatsapp.connected ? 'success' : 'neutral'}
          detail={whatsapp.connected ? `Sending from ${whatsapp.displayName || whatsapp.phone}. Invoices, reminders and team alerts can go on WhatsApp.` : 'Connect your own Interakt account to send invoices, reminders and alerts from your WhatsApp number.'}
        >
          <Link href="/app/settings/integrations/whatsapp" className="text-xs text-link hover:underline">{whatsapp.connected ? 'Manage WhatsApp' : 'Connect WhatsApp'}</Link>
        </ServiceCard> : null}

        <ServiceCard
          icon={<HardDrive />}
          name="File storage"
          status={env.STORAGE_DRIVER === 's3' ? 'Cloud bucket' : 'Local disk'}
          tone={env.STORAGE_DRIVER === 's3' ? 'success' : 'info'}
          detail={env.STORAGE_DRIVER === 's3' ? 'Stored in a private bucket. Files open only through Flowbit, after its access checks.' : `Stored under ${env.STORAGE_DIR} on the server.`}
        >
          <p className="text-xs text-[#959596]">This workspace: {storage.n} {storage.n === 1 ? 'file' : 'files'} · {formatBytes(storage.bytes)}</p>
        </ServiceCard>

        <ServiceCard
          icon={<Bot />}
          name="Arc (AI)"
          status={isAnthropicConfigured() ? 'Claude connected' : 'Templates only'}
          tone={isAnthropicConfigured() ? 'success' : 'neutral'}
          detail={isAnthropicConfigured() ? `Drafts with ${ARC_MODELS.draft}; summaries with ${ARC_MODELS.cheap}.` : 'Arc uses built-in templates and workspace search.'}
        >
          <p className="text-xs text-[#959596]">
            This month: {ai.used} of {ai.cap} AI requests ({ctx.entitlements.accountTypeLabel} plan) · {(tokens.input + tokens.output).toLocaleString('en-IN')} tokens.
            {ai.cap === 0 ? ' Your plan uses templates only.' : !ai.allowed ? ' Limit reached: Arc uses templates until the 1st.' : ''}
          </p>
          <p className="text-xs text-[#959596]">Arc reads and suggests. Nothing changes until someone clicks Apply. Salary, bank and PAN details are never sent.</p>
        </ServiceCard>
      </div>
    </>
  )
}
