import { profileAddressLines, type CompanyProfile } from '@/lib/company-profile'
import type { PdfOrg } from './base'
import type { PdfBrand } from './brand'
import type { PdfSignature } from './signature'

/**
 * The company letterhead and signature block as PDF models (pure): every workspace document (payslips,
 * HR letters, Form 130, statements without an entity) prints these from the company profile.
 */

export type LetterheadArt = { brand: PdfBrand; logoSrc: string | null }

/** Logo, legal name, trading name, address, CIN/LLPIN, GSTIN or "Not registered under GST", PAN, email, phone and website. */
export function companyLetterhead(profile: CompanyProfile, art: LetterheadArt): PdfOrg {
  const trading = profile.tradeName && profile.tradeName !== profile.legalName ? [`Trading as ${profile.tradeName}`] : []
  return {
    name: profile.legalName,
    addressLines: [...trading, ...profileAddressLines(profile), ...(profile.cinLlpin ? [`CIN/LLPIN: ${profile.cinLlpin}`] : [])],
    gstin: profile.gstin,
    gstRegistered: profile.gstRegistered,
    pan: profile.pan,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    logoSrc: art.logoSrc,
    brand: art.brand,
  }
}

export type SignerLike = { name: string; designation?: string | null } | null

/** "For <legal name>" with the signer's name, designation and the images read for them. */
export function signatureModel(forName: string, signer: SignerLike, images: { imageSrc?: string | null; sealSrc?: string | null } = {}): PdfSignature {
  return { forName, name: signer?.name ?? null, designation: signer?.designation ?? null, imageSrc: images.imageSrc ?? null, sealSrc: images.sealSrc ?? null }
}
