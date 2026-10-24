import Link from 'next/link'
import { FileText, Lock, ReceiptIndianRupee } from 'lucide-react'
import { formatINR } from '@/lib/money'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FolioLink } from '@/modules/orbit/folio-links'
import { PanelHeader, SolidCard } from './parts'

export type FolioCardProps = {
  entitled: boolean
  won: boolean
  canQuote: boolean
  canInvoice: boolean
  links: FolioLink[]
  query: { clientId: string | null; dealId: string; title: string; amountPaise: number }
}

/** Billing for a deal: create a quote or invoice in Folio, and the documents raised for it. */
export function FolioCard({ entitled, won, canQuote, canInvoice, links, query }: FolioCardProps) {
  if (!entitled) {
    return (
      <SolidCard>
        <PanelHeader icon={<ReceiptIndianRupee />} title="Billing" className="mb-3" />
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-icon-muted" />
          <div className="space-y-1">
            <p className="text-sm text-white">Billing with Folio isn&apos;t on your plan</p>
            <p className="text-[13px] text-fg-2">Turn a won deal into a GST quote or invoice in one click.</p>
            <div className="pt-2"><Button size="sm" variant="secondary" href="/app/settings/subscription?add=folio">See plans</Button></div>
          </div>
        </div>
      </SolidCard>
    )
  }
  const params = new URLSearchParams({ dealId: query.dealId, title: query.title, amount: String(query.amountPaise), ...(query.clientId ? { clientId: query.clientId } : {}) }).toString()
  return (
    <SolidCard>
      <PanelHeader icon={<ReceiptIndianRupee />} title="Billing" subtitle={won ? 'The deal is won. Raise the paperwork.' : 'Available now; most teams quote after the deal is won.'} className="mb-4" />
      <div className="flex flex-wrap gap-2">
        {canQuote ? <Button size="sm" variant={won ? 'primary' : 'secondary'} icon={<FileText className="size-4" />} href={`/app/folio/quotes/new?${params}`}>Create quote</Button> : null}
        {canInvoice ? <Button size="sm" variant="secondary" href={`/app/folio/invoices/new?${params}`}>Create invoice</Button> : null}
        {!canQuote && !canInvoice ? <p className="text-[13px] text-fg-2">Ask finance to raise the quote or invoice.</p> : null}
      </div>
      {links.length ? (
        <ul className="mt-4 border-t border-white/[0.06] pt-2">
          {links.map((l) => (
            <li key={l.id}>
              <Link href={l.href} className="-mx-2 flex h-9 items-center justify-between gap-2 rounded-[8px] px-2 text-sm transition-colors hover:bg-white/[0.05]">
                <span className="truncate text-white">{l.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusPill status={l.status} />
                  <span className="tabular-nums text-white">{formatINR(l.totalPaise, { decimals: 0 })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : query.clientId ? (
        <p className="mt-3 text-[13px] text-fg-2">
          No quotes or invoices for this deal yet.{' '}
          <Link href={`/app/clients/${query.clientId}?tab=invoices`} className="text-link transition-colors hover:text-white">Invoices for this client</Link>
        </p>
      ) : null}
    </SolidCard>
  )
}
