import { StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { PdfDocument, PdfSection, PdfTable, PDF_COLORS, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { formatDate } from '@/lib/dates'
import { formatINRForPrint as money } from '@/modules/folio/engine/money'
import { LEDGER_TYPE_LABELS, closingSentence, type Statement } from '@/modules/folio/queries/ledger-math'
import { printableModel } from './printable'

/** Statement of account (folio.md 8.1): brand letterhead, tiles, running balance from brought forward. */

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tile: { flex: 1, borderWidth: 1, borderColor: PDF_COLORS.line, borderRadius: 6, padding: 8, backgroundColor: PDF_COLORS.soft },
  tileLabel: { fontSize: 7, color: PDF_COLORS.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
  tileValue: { fontSize: 11, fontWeight: 700, marginTop: 3 },
  account: { marginBottom: 12 },
  accountName: { fontSize: 11, fontWeight: 700 },
  line: { fontSize: 8.5, color: PDF_COLORS.muted },
  totals: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: PDF_COLORS.line },
  totalsText: { fontWeight: 700 },
  closing: { marginTop: 12, padding: 10, backgroundColor: PDF_COLORS.soft, borderRadius: 6 },
  closingText: { fontSize: 10, fontWeight: 700 },
  words: { fontSize: 8.5, color: PDF_COLORS.muted, marginTop: 2 },
})

export type StatementPdfProps = {
  workspace: PdfOrg
  issuer: PdfOrg
  /** The entity's signatory, else the company profile's default. */
  signature?: PdfSignature | null
  brandLine: string
  client: { name: string; legalName: string; addressLines: string[]; gstin: string | null }
  statement: Statement
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, color ? { color } : {}]}>{value}</Text>
    </View>
  )
}

export function StatementPdf(props: StatementPdfProps): ReactElement<DocumentProps> {
  const { workspace, issuer, signature, brandLine, client, statement } = printableModel(props)
  const period = statement.from ? `${formatDate(statement.from)} to ${formatDate(statement.to)}` : `As at ${formatDate(statement.to)}`
  const closing = closingSentence(client.name, statement.closingPaise, money)
  const rows = statement.rows.map((r) => ({
    date: formatDate(r.date),
    type: LEDGER_TYPE_LABELS[r.type],
    // Number on the first line, particulars under it: seven columns do not fit an A4 width at 9.5pt.
    doc: [r.document, r.particulars].filter(Boolean).join('\n'),
    debit: r.debitPaise ? money(r.debitPaise) : '',
    credit: r.creditPaise ? money(r.creditPaise) : '',
    balance: money(r.balancePaise),
  }))
  const opening = statement.from ? [{ date: formatDate(statement.from), type: '', doc: 'Brought forward', debit: '', credit: '', balance: money(statement.broughtForwardPaise) }] : []
  return (
    <PdfDocument
      org={workspace}
      issuer={issuer}
      title="STATEMENT OF ACCOUNT"
      subtitle={client.name}
      meta={[{ label: 'Period', value: period }]}
      documentTitle={`Statement — ${client.name}`}
      footerNote={`${brandLine} · Statement for ${client.name}`}
      signature={signature}
    >
      <View style={s.account}>
        <Text style={pdfLabel}>Account of</Text>
        <Text style={s.accountName}>{client.legalName}</Text>
        {client.addressLines.map((l) => (
          <Text key={l} style={s.line}>{l}</Text>
        ))}
        {client.gstin ? <Text style={s.line}>GSTIN: {client.gstin}</Text> : null}
      </View>
      <View style={s.tiles}>
        {statement.from ? <Tile label="Brought forward" value={money(statement.broughtForwardPaise)} /> : null}
        <Tile label="Billed" value={money(statement.debitPaise)} />
        <Tile label="Received & credited" value={money(statement.creditPaise)} color="#1F8A5B" />
        <Tile label="Closing balance" value={money(statement.closingPaise)} color={statement.closingPaise > 0 ? '#C0264D' : '#1F8A5B'} />
      </View>
      <PdfSection label="Transactions" wrap>
        <PdfTable
          columns={[
            { key: 'date', header: 'Date', width: '12%' },
            { key: 'type', header: 'Type', width: '12%' },
            { key: 'doc', header: 'Document · particulars', width: '31%' },
            { key: 'debit', header: 'Debit', width: '15%', align: 'right' },
            { key: 'credit', header: 'Credit', width: '15%', align: 'right' },
            { key: 'balance', header: 'Balance', width: '15%', align: 'right' },
          ]}
          rows={[...opening, ...rows]}
        />
        <View style={s.totals}>
          <Text style={s.totalsText}>Debit {money(statement.debitPaise)}</Text>
          <Text style={s.totalsText}>Credit {money(statement.creditPaise)}</Text>
          <Text style={s.totalsText}>Closing {money(statement.closingPaise)}</Text>
        </View>
      </PdfSection>
      <View style={s.closing} wrap={false}>
        <Text style={s.closingText}>{closing.sentence}</Text>
        <Text style={s.words}>{closing.words}</Text>
      </View>
    </PdfDocument>
  )
}

const pdfLabel = { fontSize: 7.5, fontWeight: 600, color: PDF_COLORS.faint, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 3 }
