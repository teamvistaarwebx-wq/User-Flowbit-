import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ReactElement, ReactNode } from 'react'
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { FLOWBIT_PDF_BRAND, type PdfBrand } from './brand'
import { footerText, UNSIGNED_FOOTER } from './footer'
import { PdfSignatureBlock, type PdfSignature } from './signature'
import { DEVANAGARI_FAMILY, PDF_FALLBACK_FAMILY, WORK_SANS_EXT_FAMILY, WORK_SANS_FAMILY, pdfFontStack } from './font-stack'

export type { PdfBrand, PdfSignature }

/**
 * Letterhead layout for invoices, payslips and letters. Work Sans is
 * registered from @fontsource when its files are present; otherwise PDFs fall
 * back to Helvetica. The page font is a stack (lib/pdf/font-stack): Work Sans,
 * then its latin-ext subset for ₹, then Noto Sans Devanagari for Hindi names
 * and addresses. Render with `renderPdf(<PdfDocument ...>...</PdfDocument>)`.
 */

const FONT_DIR = path.join(process.cwd(), 'node_modules', '@fontsource', 'work-sans', 'files')
const WEIGHTS = [400, 500, 600, 700] as const

/** The Work Sans woff for one @fontsource subset ('latin' or 'latin-ext') and weight. */
export const workSansFile = (subset: 'latin' | 'latin-ext', weight: number): string => path.join(FONT_DIR, `work-sans-${subset}-${weight}-normal.woff`)

function registerWorkSansSubset(subset: 'latin' | 'latin-ext', family: string): string | null {
  try {
    const fonts = WEIGHTS.map((w) => ({ src: workSansFile(subset, w), fontWeight: w }))
    if (!fonts.every((f) => existsSync(f.src))) return null
    Font.register({ family, fonts })
    return family
  } catch (error) {
    console.error(`[pdf] ${family} registration failed`, error)
    return null
  }
}

function registerWorkSans(): string {
  Font.registerHyphenationCallback((word) => [word])
  return registerWorkSansSubset('latin', WORK_SANS_FAMILY) ?? PDF_FALLBACK_FAMILY
}

export const PDF_FONT = registerWorkSans()

/** Work Sans latin-ext: the rupee sign (U+20B9) and accented Latin, which the latin subset lacks. */
export const PDF_EXT_FONT = registerWorkSansSubset('latin-ext', WORK_SANS_EXT_FAMILY)

export const DEVANAGARI_DIR = path.join(process.cwd(), 'assets', 'fonts', 'noto-sans-devanagari')

/**
 * Noto Sans Devanagari (SIL OFL 1.1, assets/fonts/noto-sans-devanagari/OFL.txt): static Regular and
 * Bold instances subset to Devanagari and Latin, for bilingual Hindi/English payslips and as the
 * Hindi fallback in every other PDF. Null when the files are missing.
 */
function registerDevanagari(): string | null {
  try {
    const fonts = [
      { src: path.join(DEVANAGARI_DIR, 'NotoSansDevanagari-Regular.ttf'), fontWeight: 400 },
      { src: path.join(DEVANAGARI_DIR, 'NotoSansDevanagari-Regular.ttf'), fontWeight: 500 },
      { src: path.join(DEVANAGARI_DIR, 'NotoSansDevanagari-Bold.ttf'), fontWeight: 600 },
      { src: path.join(DEVANAGARI_DIR, 'NotoSansDevanagari-Bold.ttf'), fontWeight: 700 },
    ]
    if (!fonts.every((f) => existsSync(f.src))) return null
    Font.register({ family: DEVANAGARI_FAMILY, fonts })
    return DEVANAGARI_FAMILY
  } catch (error) {
    console.error('[pdf] Noto Sans Devanagari registration failed; payslips stay English', error)
    return null
  }
}

export const PDF_DEVANAGARI_FONT = registerDevanagari()

/** The page font stack: react-pdf takes each character from the first family that has it. */
export const PDF_FONT_STACK = pdfFontStack({ base: PDF_FONT === PDF_FALLBACK_FAMILY ? null : PDF_FONT, ext: PDF_EXT_FONT, devanagari: PDF_DEVANAGARI_FONT })

export const PDF_COLORS = {
  ink: '#1A1626',
  muted: '#6B6478',
  faint: '#9A93A6',
  line: '#E6E1EC',
  soft: '#F7F4FA',
  brand: '#4B2A8C',
  orchid: '#BB62A5',
}

