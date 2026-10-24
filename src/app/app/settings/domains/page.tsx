import type { Metadata } from 'next'
import { Globe, Mail } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDateTime } from '@/lib/dates'
import { serverEnv } from '@/lib/env'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Note } from '@/components/muster/ui/note'
import { TABLE } from '@/components/muster/ui/list-card'
import { AddDomainForm, DomainButtons } from '@/components/settings/domains/domain-forms'
import { CustomDomain } from '@/models/integrations/CustomDomain'
import { SENDING_LOCAL_PART, STATUS_LABEL } from '@/modules/domains/rules'
import { vercelDomainsOn } from '@/modules/domains/vercel'

export const metadata: Metadata = { title: 'Domains' }
const BASE = '/app/settings/domains'

const tone = (status: string) => (status === 'verified' ? 'success' : status === 'failed' ? 'warning' : 'neutral')

function Checked({ at, error }: { at?: Date | null; error?: string | null }) {
  if (!at && !error) return null
  return <p className={cn('mt-3 text-[13px]', error ? 'text-warning' : 'text-fg-2')}>{error ?? `Last checked ${formatDateTime(at as Date)}`}</p>
}

/** Custom domains add-on: client mail from billing@their domain and the portal on portal.their domain. */
export default async function DomainsPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const entitled = ctx.hasFeature('domains')
  const [sending, portal] = entitled ? await Promise.all([ctx.db(CustomDomain).findOne({ kind: 'sending' }).lean(), ctx.db(CustomDomain).findOne({ kind: 'portal' }).lean()]) : [null, null]
  const target = serverEnv().PORTAL_CNAME_TARGET
  return (
    <>
      <PageHeader title="Domains" description="Send client email from your own domain and serve the client portal on your own address." breadcrumb={breadcrumbFor(BASE)} />
      {!entitled ? (
        <Note tone="info" title="Custom domains is a paid add-on">
          About ₹999 a month. It sends invoices, quotes, statements, reminders and portal email from billing@yourdomain and puts the client portal on portal.yourdomain. Ask Flowbit support to switch it on.
        </Note>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-12 xl:col-span-7">
            <CardHeader
              label="Sending domain"
              icon={<Mail />}
              title={sending ? sending.domain : undefined}
              description={`Client-facing email goes from ${SENDING_LOCAL_PART}@${sending?.domain ?? 'yourdomain'} once the DNS records are verified. Until then, and if you remove it, Flowbit's address is used.`}
              actions={sending ? <Badge tone={tone(sending.status)}>{STATUS_LABEL[sending.status] ?? sending.status}</Badge> : undefined}
            />
            {!sending ? (
              <AddDomainForm kind="sending" placeholder="brightfoods.in" />
            ) : (
              <>
                <p className="mb-2 text-sm text-fg-2">Add these records at your domain registrar (GoDaddy, Hostinger, Cloudflare…):</p>
                <div className="overflow-x-auto">
                  <table className={TABLE.table}>
                    <thead>
                      <tr className={TABLE.headRow}>
                        <th className={TABLE.th}>For</th>
                        <th className={TABLE.th}>Type</th>
                        <th className={TABLE.th}>Name</th>
                        <th className={TABLE.th}>Value</th>
                        <th className={TABLE.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sending.records.map((r) => (
                        <tr key={`${r.type}-${r.name}-${r.purpose}`} className={TABLE.row}>
                          <td className={TABLE.td}>{r.purpose}</td>
                          <td className={TABLE.td}>{r.type}{r.priority != null ? ` (priority ${r.priority})` : ''}</td>
                          <td className={cn(TABLE.td, 'font-mono text-xs')}>{r.name}</td>
                          <td className={cn(TABLE.td, 'max-w-[320px] break-all font-mono text-xs !whitespace-normal')}>{r.value}</td>
                          <td className={TABLE.td}>{STATUS_LABEL[r.status ?? ''] ?? r.status ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Checked at={sending.lastCheckedAt} error={sending.lastError} />
                <div className="mt-4"><DomainButtons kind="sending" domain={sending.domain} /></div>
              </>
            )}
          </Card>
          <Card className="col-span-12 xl:col-span-5">
            <CardHeader
              label="Portal domain"
              icon={<Globe />}
              title={portal ? portal.domain : undefined}
              description="Serve your client portal on your own address, such as portal.yourdomain.com."
              actions={portal ? <Badge tone={tone(portal.status)}>{STATUS_LABEL[portal.status] ?? portal.status}</Badge> : undefined}
            />
            {portal ? (
              <>
                <p className="text-sm text-fg-2">At your registrar add a <span className="text-white">CNAME</span> record:</p>
                <p className="mt-2 break-all font-mono text-xs text-white">{portal.domain} → {target}</p>
                <Checked at={portal.lastCheckedAt} error={portal.lastError} />
                {portal.status === 'verified' && !vercelDomainsOn() && !portal.vercelAdded ? <p className="mt-3 text-[13px] text-fg-2">Flowbit support adds the host to the hosting project so it gets an HTTPS certificate (usually within a working day).</p> : null}
                <div className="mt-4"><DomainButtons kind="portal" domain={portal.domain} /></div>
              </>
            ) : null}
            <div className={portal ? 'mt-5 border-t border-line pt-4' : ''}>
              <AddDomainForm kind="portal" placeholder="portal.brightfoods.in" />
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
