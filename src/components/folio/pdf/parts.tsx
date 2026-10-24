import type { ReactElement } from 'react'
import { Path, StyleSheet, Svg, Text, View, type DocumentProps } from '@react-pdf/renderer'
import { brandOf, PdfDocument, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { PdfSignatureBlock } from '@/lib/pdf/signature'
import { amountInWords, formatINRForPrint } from '@/modules/folio/engine/money'
import { printableModel } from './printable'

/**
 * The shared skeleton of Folio's printed documents (invoice, quote, credit
 * note) on top of core `PdfDocument`. Printed documents are light: they get
 * printed and forwarded. Money prints as "Rs." (formatINRForPrint).
 */

const INK = '#0B0B0C'
const MUTED = '#55555C'
const RULE = '#E6E6EA'
const SUNK = '#F7F7F9'

const s = StyleSheet.create({
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, gap: 18 },
  col: { flex: 1 },
  // Colour comes from the issuer's brand (brandOf), set where the label is drawn.
  label: { fontSize: 7.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  strong: { fontWeight: 700, color: INK, fontSize: 10 },
  line: { color: MUTED, fontSize: 8.5 },
  kv: { flexDirection: 'row', marginBottom: 2 },
  kvLabel: { color: MUTED, width: 92, fontSize: 8.5 },
  kvValue: { color: INK, fontSize: 8.5, flex: 1 },
  head: { flexDirection: 'row', backgroundColor: SUNK, borderTopWidth: 1, borderBottomWidth: 1, borderColor: RULE, paddingVertical: 5, paddingHorizontal: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: RULE, paddingVertical: 5, paddingHorizontal: 4 },
  th: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 8.5, color: INK },
  totals: { width: 240, alignSelf: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: INK, marginTop: 4, paddingTop: 5 },
  words: { marginTop: 10, fontSize: 8.5, color: MUTED },
  panel: { flexDirection: 'row', backgroundColor: SUNK, borderRadius: 6, padding: 10, marginTop: 14, gap: 18 },
  note: { fontSize: 8, color: MUTED, marginTop: 6 },
})

export type PdfParty = { name: string; addressLines: string[]; extra: string[] }
export type PdfLine = { description: string; hsnSac?: string | null; qty: string; rate: number; discountPercent: number; gstRate: number; amount: number }
export type PdfTotalRow = { label: string; amount: number; negative?: boolean }
export type PdfTaxRow = { hsnSac: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }

export type FolioPdfModel = {
  title: string
  number: string
  meta: { label: string; value: string }[]
  issuer: PdfOrg
  /** "For {legal name}" in the signature block when `signatory` is missing. */
  legalName: string
  isTax: boolean
  billTo: PdfParty
  details: { label: string; value: string }[]
  lines: PdfLine[]
  totals: PdfTotalRow[]
  totalPaise: number
  afterTotal: PdfTotalRow[]
  taxSummary?: { rows: PdfTaxRow[]; intra: boolean; sgstLabel: string }
  bank?: { accountName: string; bankName: string; branch?: string | null; accountNumber: string; ifsc: string; upiId?: string | null } | null
  /** UPI intent QR for the balance (lib/upi): dark modules as one path on a size × size grid. */
  upiQr?: { path: string; size: number; caption: string } | null
  /** E-invoice: the IRN, acknowledgement, the IRP's signed QR (as a path) and any e-way bill. */
  einvoice?: { irn: string; ackNo: string; ackDate: string; qr: { path: string; size: number }; ewbNo?: string | null; ewbValidTill?: string | null } | null
  terms?: string | null
  notes?: string | null
  /** The entity's signatory, else the company profile's default (components/folio/pdf/assets folioIssuer). */
  signatory?: PdfSignature
  notices: string[]
  footer: string
  watermark?: string
}

const money = (paise: number) => formatINRForPrint(paise)

function Party({ label, party, accent }: { label: string; party: PdfParty; accent: string }) {
  return (
    <View style={s.col}>
      <Text style={[s.label, { color: accent }]}>{label}</Text>
      <Text style={s.strong}>{party.name}</Text>
      {[...party.addressLines, ...party.extra].filter(Boolean).map((l, i) => (
        <Text key={i} style={s.line}>{l}</Text>
      ))}
    </View>
  )
}