export const pdfStyles = StyleSheet.create({
  // lineHeight lives on the header and body views, not the page: a page-level
  // lineHeight makes react-pdf drop the fixed footer (its page-number text).
  // react-pdf resolves a unitless lineHeight against the declaring view's
  // fontSize and inherits the result in points, so each view sets both, and
  // the big title sets its own.
  page: { fontFamily: PDF_FONT_STACK, fontSize: 9.5, color: PDF_COLORS.ink, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40 },
  body: { fontSize: 9.5, lineHeight: 1.45 },
  header: { fontSize: 9.5, lineHeight: 1.45, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: PDF_COLORS.brand, marginBottom: 18 },
  orgName: { fontSize: 15, lineHeight: 1.25, fontWeight: 700, color: PDF_COLORS.ink },
  orgLine: { fontSize: 8.5, color: PDF_COLORS.muted },
  logo: { width: 44, height: 44, objectFit: 'contain', marginBottom: 6 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 18, lineHeight: 1.2, fontWeight: 700, color: PDF_COLORS.brand, letterSpacing: 0.5 },
  subtitle: { fontSize: 9, color: PDF_COLORS.muted, marginTop: 2 },
  metaRow: { flexDirection: 'row', marginTop: 2 },
  metaLabel: { color: PDF_COLORS.faint, width: 70, textAlign: 'right', marginRight: 6 },
  metaValue: { fontWeight: 600 },
  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 7.5, fontWeight: 600, color: PDF_COLORS.faint, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  tableHead: { flexDirection: 'row', backgroundColor: PDF_COLORS.soft, borderTopWidth: 1, borderBottomWidth: 1, borderColor: PDF_COLORS.line, paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: PDF_COLORS.line, paddingVertical: 5, paddingHorizontal: 6 },
  th: { fontSize: 7.5, fontWeight: 600, color: PDF_COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  watermarkWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  watermark: { fontSize: 64, fontWeight: 700, color: '#E9E3F1', transform: 'rotate(-30deg)', letterSpacing: 4, opacity: 0.7 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: PDF_COLORS.line, paddingTop: 6, fontSize: 7.5, color: PDF_COLORS.faint },
})

export type PdfOrg = {
  name: string
  addressLines?: string[]
  gstin?: string | null
  /** False prints "Not registered under GST"; true or unset prints the GSTIN when there is one. */
  gstRegistered?: boolean | null
  pan?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  /** Absolute file path or data URI of the logo. */
  logoSrc?: string | null
  /** The company's colours for headings and accents (lib/pdf/brand); Flowbit's when unset. */
  brand?: PdfBrand | null
}

/** The colours a document prints in: the issuer's brand, else Flowbit's. */
export const brandOf = (org: Pick<PdfOrg, 'brand'> | null | undefined): PdfBrand => org?.brand ?? FLOWBIT_PDF_BRAND

export type PdfDocumentProps = {
  /** The workspace (author metadata and the default letterhead). */
  org: PdfOrg
  /**
   * Who issues the document, when it isn't the workspace: Flowbit on its own
   * subscription invoices, or a Folio billing entity. Replaces `org` in the letterhead.
   */
  issuer?: PdfOrg
  /** Large diagonal text behind the content: 'DRAFT', 'CANCELLED', 'TEST'. */
  watermark?: string
  /** Big title on the right: 'TAX INVOICE', 'PAYSLIP', 'OFFER LETTER'. */
  title: string
  subtitle?: string
  /** Key facts under the title: [{ label: 'Invoice no.', value: 'INV/012/2026-27' }]. */
  meta?: { label: string; value: string }[]
  children: ReactNode
  /** Footer note; defaults to the computer-generated line without a signature block, else the issuer's name (lib/pdf/footer). */
  footerNote?: string
  /** The signature block after the content: "For <legal name>", the signature, name, designation and seal. */
  signature?: PdfSignature | null
  documentTitle?: string
  size?: 'A4' | 'LETTER'
  /** Overrides the page font (bilingual payslips use Noto Sans Devanagari, which also covers Latin). */
  fontFamily?: string
}

/** The Flowbit mark as a PNG (react-pdf cannot draw SVG), for documents Flowbit itself issues. */
export const FLOWBIT_MARK_PNG = path.join(process.cwd(), 'public', 'brand', 'flowbit-mark-gradient.png')

export { UNSIGNED_FOOTER }

/** "GSTIN: …", "Not registered under GST", or nothing. */
export const gstLine = (org: Pick<PdfOrg, 'gstin' | 'gstRegistered'>): string | null => (org.gstRegistered === false ? 'Not registered under GST' : org.gstin ? `GSTIN: ${org.gstin}` : null)

/** Email, phone and website on one line. */
export const contactLine = (org: Pick<PdfOrg, 'email' | 'phone' | 'website'>): string | null => [org.email, org.phone, org.website].filter(Boolean).join('  ·  ') || null

export function PdfDocument({ org: workspace, issuer, watermark, title, subtitle, meta = [], children, footerNote, signature, documentTitle, size = 'A4', fontFamily }: PdfDocumentProps): ReactElement<DocumentProps> {
  const org = issuer ?? workspace
  const brand = brandOf(org)
  return (
    <Document title={documentTitle ?? `${title} — ${org.name}`} author={org.name} creator="Flowbit" producer="Flowbit">
      <Page size={size} style={fontFamily ? [pdfStyles.page, { fontFamily }] : pdfStyles.page}>
        {watermark ? (
          <View style={pdfStyles.watermarkWrap} fixed>
            <Text style={pdfStyles.watermark}>{watermark}</Text>
          </View>
        ) : null}
        <View style={[pdfStyles.header, { borderBottomColor: brand.heading }]} fixed>
          <View style={{ maxWidth: '58%' }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {org.logoSrc ? <Image src={org.logoSrc} style={pdfStyles.logo} /> : null}
            <Text style={pdfStyles.orgName}>{org.name}</Text>
            {(org.addressLines ?? []).filter(Boolean).map((line) => (
              <Text key={line} style={pdfStyles.orgLine}>{line}</Text>
            ))}
            {gstLine(org) ? <Text style={pdfStyles.orgLine}>{gstLine(org)}</Text> : null}
            {org.pan ? <Text style={pdfStyles.orgLine}>PAN: {org.pan}</Text> : null}
            {contactLine(org) ? <Text style={pdfStyles.orgLine}>{contactLine(org)}</Text> : null}
          </View>
          <View style={pdfStyles.titleBlock}>
            <Text style={[pdfStyles.title, { color: brand.heading }]}>{title}</Text>
            {subtitle ? <Text style={pdfStyles.subtitle}>{subtitle}</Text> : null}
            {meta.map((m) => (
              <View key={m.label} style={pdfStyles.metaRow}>
                <Text style={pdfStyles.metaLabel}>{m.label}</Text>
                <Text style={pdfStyles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={pdfStyles.body}>
          {children}
          {signature ? <PdfSignatureBlock signature={signature} /> : null}
        </View>
        <View style={pdfStyles.footer} fixed>
          <Text style={{ flex: 1, marginRight: 12 }}>{footerNote ?? footerText([signature ? org.name : null], signature)}</Text>
          {/* A render text is measured empty at layout time, so it needs its own width. */}
          <Text style={{ width: 64, textAlign: 'right' }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

/** A labelled block kept on one page; pass `wrap` for long tables so they flow across pages instead of jumping whole. */
/** Letter spacing breaks Devanagari shaping: `tight` drops it (bilingual payslips). */
const TIGHT = { letterSpacing: 0 } as const

export function PdfSection({ label, children, wrap = false, tight = false }: { label?: string; children: ReactNode; wrap?: boolean; tight?: boolean }) {
  return (
    <View style={pdfStyles.section} wrap={wrap}>
      {label ? <Text style={tight ? [pdfStyles.sectionLabel, TIGHT] : pdfStyles.sectionLabel} minPresenceAhead={60}>{label}</Text> : null}
      {children}
    </View>
  )
}

export type PdfColumn = { key: string; header: string; width: string | number; align?: 'left' | 'right' | 'center' }

/** A simple table: widths like '40%' or flex numbers. Cell values are strings. */
export function PdfTable({ columns, rows, tight = false }: { columns: PdfColumn[]; rows: Record<string, string>[]; tight?: boolean }) {
  const cell = (c: PdfColumn) => ({ width: typeof c.width === 'string' ? c.width : undefined, flex: typeof c.width === 'number' ? c.width : undefined, textAlign: c.align ?? 'left' }) as const
  return (
    <View>
      <View style={pdfStyles.tableHead} fixed>
        {columns.map((c) => (
          <Text key={c.key} style={tight ? [pdfStyles.th, cell(c), TIGHT] : [pdfStyles.th, cell(c)]}>{c.header}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={pdfStyles.tableRow} wrap={false}>
          {columns.map((c) => (
            <Text key={c.key} style={cell(c)}>{row[c.key] ?? ''}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/** Label/value rows, e.g. totals: [{ label: 'Subtotal', value: '₹10,000.00' }, { label: 'Total', value: '…', strong: true }]. */
export function PdfKeyValue({ items, width = '45%' }: { items: { label: string; value: string; strong?: boolean }[]; width?: string }) {
  return (
    <View style={{ width, alignSelf: 'flex-end' }}>
      {items.map((it) => (
        <View key={it.label} style={[pdfStyles.kvRow, it.strong ? { borderTopWidth: 1, borderTopColor: PDF_COLORS.line, marginTop: 3, paddingTop: 4 } : {}]}>
          <Text style={{ color: it.strong ? PDF_COLORS.ink : PDF_COLORS.muted, fontWeight: it.strong ? 700 : 400 }}>{it.label}</Text>
          <Text style={{ fontWeight: it.strong ? 700 : 500 }}>{it.value}</Text>
        </View>
      ))}
    </View>
  )
}

/** Renders a PdfDocument to a Buffer (for downloads, email attachments or saveFile). */
export async function renderPdf(element: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(element)
}

/** A route-handler Response for a PDF. `inline` opens in the browser; otherwise downloads. */
export function pdfResponse(buffer: Buffer, filename: string, inline = true): Response {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${safe}"`,
      'cache-control': 'private, no-store',
    },
  })
}
