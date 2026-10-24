import 'server-only'
import { Text } from '@react-pdf/renderer'
import { formatDate } from '@/lib/dates'
import { PdfDocument, renderPdf, type PdfOrg, type PdfSignature } from '@/lib/pdf/base'
import { companyPdfOf, pdfSignature, type OrgPdfSource } from '@/lib/pdf/org-branding'

/**
 * Letter PDF: the company letterhead, reference and date, recipient, bold subject, body paragraphs and the
 * signature block of the signatory stored on the letter (so a reprint is signed as the issue was).
 */

export type LetterPdfData = {
  referenceNumber: string
  issueDate: string
  employeeName: string
  subject: string
  body: string
  signatoryName: string
  signatoryDesignation: string
  /** The company signatory's signature and seal as they were when the letter was drafted or issued. */
  signatureFileId?: unknown
  sealFileId?: unknown
  templateName: string
  watermark?: 'DRAFT' | 'REVOKED'
}

export function LetterDocument({ org, letter, signature }: { org: PdfOrg; letter: LetterPdfData; signature: PdfSignature }): ReturnType<typeof PdfDocument> {
  const paragraphs = letter.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <PdfDocument
      org={org}
      title={letter.templateName.toUpperCase()}
      meta={[
        { label: 'Ref', value: letter.referenceNumber },
        { label: 'Date', value: formatDate(letter.issueDate) },
      ]}
      watermark={letter.watermark}
      documentTitle={`${letter.templateName} — ${letter.employeeName}`}
      footerNote={`${letter.referenceNumber} · Issued by ${org.name}.`}
      signature={signature}
    >
      <Text style={{ marginBottom: 10, fontWeight: 600 }}>{letter.employeeName}</Text>
      <Text style={{ marginBottom: 12, fontWeight: 700, fontSize: 11 }}>{letter.subject}</Text>
      {paragraphs.map((p, i) => (
        <Text key={i} style={{ marginBottom: 9, lineHeight: 1.55 }}>
          {p}
        </Text>
      ))}
    </PdfDocument>
  )
}

/** Renders a letter on the company letterhead, signed by its stored signatory (image and seal read privately). */
export async function renderLetterPdf(org: OrgPdfSource, letter: LetterPdfData): Promise<Buffer> {
  const company = await companyPdfOf(org)
  const signer = { name: letter.signatoryName, designation: letter.signatoryDesignation, signatureFileId: letter.signatureFileId, sealFileId: letter.sealFileId }
  const signature = await pdfSignature(org._id, company.profile.legalName, signer)
  return renderPdf(LetterDocument({ org: company.letterhead, letter, signature }))
}

export const letterFileName = (reference: string, name: string): string => `${reference.replace(/\//g, '-')}_${name.replace(/\s+/g, '_')}.pdf`