function LinesTable({ lines, isTax }: { lines: PdfLine[]; isTax: boolean }) {
  const hasDiscount = lines.some((l) => l.discountPercent > 0)
  const cols = [
    { key: '#', w: 18, align: 'left' as const },
    { key: 'Description', w: 0, align: 'left' as const },
    ...(isTax ? [{ key: 'SAC', w: 46, align: 'left' as const }] : []),
    { key: 'Qty', w: 54, align: 'right' as const },
    { key: 'Rate', w: 70, align: 'right' as const },
    ...(hasDiscount ? [{ key: 'Disc %', w: 36, align: 'right' as const }] : []),
    ...(isTax ? [{ key: 'GST %', w: 34, align: 'right' as const }] : []),
    { key: 'Amount', w: 78, align: 'right' as const },
  ]
  const style = (c: (typeof cols)[number]) => (c.w ? { width: c.w, textAlign: c.align } : { flex: 1, textAlign: c.align })
  return (
    <View>
      <View style={s.head} fixed>
        {cols.map((c) => <Text key={c.key} style={[s.th, style(c)]}>{c.key}</Text>)}
      </View>
      {lines.map((l, i) => {
        const cells: Record<string, string> = { '#': String(i + 1), Description: l.description, SAC: l.hsnSac ?? '', Qty: l.qty, Rate: money(l.rate), 'Disc %': l.discountPercent ? String(l.discountPercent) : '', 'GST %': String(l.gstRate), Amount: money(l.amount) }
        return (
          <View key={i} style={s.row} wrap={false}>
            {cols.map((c) => <Text key={c.key} style={[s.td, style(c)]}>{cells[c.key]}</Text>)}
          </View>
        )
      })}
    </View>
  )
}

function Totals({ model }: { model: FolioPdfModel }) {
  return (
    <View style={s.totals} wrap={false}>
      {model.totals.map((t) => (
        <View key={t.label} style={s.totalRow}>
          <Text style={s.line}>{t.label}</Text>
          <Text style={s.td}>{t.negative ? '− ' : ''}{money(t.amount)}</Text>
        </View>
      ))}
      <View style={s.grand}>
        <Text style={{ fontSize: 12, fontWeight: 700 }}>Total</Text>
        <Text style={{ fontSize: 12, fontWeight: 700 }}>{money(model.totalPaise)}</Text>
      </View>
      {model.afterTotal.map((t) => (
        <View key={t.label} style={s.totalRow}>
          <Text style={s.line}>{t.label}</Text>
          <Text style={s.td}>{t.negative ? '− ' : ''}{money(t.amount)}</Text>
        </View>
      ))}
    </View>
  )
}

function TaxSummary({ summary, accent }: { summary: NonNullable<FolioPdfModel['taxSummary']>; accent: string }) {
  const cols = summary.intra ? ['SAC', 'Taxable', 'CGST', summary.sgstLabel, 'Total tax'] : ['SAC', 'Taxable', 'IGST', 'Total tax']
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={[s.label, { color: accent }]}>Tax summary</Text>
      <View style={s.head}>
        {cols.map((c, i) => <Text key={c} style={[s.th, i === 0 ? { flex: 1 } : { width: 90, textAlign: 'right' }]}>{c}</Text>)}
      </View>
      {summary.rows.map((r, i) => {
        const half = r.rate / 2
        const cells = summary.intra
          ? [`${r.hsnSac || '—'} @ ${r.rate}%`, money(r.taxable), `${half}% ${money(r.cgst)}`, `${half}% ${money(r.sgst)}`, money(r.cgst + r.sgst)]
          : [`${r.hsnSac || '—'} @ ${r.rate}%`, money(r.taxable), `${r.rate}% ${money(r.igst)}`, money(r.igst)]
        return (
          <View key={i} style={s.row}>
            {cells.map((c, j) => <Text key={j} style={[s.td, j === 0 ? { flex: 1 } : { width: 90, textAlign: 'right' }]}>{c}</Text>)}
          </View>
        )
      })}
    </View>
  )
}

