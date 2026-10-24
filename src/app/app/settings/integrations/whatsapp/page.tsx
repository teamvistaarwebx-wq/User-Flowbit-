import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, BarChart3, Bot, FileText, MessageCircle, MessageSquareText, Send, Webhook } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { requireWhatsAppPage } from '@/modules/features/flags'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CopyButton } from '@/components/settings/copy-button'
import { FactRow, Notice, SurfaceHeader } from '@/components/settings/surface'
import { BotSwitch, ByoConnectForm, CannedRepliesEditor, TemplateMappingForm, TestSendForm } from '@/components/whatsapp/connect-forms'
import { Message } from '@/models/messaging/Message'
import { consoleSettings } from '@/modules/console/settings-query'
import { connectionInfo } from '@/modules/whatsapp/connection'
import { formatPhone } from '@/modules/whatsapp/phone'
import { MANAGED_MODE_AVAILABLE, MODE_LABEL } from '@/modules/whatsapp/provider'
import { WA_CATEGORIES, type WaCategory } from '@/modules/whatsapp/templates'

export const metadata: Metadata = { title: 'WhatsApp' }

const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

type Usage = { _id: { status: string; category: string | null }; n: number; cost: number }

/** Settings → Integrations → WhatsApp (WhatsApp B): the workspace's own number, its templates and its usage. */
export default async function WhatsAppSettingsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  await requireWhatsAppPage()
  const since = daysAgo(30)
  const [info, settings, usage, failed] = await Promise.all([
    connectionInfo(ctx.orgId),
    consoleSettings(),
    ctx.db(Message).aggregate<Usage>([
      { $match: { channel: 'whatsapp', sender: 'workspace', createdAt: { $gte: since } } },
      { $group: { _id: { status: '$status', category: '$params._category' }, n: { $sum: 1 }, cost: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
    ctx.db(Message).find({ channel: 'whatsapp', sender: 'workspace', status: 'failed' }, { to: 1, error: 1, createdAt: 1, title: 1 }).sort({ createdAt: -1 }).limit(8).lean(),
  ])
  const count = (...statuses: string[]) => usage.filter((u) => statuses.includes(u._id.status)).reduce((s, u) => s + u.n, 0)
  const charged = usage.reduce((s, u) => s + u.cost, 0)
  const delivered = usage.filter((u) => ['sent', 'delivered', 'read'].includes(u._id.status))
  const interaktPaise = delivered.reduce((s, u) => {
    const category = (WA_CATEGORIES as readonly string[]).includes(u._id.category ?? '') ? (u._id.category as WaCategory) : 'utility'
    return s + u.n * settings.whatsapp.rates[category] * 100
  }, 0)
  const hookUrl = info.webhookUrl ? `${info.webhookUrl}?token=` : null

  return (
    <>
      <PageHeader title="WhatsApp" description="Send invoices, reminders and team alerts from your own WhatsApp number. Everything still goes by email when WhatsApp cannot deliver." breadcrumb={breadcrumbFor('/app/settings/integrations/whatsapp')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<MessageCircle />} label="How you connect" actions={info.connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[12px] border border-violet-2/60 bg-white/[0.04] p-3 text-sm">
              <p className="font-medium text-white">{MODE_LABEL.byo}</p>
              <p className="mt-1 text-xs text-fg-2">Works today. Interakt (Growth plan or higher) bills you for Meta’s messages. Flowbit charges {settings.wallet.byoFeePaise ? `${formatINR(settings.wallet.byoFeePaise, { decimals: 2 })} a message from your wallet` : 'nothing extra'}.</p>
            </div>
            <div className="rounded-[12px] border border-line bg-white/[0.02] p-3 text-sm opacity-70" aria-disabled="true">
              <p className="flex items-center gap-2 font-medium text-white">Flowbit-managed <Badge tone="info">Coming soon</Badge></p>
              <p className="mt-1 text-xs text-fg-2">No Interakt account of your own: pay per message from your Flowbit wallet ({formatINR(settings.wallet.rates.utility, { decimals: 2 })} a utility message + GST).</p>
            </div>
          </div>
          {!MANAGED_MODE_AVAILABLE ? null : <Notice tone="info">Flowbit-managed numbers are available.</Notice>}
          {!info.encryptionReady ? <Notice tone="warning">This server has no APP_ENCRYPTION_KEY, so keys cannot be stored safely yet. Ask whoever runs Flowbit to set it.</Notice> : null}
          <ByoConnectForm saved={{ connected: info.connected, apiKey: info.apiKey, webhookSecret: info.webhookSecret, displayName: info.displayName, phone: info.phone ? formatPhone(info.phone) : '' }} disabled={!info.encryptionReady} />
          <p className="text-xs text-fg-3">Keys are encrypted before they are stored and are never shown again. Flowbit uses them only to send your messages.</p>
        </Card>

        <div className="space-y-4">
          <Card variant="solid" className="space-y-4 rounded-[10px]">
            <SurfaceHeader icon={<Webhook />} label="Webhook" description="In Interakt → Settings → Developer Settings → Webhook, paste this URL with your webhook secret at the end, and tick message status and incoming messages." />
            {hookUrl ? (
              <>
                <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
                  <code className="min-w-0 flex-1 truncate text-xs text-white/80">{hookUrl}<span className="text-fg-3">&lt;your webhook secret&gt;</span></code>
                  <CopyButton value={hookUrl} />
                </div>
                <p className="text-xs text-fg-3">{info.lastEventAt ? `Last event ${timeAgo(info.lastEventAt)}.` : 'Nothing received yet.'} Delivery ticks, replies and STOP apply to this workspace only.</p>
              </>
            ) : (
              <p className="text-sm text-fg-2">Connect first; your webhook URL appears here.</p>
            )}
          </Card>

          <Card variant="solid" className="space-y-4 rounded-[10px]">
            <SurfaceHeader icon={<Send />} label="Test connection" description="Sends an approved template to the number you type." />
            {info.connected ? <TestSendForm defaultTo="" /> : <p className="text-sm text-fg-2">Connect first.</p>}
            {info.lastTest ? <p className={info.lastTest.ok ? 'text-xs text-fg-3' : 'text-xs text-warning'}>Last test to {info.lastTest.to} {formatDateTime(info.lastTest.at)}: {info.lastTest.ok ? 'accepted by WhatsApp' : info.lastTest.error}</p> : null}
          </Card>

          <Card variant="solid" className="space-y-2 rounded-[10px]">
            <SurfaceHeader icon={<BarChart3 />} label="Last 30 days" />
            <FactRow label="Sent">{count('sent', 'delivered', 'read')} ({count('delivered', 'read')} delivered, {count('read')} read)</FactRow>
            <FactRow label="Failed">{count('failed')}</FactRow>
            <FactRow label="Waiting (wallet empty or cap)">{count('queued')}</FactRow>
            <FactRow label="Charged by Flowbit"><span className="tabular-nums">{formatINR(charged, { decimals: 2 })}</span>{ctx.can('billing.manage') ? <> · <Link href="/app/settings/billing/wallet" className="text-link hover:underline">Wallet</Link></> : null}</FactRow>
            <FactRow label="Interakt bills you about"><span className="tabular-nums">{formatINR(Math.round(interaktPaise), { decimals: 2 })}</span> + GST (Growth plan rates)</FactRow>
          </Card>
        </div>

        {failed.length ? (
          <Card variant="solid" className="space-y-3 rounded-[10px] lg:col-span-2">
            <SurfaceHeader icon={<AlertTriangle />} label="Failed sends" description="Fix the number or the template, then send again from the document." actions={<Link href="/app/settings/messages?channel=whatsapp" className="text-xs text-link hover:underline">Messages log</Link>} />
            <ul className="divide-y divide-line text-sm">
              {failed.map((m) => (
                <li key={String(m._id)} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                  <span className="text-white">{m.title ?? 'WhatsApp message'} · {m.to.join(', ')}</span>
                  <span className="text-xs text-fg-2">{m.error ?? 'Not delivered'} · {formatDateTime((m as { createdAt: Date }).createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<Bot />} label="Employee bot" description="Check in (with a location share) and out, leave balance, apply for leave and a payslip link, in English or Hindi. Employees verify their number and opt in under Profile." />
          <BotSwitch enabled={info.botEnabled} available={info.connected && info.mode === 'byo'} />
          <p className="text-xs text-fg-3">Commands: menu, check in, check out, balance, leave, payslip (or 1 to 5; Hindi works too: चेक इन, छुट्टी, पेस्लिप). Payslip links never show amounts and ask for a code sent to the work email.</p>
        </Card>

        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <SurfaceHeader icon={<MessageSquareText />} label="Saved replies" description="Canned answers for the WhatsApp inbox." />
          <CannedRepliesEditor replies={info.cannedReplies} />
        </Card>

        <Card variant="solid" className="space-y-4 rounded-[10px] lg:col-span-2">
          <SurfaceHeader icon={<FileText />} label="Templates" description="Create these in Interakt and wait for Meta to approve them (the text is in Flowbit's template pack, English and Hindi). Then enter each one's exact name here. Variables: the order of {{1}}, {{2}}… in your template." />
          <TemplateMappingForm registry={info.templates} />
        </Card>
      </div>
    </>
  )
}
