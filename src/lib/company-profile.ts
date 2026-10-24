import { stateByCode2 } from '@/lib/india-states'

/**
 * The company profile (Settings → Company profile), pure and client-safe. Every PDF's letterhead and
 * signature block reads it. Older workspaces have no `profile` yet: the existing Org fields map into it
 * (name → legal name, a stored GSTIN → GST registered, the signup PAN or the PAN inside the GSTIN → PAN).
 */

type Id = { toString(): string } | string

export type SignatoryRecord = {
  _id?: Id | null
  name: string
  designation: string
  signatureFileId?: Id | null
  sealFileId?: Id | null
  isDefault?: boolean | null
}

export type ProfileSource = {
  name: string
  logoFileId?: Id | null
  gstin?: string | null
  pan?: string | null
  state?: string | null
  address?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; pincode?: string | null; country?: string | null } | null
  profile?: {
    legalName?: string | null
    tradeName?: string | null
    gstRegistered?: boolean | null
    pan?: string | null
    cinLlpin?: string | null
    website?: string | null
    email?: string | null
    phone?: string | null
    signPayslips?: boolean | null
  } | null
  signatories?: readonly SignatoryRecord[] | null
}

export type CompanySignatory = { id: string; name: string; designation: string; signatureFileId: string | null; sealFileId: string | null; isDefault: boolean }

export type CompanyProfile = {
  legalName: string
  tradeName: string | null
  gstRegistered: boolean
  gstin: string | null
  pan: string | null
  cinLlpin: string | null
  website: string | null
  email: string | null
  phone: string | null
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; pincode: string | null; country: string }
  logoFileId: string | null
  signatories: CompanySignatory[]
  signPayslips: boolean
}

/** Kinds of the private signature and seal files: no route serves them (modules/files/access denies unknown kinds). */
export const SIGNATURE_KIND = 'company_signature'
export const SEAL_KIND = 'company_seal'

/** Roles that may add or change authorised signatories (with org.manage). */
export const SIGNATORY_ROLES: readonly string[] = ['owner', 'admin']

const text = (value: string | null | undefined): string | null => (value && value.trim() ? value.trim() : null)
const idOf = (value: unknown): string | null => (value ? String(value) : null)

function signatoriesOf(records: readonly SignatoryRecord[]): CompanySignatory[] {
  const list = records.map((s, i) => ({
    id: idOf(s._id) ?? `signatory-${i}`,
    name: s.name,
    designation: s.designation,
    signatureFileId: idOf(s.signatureFileId),
    sealFileId: idOf(s.sealFileId),
    isDefault: Boolean(s.isDefault),
  }))
  // Exactly one default when there is anyone: the flagged one, else the first.
  const flagged = list.findIndex((s) => s.isDefault)
  const chosen = flagged >= 0 ? flagged : 0
  return list.map((s, i) => ({ ...s, isDefault: i === chosen }))
}

/** The workspace's company profile, with the gaps filled from the older Org fields. */
export function companyProfileOf(org: ProfileSource): CompanyProfile {
  const p = org.profile ?? {}
  const storedGstin = text(org.gstin)?.toUpperCase() ?? null
  const gstRegistered = p.gstRegistered ?? Boolean(storedGstin)
  const gstin = gstRegistered ? storedGstin : null
  const a = org.address ?? {}
  return {
    legalName: text(p.legalName) ?? org.name,
    tradeName: text(p.tradeName),
    gstRegistered,
    gstin,
    pan: text(p.pan) ?? text(org.pan) ?? (gstin ? gstin.slice(2, 12) : null),
    cinLlpin: text(p.cinLlpin),
    website: text(p.website),
    email: text(p.email),
    phone: text(p.phone),
    address: { line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state) ?? text(org.state), pincode: text(a.pincode), country: text(a.country) ?? 'India' },
    logoFileId: idOf(org.logoFileId),
    signatories: signatoriesOf(org.signatories ?? []),
    signPayslips: Boolean(p.signPayslips),
  }
}

export const defaultSignatoryOf = (profile: Pick<CompanyProfile, 'signatories'>): CompanySignatory | null => profile.signatories.find((s) => s.isDefault) ?? null

/** The signatory with this id, else null (a removed signatory). */
export const signatoryById = (profile: Pick<CompanyProfile, 'signatories'>, id: string | null | undefined): CompanySignatory | null => (id ? (profile.signatories.find((s) => s.id === id) ?? null) : null)

/** Two address lines for a letterhead: street, then city, state and PIN. */
export function profileAddressLines(profile: Pick<CompanyProfile, 'address'>): string[] {
  const a = profile.address
  const state = a.state ? (stateByCode2(a.state)?.name ?? a.state) : null
  return [[a.line1, a.line2].filter(Boolean).join(', '), [a.city, state, a.pincode].filter(Boolean).join(', ')].filter(Boolean)
}

/** Owners and admins with org.manage may add or change signatories (their signatures print on legal documents). */
export const canManageSignatories = (member: { role: string; can: (perm: 'org.manage') => boolean }): boolean => SIGNATORY_ROLES.includes(member.role) && member.can('org.manage')

/** What a Folio entity prints when it leaves a field blank: the profile's value, marked as inherited. */
export type EntityContact = {
  logoFileId?: unknown
  email?: string | null
  phone?: string | null
  website?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  signatureFileId?: unknown
}

export type InheritedContact = {
  logoFileId: string | null
  email: string | null
  phone: string | null
  website: string | null
  signatory: { name: string; designation: string | null; signatureFileId: string | null; sealFileId: string | null } | null
  inherited: { logo: boolean; email: boolean; phone: boolean; website: boolean; signatory: boolean }
}

/** The entity's own logo, contact and signatory; each one left blank falls back to the company profile. */
export function inheritFromProfile(entity: EntityContact, profile: CompanyProfile): InheritedContact {
  const own = { logo: idOf(entity.logoFileId), email: text(entity.email), phone: text(entity.phone), website: text(entity.website), signatory: text(entity.signatoryName) }
  const fallback = defaultSignatoryOf(profile)
  const signatory = own.signatory
    ? { name: own.signatory, designation: text(entity.signatoryTitle), signatureFileId: idOf(entity.signatureFileId), sealFileId: null }
    : fallback
      ? { name: fallback.name, designation: fallback.designation, signatureFileId: fallback.signatureFileId, sealFileId: fallback.sealFileId }
      : null
  return {
    logoFileId: own.logo ?? profile.logoFileId,
    email: own.email ?? profile.email,
    phone: own.phone ?? profile.phone,
    website: own.website ?? profile.website,
    signatory,
    inherited: { logo: !own.logo && Boolean(profile.logoFileId), email: !own.email && Boolean(profile.email), phone: !own.phone && Boolean(profile.phone), website: !own.website && Boolean(profile.website), signatory: !own.signatory && Boolean(fallback) },
  }
}
