import 'server-only'
import { StyleSheet, Text, View, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { formatDate } from '@/lib/dates'
import { PdfDocument, PdfSection, PdfTable, PDF_COLORS, renderPdf, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { footerText } from '@/lib/pdf/footer'
import { amountInWords, formatINRForPrint as money } from '@/modules/folio/engine/money'
import { printableModel } from './printable'

/** Payment receipt PDF (public link and the thank-you email): what was received, how, and which invoices it paid. */

const s = StyleSheet.create({
  box: { borderWidth: 1, borderColor: PDF_COLORS.line, borderRadius: 6, padding: 10, backgroundColor: PDF_COLORS.soft, marginBottom: 14 },
  label: { fontSize: 7.5, color: PDF_COLORS.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
  amount: { fontSize: 16, fontWeight: 700, marginTop: 3 },
  words: { fontSize: 8.5, color: PDF_COLORS.muted, marginTop: 2 },
  line: { fontSize: 9, color: PDF_COLORS.muted, marginTop: 2 },
})

export type ReceiptPdfModel = {
  issuer: PdfOrg
  /** The entity's signatory, else the company profile's default. */
  signature?: PdfSignature | null
  number: string
  receivedOn: string
  receivedFrom: string
  amountPaise: number
  mode: string
  reference: string | null
  status: string
  allocations: { invoiceNumber: string; amountPaise: number }[]
}

export function ReceiptPdf({ model: raw }: { model: ReceiptPdfModel }): ReactElement<DocumentProps> {
  const model = printableModel(raw)
  return (
    <PdfDocument
      org={model.issuer}
      issuer={model.issuer}
      title="PAYMENT RECEIPT"
      meta={[{ label: 'Receipt no.', value: model.number }, { label: 'Received on', value: formatDate(model.receivedOn) }]}
      documentTitle={`Receipt ${model.number}`}
      watermark={model.status === 'recorded' ? undefined : model.status === 'bounced' ? 'BOUNCED' : 'CANCELLED'}
      footerNote={footerText([model.issuer.name, model.number], model.signature)}
      signature={model.signature}
    >
      <View style={s.box}>
        <Text style={s.label}>Received from {model.receivedFrom}</Text>
        <Text style={s.amount}>{money(model.amountPaise)}</Text>
        <Text style={s.words}>{amountInWords(model.amountPaise)}</Text>
        <Text style={s.line}>By {model.mode}{model.reference ? ` · Ref ${model.reference}` : ''}</Text>
      </View>
      {model.allocations.length ? (
        <PdfSection label="Applied to">
          <PdfTable
            columns={[
              { key: 'invoice', header: 'Invoice', width: '70%' },
              { key: 'amount', header: 'Amount', width: '30%', align: 'right' },
            ]}
            rows={model.allocations.map((a) => ({ invoice: a.invoiceNumber, amount: money(a.amountPaise) }))}
          />
        </PdfSection>
      ) : (
        <Text style={s.line}>Held as an advance against future invoices.</Text>
      )}
    </PdfDocument>
  )
}

export const renderReceiptPdf = (model: ReceiptPdfModel): Promise<Buffer> => renderPdf(<ReceiptPdf model={model} />)
