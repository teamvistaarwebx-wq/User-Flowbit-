import { describe, expect, it } from 'vitest'
import { companyProfileOf, inheritFromProfile } from './company-profile'

const PROFILE = companyProfileOf({
  name: 'Vistaar',
  logoFileId: 'l'.repeat(24),
  profile: { email: 'accounts@vistaar.test', phone: '+919800000000', website: 'vistaar.test' },
  signatories: [{ _id: 'a'.repeat(24), name: 'Asha Rao', designation: 'Director', signatureFileId: 's'.repeat(24), sealFileId: 'e'.repeat(24), isDefault: true }],
})

describe('Folio entity → company profile fallback', () => {
  it('inherits logo, contact and the default signatory (with seal) when the entity leaves them blank', () => {
    const merged = inheritFromProfile({ email: '', phone: null }, PROFILE)
    expect(merged.logoFileId).toBe('l'.repeat(24))
    expect(merged.email).toBe('accounts@vistaar.test')
    expect(merged.phone).toBe('+919800000000')
    expect(merged.website).toBe('vistaar.test')
    expect(merged.signatory).toEqual({ name: 'Asha Rao', designation: 'Director', signatureFileId: 's'.repeat(24), sealFileId: 'e'.repeat(24) })
    expect(merged.inherited).toEqual({ logo: true, email: true, phone: true, website: true, signatory: true })
  })

  it("keeps the entity's own values, and its signatory before the profile's", () => {
    const merged = inheritFromProfile({ logoFileId: 'm'.repeat(24), email: 'billing@brand.test', phone: '0731-400000', website: 'brand.test', signatoryName: 'Bharat', signatoryTitle: 'Partner', signatureFileId: 'x'.repeat(24) }, PROFILE)
    expect(merged.logoFileId).toBe('m'.repeat(24))
    expect(merged.email).toBe('billing@brand.test')
    expect(merged.signatory).toEqual({ name: 'Bharat', designation: 'Partner', signatureFileId: 'x'.repeat(24), sealFileId: null })
    expect(merged.inherited).toEqual({ logo: false, email: false, phone: false, website: false, signatory: false })
  })

  it("an entity signatory without an image stays the entity's (no one else's signature under their name)", () => {
    const merged = inheritFromProfile({ signatoryName: 'Bharat' }, PROFILE)
    expect(merged.signatory).toEqual({ name: 'Bharat', designation: null, signatureFileId: null, sealFileId: null })
  })

  it('prints a blank signature line when neither has a signatory', () => {
    const merged = inheritFromProfile({}, companyProfileOf({ name: 'Solo' }))
    expect(merged.signatory).toBeNull()
    expect(merged.inherited.signatory).toBe(false)
    expect(merged.email).toBeNull()
  })
})
