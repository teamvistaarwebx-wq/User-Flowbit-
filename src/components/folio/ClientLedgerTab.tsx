import Link from 'next/link'
import type { ReactNode } from 'react'
import { BookOpen, CalendarDays, FileDown, FileSpreadsheet, FileText, Lock } from 'lucide-react'
import { getCtx } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref } from '@/lib/list'
import { formatINR } from '@/lib/money'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { clientStatement } from '@/modules/folio/queries/ledger'
import { LEDGER_TYPE_LABELS, closingSentence, type LedgerType, type Statement } from '@/modules/folio/queries/ledger-math'
import { LINK, Note, TableCard, Td, Th, TBODY_ROW, TFOOT_ROW, THEAD_ROW } from './ui'

const TYPE_TONE: Record<LedgerType, Tone> = { opening: 'neutral', tax_invoice: 'neutral', sale_invoice: 'neutral', receipt: 'success', tds: 'info', credit_note: 'warning', write_off: 'danger' }

const money = (p: number) => (p ? formatINR(p) : '')

/** Statement table: brought forward, rows with running balance, totals, closing sentence. Server component. */
export function StatementTable({ statement, clientName, subtitle, actions }: { statement: Statement; clientName: string; subtitle?: string; actions?: ReactNode }) {
  if (!statement.rows.length && !statement.broughtForwardPaise) {
    return (
      <TableCard icon={<BookOpen />} title="Statement of account" subtitle={subtitle} actions={actions}>
        <div className="border-t border-line">
          <EmptyState icon={<BookOpen />} title="Nothing in this period" description="No invoices, receipts or credit notes fall in the dates chosen." compact />
        </div>
      </TableCard>
    )
  }
  const closing = closingSentence(clientName, statement.closingPaise)
  return (
    <TableCard
      icon={<BookOpen />}
      title="Statement of account"
      subtitle={subtitle}
      actions={actions}
      footer={
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{closing.sentence}</p>
          <p className="mt-0.5 text-xs text-fg-2">{closing.words}</p>
        </div>
      }
    >
      {statement.from ? (
        <p className="px-[23px] pb-3 text-[13px] text-fg-2">
          Brought forward on {formatDate(statement.from)}: <span className="font-semibold tabular-nums text-white">{formatINR(statement.broughtForwardPaise)}</span>
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th icon={<CalendarDays />}>Date</Th>
              <Th>Type</Th>
              <Th icon={<FileText />}>Document</Th>
              <Th className="hidden md:table-cell">Particulars</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            <tr aria-hidden className="h-1.5" />
            {statement.rows.map((r) => (
              <tr key={r.sourceId} className={TBODY_ROW}>
                <Td className="whitespace-nowrap text-[#979797]">{formatDate(r.date)}</Td>
                <Td><Badge tone={TYPE_TONE[r.type]}>{LEDGER_TYPE_LABELS[r.type]}</Badge></Td>
                <Td className="whitespace-nowrap">{r.href ? <Link href={r.href} className={cn('font-medium', LINK)}>{r.document}</Link> : <span className="text-white/75">{r.document || '—'}</span>}</Td>
                <Td className="hidden max-w-[280px] truncate text-fg-2 md:table-cell">{r.particulars}</Td>
                <Td align="right" className="tabular-nums">{money(r.debitPaise)}</Td>
                <Td align="right" className="tabular-nums text-[#2DCBAF]">{money(r.creditPaise)}</Td>
                <Td align="right" className={cn('font-medium tabular-nums', r.balancePaise > 0 ? 'text-white' : 'text-[#2DCBAF]')}>{formatINR(r.balancePaise)}</Td>
              </tr>
            ))}
            <tr aria-hidden className="h-1.5" />
          </tbody>
          <tfoot>
            <tr className={TFOOT_ROW}>
              <Td colSpan={3} className="font-semibold">Total</Td>
              <td className="hidden md:table-cell" />
              <Td align="right" className="font-semibold tabular-nums">{formatINR(statement.debitPaise)}</Td>
              <Td align="right" className="font-semibold tabular-nums text-[#2DCBAF]">{formatINR(statement.creditPaise)}</Td>
              <Td align="right" className="font-semibold tabular-nums">{formatINR(statement.closingPaise)}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </TableCard>
  )
}

/** Export links for a client's statement (CSV and PDF, same range). */
export function StatementExports({ clientId, from, to }: { clientId: string; from?: string | null; to?: string | null }) {
  const query = { from: from ?? undefined, to: to ?? undefined }
  return (
    <>
      <a className={buttonClass('secondary', 'sm')} href={buildHref(`/api/folio/ledger/${clientId}/csv`, {}, query)}>
        <FileSpreadsheet className="size-4" /> CSV
      </a>
      <a className={buttonClass('secondary', 'sm')} href={buildHref(`/api/folio/ledger/${clientId}/pdf`, {}, query)} target="_blank" rel="noreferrer">
        <FileDown className="size-4" /> Statement PDF
      </a>
    </>
  )
}

/** Orbit's client "Ledger" tab: the statement of account with CSV/PDF links. */
export async function ClientLedgerTab({ clientId, from, to }: { clientId: string; from?: string; to?: string }) {
  const ctx = await getCtx()
  if (!ctx || !ctx.has('folio') || !ctx.can('folio.read')) {
    return (
      <Note icon={<Lock />}>The ledger needs Folio and permission to view billing.</Note>
    )
  }
  const data = await clientStatement(ctx, clientId, { from, to })
  if (!data) return <EmptyState icon={<BookOpen />} title="Client not found" compact />
  return (
    <StatementTable
      statement={data.statement}
      clientName={data.client.name}
      subtitle={from ? `${formatDate(from)} to ${formatDate(data.statement.to)}` : `As at ${formatDate(data.statement.to)}`}
      actions={
        <>
          <StatementExports clientId={clientId} from={from} to={to} />
          <Link className={buttonClass('ghost', 'sm')} href={`/app/folio/ledger/${clientId}`}>Open in Folio</Link>
        </>
      }
    />
  )
}
