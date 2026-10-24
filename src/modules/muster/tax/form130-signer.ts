import { defaultSignatoryOf, type CompanyProfile, type CompanySignatory } from '@/lib/company-profile'

/**
 * Who signs Form 130 Part B (pure). The tax-year settings name the person responsible for deducting tax;
 * when that is an authorised signatory in the company profile, their signature and seal print. Left blank,
 * the profile's default signatory signs. A name that is not a signatory prints over a blank line.
 */

export type Form130SignerSettings = { name?: string | null; designation?: string | null; place?: string | null } | null | undefined

export type Form130Signer = { name: string; designation: string; place: string; signatory: CompanySignatory | null }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function form130Signer(settings: Form130SignerSettings, profile: CompanyProfile): Form130Signer {
  const name = settings?.name?.trim() ?? ''
  const place = settings?.place?.trim() || profile.address.city || ''
  const signatory = name ? (profile.signatories.find((s) => same(s.name, name)) ?? null) : defaultSignatoryOf(profile)
  return {
    name: name || signatory?.name || '',
    designation: settings?.designation?.trim() || signatory?.designation || '',
    place,
    signatory,
  }
}
