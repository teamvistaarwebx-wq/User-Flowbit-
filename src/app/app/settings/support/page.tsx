import type { Metadata } from 'next'
import { Check, FileCheck2, ShieldCheck, Upload, X } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { DPA_HREF, dpaAccepted, SUPPORT_MODE_LABEL, supportStatus } from '@/lib/console/support-access'
import { formatDateTime } from '@/lib/dates'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { DpaForm, SupportDecision } from '@/components/settings/support-access'
import { SupportAccess } from '@/models/console/SupportAccess'
import { IMPORTERS } from '@/modules/imports/registry'
import { importScope, NOT_IMPORTABLE } from '@/modules/imports/support-scope'

export const metadata: Metadata = { title: 'Support access' }

const STATUS_WORD = { requested: 'Waiting for you', active: 'Running', expired: 'Ended', denied: 'Declined', revoked: 'Ended by you' } as const

/**
 * The owner decides whether the Flowbit team may see this workspace (console
 * spec 8): read-only by default and time-limited; import access (spec 9) also
 * needs the data processing agreement.
 */
export default async function SupportAccessPage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const rows = await ctx.db(SupportAccess).find({}).sort({ createdAt: -1 }).limit(30).lean()
  const accepted = dpaAccepted(ctx.org.dpa)
  const scope = importScope(Object.values(IMPORTERS))
  return (
    <>
      <PageHeader title="Support access" help="support-access" description="The Flowbit team sees your data only when the owner allows it, for a limited time." breadcrumb={breadcrumbFor('/app/settings/support')} />
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 rounded-[16px] lg:col-span-4">
          <CardHeader label="Data processing agreement" icon={<FileCheck2 strokeWidth={1.5} />} description={accepted ? `Accepted ${formatDateTime(ctx.org.dpa!.acceptedAt!)}.` : 'Needed before the Flowbit team imports your data for you.'} />
          {accepted ? null : ctx.isOwner ? <DpaForm href={DPA_HREF} /> : <p className="text-sm text-fg-2">Only the workspace owner can accept it.</p>}
        </Card>
        <Card className="col-span-12 rounded-[16px] lg:col-span-8">
          <CardHeader label="Requests" icon={<ShieldCheck strokeWidth={1.5} />} description="Read-only access ends on its own; import access lasts 7 days. Salary, bank and PAN details stay masked for the sales and accounts team." />
          {rows.length ? (
            <ul className="-mx-5 divide-y divide-white/[0.06] border-t border-line">
              {rows.map((r) => {
                const status = supportStatus(r)
                return (
                  <li key={String(r._id)} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block text-white">{r.staffName} · {SUPPORT_MODE_LABEL[r.mode]} · {r.mode === 'import' ? '7 days' : `${r.hours} hours`}</span>
                      <span className="block text-xs text-fg-2">{r.reason}</span>
                      <span className="block text-xs text-[#979797]">{STATUS_WORD[status]}{status === 'active' && r.expiresAt ? ` until ${formatDateTime(r.expiresAt)}` : ''} · asked {formatDateTime(r.createdAt)}</span>
                    </span>
                    {status === 'requested' || status === 'active' ? <SupportDecision id={String(r._id)} mode={status} isOwner={ctx.isOwner} /> : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={<ShieldCheck />} title="No requests" description="When the Flowbit team asks to look at your workspace, the request shows here and you get an email." />
          )}
        </Card>
        <Card className="col-span-12 rounded-[16px]">
          <CardHeader label="What import access covers" icon={<Upload strokeWidth={1.5} />} description="With import access, the Flowbit team can load these from your spreadsheets (CSV or Excel), the same importers as Settings → Import. Every import can be undone for 7 days." />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-success">Can import</h3>
              <ul className="space-y-2.5 text-sm">
                {scope.map((r) => (
                  <li key={r.kind} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span className="min-w-0"><span className="text-white">{r.label}</span> <span className="text-xs text-[#979797]">· {r.product}</span><span className="block text-xs text-fg-2">{r.description}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-danger">Cannot import</h3>
              <ul className="space-y-2.5 text-sm">
                {NOT_IMPORTABLE.map((n) => (
                  <li key={n.label} className="flex gap-2.5">
                    <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="min-w-0"><span className="text-white">{n.label}</span><span className="block text-xs text-fg-2">{n.reason}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
