import 'server-only'
import type { Types } from 'mongoose'
import type { StoredTheme } from '@/lib/brand-theme'
import { companyProfileOf, type CompanyProfile, type ProfileSource } from '@/lib/company-profile'
import { readStoredFile } from '@/lib/files'
import type { OrgLike } from '@/lib/plans'
import { Org } from '@/models/Org'
import type { PdfOrg } from './base'
import { FLOWBIT_PDF_BRAND, pdfBrandForOrg, type PdfBrand } from './brand'
import { companyLetterhead, signatureModel } from './letterhead'
import type { PdfSignature } from './signature'

/** The company profile, colours and logo every workspace PDF prints (lib/pdf/letterhead). */
export type CompanyPdf = { profile: CompanyProfile; brand: PdfBrand; logoSrc: string | null; letterhead: PdfOrg }

export type OrgPdfSource = ProfileSource & OrgLike & { _id: Types.ObjectId; theme?: StoredTheme }

/** A PNG/JPEG stored file as a data URI for @react-pdf (it cannot draw WebP, GIF or SVG). */
export async function pdfImageSrc(orgId: Types.ObjectId, fileId: unknown): Promise<string | null> {
  if (!fileId) return null
  const stored = await readStoredFile(orgId, String(fileId))
  if (!stored || !['image/png', 'image/jpeg'].includes(stored.file.mime)) return null
  return `data:${stored.file.mime};base64,${stored.data.toString('base64')}`
}

/** The PDF letterhead of a loaded workspace (a member's ctx.org). Colours follow the app shell (lib/brand-theme workspaceTheme). */
export async function companyPdfOf(org: OrgPdfSource): Promise<CompanyPdf> {
  const profile = companyProfileOf(org)
  const brand = pdfBrandForOrg(org)
  let logoSrc: string | null = null
  try {
    logoSrc = await pdfImageSrc(org._id, profile.logoFileId)
  } catch (error) {
    // The logo is cosmetic: a failed read prints the letterhead without it rather than failing the document.
    console.error('[pdf] reading the company logo failed', String(org._id), error)
  }
  return { profile, brand, logoSrc, letterhead: companyLetterhead(profile, { brand, logoSrc }) }
}

const PDF_FIELDS = { name: 1, theme: 1, logoFileId: 1, address: 1, gstin: 1, pan: 1, state: 1, profile: 1, signatories: 1, subscription: 1, createdAt: 1, status: 1, disabled: 1, deletedAt: 1, enabledProducts: 1, workspaceKind: 1 } as const

/** The same, read by id (documents built without a member's ctx: public links, Folio renderers). */
export async function orgPdfCompany(orgId: Types.ObjectId): Promise<CompanyPdf> {
  try {
    const org = await Org.findById(orgId, PDF_FIELDS).lean()
    if (org) return await companyPdfOf(org)
  } catch (error) {
    console.error('[pdf] reading the company profile failed', String(orgId), error)
  }
  const profile = companyProfileOf({ name: '' })
  return { profile, brand: FLOWBIT_PDF_BRAND, logoSrc: null, letterhead: companyLetterhead(profile, { brand: FLOWBIT_PDF_BRAND, logoSrc: null }) }
}

export type SignerFiles = { name: string; designation?: string | null; signatureFileId?: unknown; sealFileId?: unknown } | null

/** The signature block with the signer's signature and seal read from private storage as data URIs. */
export async function pdfSignature(orgId: Types.ObjectId, forName: string, signer: SignerFiles): Promise<PdfSignature> {
  if (!signer) return signatureModel(forName, null)
  try {
    const [imageSrc, sealSrc] = await Promise.all([pdfImageSrc(orgId, signer.signatureFileId), pdfImageSrc(orgId, signer.sealFileId)])
    return signatureModel(forName, signer, { imageSrc, sealSrc })
  } catch (error) {
    // Without the image the block still prints the name over a blank line to sign on.
    console.error('[pdf] reading a signature failed', String(orgId), error)
    return signatureModel(forName, signer)
  }
}
