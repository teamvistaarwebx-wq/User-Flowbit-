import 'server-only'
import type { Types } from 'mongoose'
import { readStoredFile } from '@/lib/files'
import { inheritFromProfile } from '@/lib/company-profile'
import type { PdfOrg, PdfSignature } from '@/lib/pdf/base'
import { orgPdfCompany, pdfSignature } from '@/lib/pdf/org-branding'
import { stateLabelOf } from '@/modules/folio/engine/states'

/** PNG/JPEG stored files as data URIs for @react-pdf (it cannot draw WebP or GIF). */
export async function imageSrc(orgId: Types.ObjectId, fileId: unknown): Promise<string | null> {
  if (!fileId) return null
  const stored = await readStoredFile(orgId, String(fileId))
  if (!stored || !['image/png', 'image/jpeg'].includes(stored.file.mime)) return null
  return `data:${stored.file.mime};base64,${stored.data.toString('base64')}`
}

export type IssuerSnapshot = {
  legalName?: string | null
  tradeName?: string | null
  gstin?: string | null
  pan?: string | null
  cinLlpin?: string | null
  addressLines?: string[] | null
  city?: string | null
  stateCode?: string | null
  pincode?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  logoFileId?: unknown
  signatoryName?: string | null
  signatoryTitle?: string | null
  signatureFileId?: unknown
}

export type PartyLike = { name?: string | null; addressLines?: string[] | null; city?: string | null; stateCode?: string | null; pincode?: string | null; gstin?: string | null }

/**
 * The letterhead and signature block for a Folio document. A tax document leads with the legal name (whose
 * GSTIN it is). Colours come from the workspace; logo, email, phone, website and the signatory each fall
 * back to the company profile when the entity leaves them blank (the entity's signatory first, then the
 * profile's default).
 */
export async function folioIssuer(orgId: Types.ObjectId, from: IssuerSnapshot, opts: { showGstin: boolean; brandLine: boolean }): Promise<{ issuer: PdfOrg; signature: PdfSignature }> {
  const company = await orgPdfCompany(orgId)
  const merged = inheritFromProfile(from, company.profile)
  const own = merged.inherited.logo ? null : await imageSrc(orgId, merged.logoFileId)
  const brand = opts.brandLine && from.tradeName && from.tradeName !== from.legalName ? [`${from.tradeName} — a brand of ${from.legalName}`] : []
  const issuer: PdfOrg = {
    name: (opts.brandLine && from.tradeName) || from.legalName || '',
    addressLines: [
      ...brand,
      ...(from.addressLines ?? []),
      [from.city, from.pincode].filter(Boolean).join(' '),
      from.stateCode ? `State: ${stateLabelOf(from.stateCode)}` : '',
      from.cinLlpin ? `CIN/LLPIN: ${from.cinLlpin}` : '',
    ].filter(Boolean),
    gstin: opts.showGstin ? from.gstin : null,
    gstRegistered: from.gstin ? (opts.showGstin ? true : null) : false,
    pan: from.pan,
    email: merged.email,
    phone: merged.phone,
    website: merged.website,
    logoSrc: own ?? company.logoSrc,
    brand: company.brand,
  }
  const signature = await pdfSignature(orgId, from.legalName || company.profile.legalName, merged.signatory)
  return { issuer, signature }
}

/** "Vistaar WebX — a brand of Sanskaar Webx Services LLP", or the legal name. */
export const brandLine = (from: IssuerSnapshot): string => (from.tradeName && from.tradeName !== from.legalName ? `${from.tradeName} — a brand of ${from.legalName}` : (from.legalName ?? ''))
