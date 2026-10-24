import 'server-only'
import { Text, View } from '@react-pdf/renderer'
import { formatDate, formatDateTime } from '@/lib/dates'
import { amountInWords, formatINRForPrint } from '@/lib/money'
import { brandOf, PDF_COLORS, PDF_DEVANAGARI_FONT, PdfDocument, PdfKeyValue, PdfSection, PdfTable, renderPdf, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { saysNoSignatureNeeded } from '@/lib/pdf/footer'
import { t, type MessageKey, type Vars } from '@/lib/i18n'
import type { EntrySnapshot } from './snapshot'

/**
 * Payslip PDF, built only from the entry and its snapshot (so a re-send never changes a figure).
 * `language: 'bilingual'` prints every label as "English / हिन्दी" in Noto Sans Devanagari; without
 * that font on the server it stays English.
 */

export type PayslipLanguage = 'en' | 'bilingual'

type Label = (key: MessageKey, vars?: Vars) => string

/** English labels, or "English / हिन्दी" when the Devanagari font is available. */
export function payslipLabels(language: PayslipLanguage, fontReady: boolean = PDF_DEVANAGARI_FONT !== null): Label {
  if (language !== 'bilingual' || !fontReady) return (key, vars) => t('en', key, vars)
  return (key, vars) => {
    const english = t('en', key, vars)
    const hindi = t('hi', key, vars)
    return english === hindi ? english : `${english} / ${hindi}`
  }
}

export type PayslipLine = { code: string; label: string; lineType: string; amount: number }

export type PayslipData = {
  monthLabel: string
  payslipNumber: string
  employeeName: string
  employeeCode: string
  workingDays: number
  payableDays: number
  lopDays: number
  totalEarnings: number
  totalDeductions: number
  reimbursementAmount: number
  netPay: number
  lines: PayslipLine[]
  snapshot: EntrySnapshot | null
}

const money = (p: number) => formatINRForPrint(p)
const days = (n: number) => String(Math.round(n * 100) / 100)

function lineRows(lines: PayslipLine[], L: Label): Record<string, string>[] {
  return lines.length ? lines.map((l) => ({ label: l.label, amount: money(l.amount) })) : [{ label: L('slip.none'), amount: money(0) }]
}

const amountColumns = (L: Label) => [
  { key: 'label', header: L('slip.component'), width: 3 },
  { key: 'amount', header: L('slip.amount'), width: 2, align: 'right' as const },
]

/** A payslip on the company letterhead; `signature` (Company profile → "Show signature on payslips") replaces the unsigned line. */
export function PayslipDocument({ org, data, language = 'en', signature = null }: { org: PdfOrg; data: PayslipData; language?: PayslipLanguage; signature?: PdfSignature | null }): ReturnType<typeof PdfDocument> {
  const L = payslipLabels(language)
  const bilingual = L('slip.none') !== 'None'
  const AMOUNT_COLUMNS = amountColumns(L)
  const e = data.snapshot?.employee
  const earnings = data.lines.filter((l) => l.lineType === 'earning')
  const deductions = data.lines.filter((l) => l.lineType === 'deduction')
  const employer = data.lines.filter((l) => l.lineType === 'employer_contribution')
  const generatedAt = data.snapshot?.generatedAt ? formatDateTime(data.snapshot.generatedAt) : ''
  const bank = [e?.bankAccountMasked, e?.bankName].filter(Boolean).join(' · ')
  const details = [
    { label: L('slip.employee'), value: data.employeeName },
    { label: L('slip.employeeId'), value: data.employeeCode },
    { label: L('slip.designation'), value: e?.designation || '—' },
    { label: L('slip.department'), value: e?.department || '—' },
    { label: L('slip.joined'), value: e?.joinDate ? formatDate(e.joinDate) : '—' },
    { label: L('slip.pan'), value: e?.pan || '—' },
    { label: L('slip.uan'), value: e?.uan || '—' },
    { label: L('slip.bank'), value: bank || '—' },
    { label: L('slip.working'), value: days(data.workingDays) },
    { label: L('slip.payable'), value: days(data.payableDays) },
    { label: L('slip.lop'), value: days(data.lopDays) },
  ]
  return (
    <PdfDocument
      org={org}
      title={L('slip.title')}
      subtitle={data.monthLabel.toUpperCase()}
      meta={[{ label: L('slip.number'), value: data.payslipNumber }]}
      documentTitle={`Payslip ${data.monthLabel} — ${data.employeeName}`}
      footerNote={L(saysNoSignatureNeeded(signature) ? 'slip.footer' : 'slip.footerSigned', { at: generatedAt })}
      signature={signature}
      fontFamily={bilingual ? (PDF_DEVANAGARI_FONT ?? undefined) : undefined}
    >
      <PdfSection tight={bilingual} label={L('slip.employee')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {details.map((d) => (
            <View key={d.label} style={{ width: '50%', flexDirection: 'row', paddingVertical: 2 }}>
              <Text style={{ width: bilingual ? 140 : 90, paddingRight: 6, color: PDF_COLORS.muted }}>{d.label}</Text>
              <Text style={{ fontWeight: 600 }}>{d.value}</Text>
            </View>
          ))}
        </View>
      </PdfSection>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <PdfSection tight={bilingual} label={L('slip.earnings')}>
            <PdfTable tight={bilingual} columns={AMOUNT_COLUMNS} rows={lineRows(earnings, L)} />
            <PdfKeyValue width="100%" items={[{ label: L('slip.gross'), value: money(data.totalEarnings), strong: true }]} />
          </PdfSection>
        </View>
        <View style={{ flex: 1 }}>
          <PdfSection tight={bilingual} label={L('slip.deductions')}>
            <PdfTable tight={bilingual} columns={AMOUNT_COLUMNS} rows={lineRows(deductions, L)} />
            <PdfKeyValue width="100%" items={[{ label: L('slip.totalDeductions'), value: money(data.totalDeductions), strong: true }]} />
          </PdfSection>
        </View>
      </View>
      {data.reimbursementAmount > 0 ? (
        <PdfSection tight={bilingual} label={L('slip.reimbursements')}>
          <PdfTable tight={bilingual} columns={AMOUNT_COLUMNS} rows={[{ label: L('slip.claims'), amount: money(data.reimbursementAmount) }]} />
        </PdfSection>
      ) : null}
      <View style={{ marginVertical: 10, padding: 12, borderRadius: 6, backgroundColor: PDF_COLORS.soft, borderWidth: 1, borderColor: PDF_COLORS.line }} wrap={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: 600, color: brandOf(org).heading }}>{L('slip.netPay')}</Text>
          <Text style={{ fontSize: 16, fontWeight: 700 }}>{money(data.netPay)}</Text>
        </View>
        <Text style={{ marginTop: 4, color: PDF_COLORS.muted }}>{amountInWords(data.netPay)}</Text>
      </View>
      {employer.length ? (
        <PdfSection tight={bilingual} label={L('slip.employer')}>
          <PdfTable tight={bilingual} columns={AMOUNT_COLUMNS} rows={lineRows(employer, L)} />
        </PdfSection>
      ) : null}
    </PdfDocument>
  )
}

export const renderPayslipPdf = (org: PdfOrg, data: PayslipData, language: PayslipLanguage = 'en', signature: PdfSignature | null = null): Promise<Buffer> => renderPdf(PayslipDocument({ org, data, language, signature }))