function PaymentPanel({ model, accent }: { model: FolioPdfModel; accent: string }) {
  if (!model.bank && !model.terms && !model.notes && !model.upiQr) return null
  return (
    <View style={s.panel} wrap={false}>
      {model.bank ? (
        <View style={s.col}>
          <Text style={[s.label, { color: accent }]}>Payment details</Text>
          <Text style={s.td}>{model.bank.accountName}</Text>
          <Text style={s.line}>{[model.bank.bankName, model.bank.branch].filter(Boolean).join(', ')}</Text>
          <Text style={s.line}>A/c {model.bank.accountNumber} · IFSC {model.bank.ifsc}</Text>
          {model.bank.upiId ? <Text style={s.line}>UPI {model.bank.upiId}</Text> : null}
        </View>
      ) : null}
      {model.upiQr ? (
        <View style={{ alignItems: 'center', width: 96 }}>
          <Svg width={84} height={84} viewBox={`-2 -2 ${model.upiQr.size + 4} ${model.upiQr.size + 4}`}>
            <Path d={model.upiQr.path} fill="#000000" />
          </Svg>
          <Text style={[s.line, { textAlign: 'center', marginTop: 2 }]}>{model.upiQr.caption}</Text>
        </View>
      ) : null}
      {model.terms || model.notes ? (
        <View style={s.col}>
          <Text style={[s.label, { color: accent }]}>Terms</Text>
          {model.terms ? <Text style={s.line}>{model.terms}</Text> : null}
          {model.notes ? <Text style={[s.line, { marginTop: 4 }]}>{model.notes}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

/** IRN block under the header: the IRP's signed QR with the IRN and acknowledgement (CGST rule 48(4)). */
function EinvoiceBlock({ einvoice }: { einvoice: NonNullable<FolioPdfModel['einvoice']> }) {
  return (
    <View style={[s.panel, { marginTop: 0, marginBottom: 12, alignItems: 'center' }]} wrap={false}>
      <Svg width={92} height={92} viewBox={`-2 -2 ${einvoice.qr.size + 4} ${einvoice.qr.size + 4}`}>
        <Path d={einvoice.qr.path} fill="#000000" />
      </Svg>
      <View style={s.col}>
        <Text style={s.line}>IRN</Text>
        <Text style={[s.td, { fontSize: 7.5 }]}>{einvoice.irn}</Text>
        <Text style={[s.line, { marginTop: 4 }]}>Ack no. {einvoice.ackNo} · Ack date {einvoice.ackDate}</Text>
        {einvoice.ewbNo ? <Text style={s.line}>E-way bill {einvoice.ewbNo}{einvoice.ewbValidTill ? ` · valid till ${einvoice.ewbValidTill}` : ''}</Text> : null}
      </View>
    </View>
  )
}

/** Renders any Folio document from its print model. */
export function FolioPdf({ model: raw }: { model: FolioPdfModel }): ReactElement<DocumentProps> {
  const model = printableModel(raw)
  const accent = brandOf(model.issuer).accent
  return (
    <PdfDocument org={model.issuer} issuer={model.issuer} title={model.title} meta={model.meta} watermark={model.watermark} footerNote={model.footer} documentTitle={`${model.title} ${model.number}`}>
      {model.einvoice ? <EinvoiceBlock einvoice={model.einvoice} /> : null}
      <View style={s.parties}>
        <Party label="Billed to" party={model.billTo} accent={accent} />
        <View style={s.col}>
          {model.details.map((d) => (
            <View key={d.label} style={s.kv}>
              <Text style={s.kvLabel}>{d.label}</Text>
              <Text style={s.kvValue}>{d.value}</Text>
            </View>
          ))}
        </View>
      </View>
      <LinesTable lines={model.lines} isTax={model.isTax} />
      <Totals model={model} />
      <Text style={s.words}>Amount in words: <Text style={{ fontWeight: 700, color: INK }}>{amountInWords(model.totalPaise)}</Text></Text>
      {model.notices.map((n) => <Text key={n} style={s.note}>{n}</Text>)}
      {model.taxSummary && model.taxSummary.rows.length ? <TaxSummary summary={model.taxSummary} accent={accent} /> : null}
      <PaymentPanel model={model} accent={accent} />
      <PdfSignatureBlock signature={model.signatory ?? { forName: model.legalName }} />
    </PdfDocument>
  )
}

/** Tax summary rows grouped by SAC and rate. */
export function taxSummaryRows(lines: { hsnSac?: string | null; gstRatePercent: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[]): PdfTaxRow[] {
  const map = new Map<string, PdfTaxRow>()
  for (const l of lines) {
    const key = `${l.hsnSac ?? ''}|${l.gstRatePercent}`
    const row = map.get(key) ?? { hsnSac: l.hsnSac ?? '', rate: l.gstRatePercent, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    map.set(key, { ...row, taxable: row.taxable + l.taxablePaise, cgst: row.cgst + l.cgstPaise, sgst: row.sgst + l.sgstPaise, igst: row.igst + l.igstPaise })
  }
  return [...map.values()]
}

/** "CGST @ 9%" rows, one per distinct rate. */
export function taxRows(lines: { gstRatePercent: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[], sgstLabel: string): PdfTotalRow[] {
  const rates = [...new Set(lines.map((l) => l.gstRatePercent))].filter((r) => r > 0).sort((a, b) => a - b)
  return rates.flatMap((rate) => {
    const at = lines.filter((l) => l.gstRatePercent === rate)
    const cgst = at.reduce((t, l) => t + l.cgstPaise, 0)
    const sgst = at.reduce((t, l) => t + l.sgstPaise, 0)
    const igst = at.reduce((t, l) => t + l.igstPaise, 0)
    return [
      ...(cgst ? [{ label: `CGST @ ${rate / 2}%`, amount: cgst }, { label: `${sgstLabel} @ ${rate / 2}%`, amount: sgst }] : []),
      ...(igst ? [{ label: `IGST @ ${rate}%`, amount: igst }] : []),
    ]
  })
}

export { qtyLabel } from './printable'
