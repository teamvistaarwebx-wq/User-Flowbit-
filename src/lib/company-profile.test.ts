import { describe, expect, it } from 'vitest'
import { canManageSignatories, companyProfileOf, defaultSignatoryOf, profileAddressLines, signatoryById } from './company-profile'
import { companyProfileSchema } from './company-profile-schema'
import { clearLightPixels, sniffPdfImage } from './image-bytes'

const ADDRESS = { line1: '2nd Floor, Sapphire Tower', city: 'Indore', state: 'MP', pincode: '452010' }
const VALID = { legalName: 'Sanskaar Webx Services LLP', gstRegistered: 'yes', gstin: '23ABCDE1234F1Z5', ...ADDRESS }

describe('companyProfileOf (migration from the Org fields)', () => {
  it('maps an older workspace: name → legal name, a GSTIN → registered, PAN from the GSTIN', () => {
    const p = companyProfileOf({ name: 'Vistaar', gstin: '23abcde1234f1z5', address: ADDRESS })
    expect(p.legalName).toBe('Vistaar')
    expect(p.gstRegistered).toBe(true)
    expect(p.gstin).toBe('23ABCDE1234F1Z5')
    expect(p.pan).toBe('ABCDE1234F')
    expect(p.signPayslips).toBe(false)
  })
  it('reads a workspace without GSTIN as not registered, and hides a stored GSTIN once marked unregistered', () => {
    expect(companyProfileOf({ name: 'Solo' }).gstRegistered).toBe(false)
    const p = companyProfileOf({ name: 'Solo', gstin: '23ABCDE1234F1Z5', profile: { gstRegistered: false } })
    expect(p.gstRegistered).toBe(false)
    expect(p.gstin).toBeNull()
  })
  it('prefers the profile PAN over the signup PAN, and the address state over the old Org state', () => {
    const p = companyProfileOf({ name: 'A', pan: 'AAAAA1111A', state: 'MH', address: { state: 'MP' }, profile: { pan: 'BBBBB2222B' } })
    expect(p.pan).toBe('BBBBB2222B')
    expect(p.address.state).toBe('MP')
    expect(companyProfileOf({ name: 'A', state: 'MH' }).address.state).toBe('MH')
  })
  it('prints the address as street, then city, state name and PIN', () => {
    expect(profileAddressLines(companyProfileOf({ name: 'A', address: ADDRESS }))).toEqual(['2nd Floor, Sapphire Tower', 'Indore, Madhya Pradesh, 452010'])
  })
})

describe('authorised signatories', () => {
  const signatories = [
    { _id: 'a'.repeat(24), name: 'Asha', designation: 'Director' },
    { _id: 'b'.repeat(24), name: 'Bharat', designation: 'Partner', isDefault: true, signatureFileId: 'f'.repeat(24) },
  ]
  it('has exactly one default: the flagged one, else the first', () => {
    expect(defaultSignatoryOf(companyProfileOf({ name: 'A', signatories }))?.name).toBe('Bharat')
    expect(defaultSignatoryOf(companyProfileOf({ name: 'A', signatories: signatories.map((s) => ({ ...s, isDefault: false })) }))?.name).toBe('Asha')
    expect(defaultSignatoryOf(companyProfileOf({ name: 'A' }))).toBeNull()
  })
  it('finds a signatory by id, and returns null for a removed one', () => {
    const p = companyProfileOf({ name: 'A', signatories })
    expect(signatoryById(p, 'b'.repeat(24))?.signatureFileId).toBe('f'.repeat(24))
    expect(signatoryById(p, 'c'.repeat(24))).toBeNull()
  })
  it('lets only owners and admins with org.manage add or change signatories', () => {
    const can = (granted: boolean) => () => granted
    expect(canManageSignatories({ role: 'owner', can: can(true) })).toBe(true)
    expect(canManageSignatories({ role: 'admin', can: can(true) })).toBe(true)
    expect(canManageSignatories({ role: 'admin', can: can(false) })).toBe(false)
    // A custom role (stored as its id) or HR with org.manage still may not.
    expect(canManageSignatories({ role: 'hr', can: can(true) })).toBe(false)
    expect(canManageSignatories({ role: '6650f0c2a1b2c3d4e5f60789', can: can(true) })).toBe(false)
  })
})

describe('company profile form', () => {
  const parse = (over: Record<string, unknown>) => companyProfileSchema.safeParse({ ...VALID, ...over })
  const errorOf = (over: Record<string, unknown>, path: string) => {
    const r = parse(over)
    return r.success ? null : (r.error.issues.find((i) => i.path.join('.') === path)?.message ?? null)
  }
  it('accepts a valid GST registered company', () => {
    expect(parse({}).success).toBe(true)
  })
  it('rejects a malformed GSTIN', () => {
    expect(errorOf({ gstin: '23ABCDE1234F1X5' }, 'gstin')).toMatch(/valid 15-character GSTIN/)
  })
  it('rejects a GSTIN from another state than the address', () => {
    expect(errorOf({ gstin: '27ABCDE1234F1Z5' }, 'gstin')).toMatch(/registered in Maharashtra \(27\), but the state is Madhya Pradesh \(23\)/)
  })
  it('requires the GSTIN when registered, and a PAN that matches it', () => {
    expect(errorOf({ gstin: '' }, 'gstin')).toMatch(/Enter the GSTIN/)
    expect(errorOf({ pan: 'ZZZZZ9999Z' }, 'pan')).toMatch(/ABCDE1234F/)
  })
  it('allows a non-GST company without a GSTIN', () => {
    expect(parse({ gstRegistered: 'no', gstin: '' }).success).toBe(true)
  })
  it('checks CIN/LLPIN and website shapes', () => {
    expect(parse({ cinLlpin: 'U72900MP2020PTC012345' }).success).toBe(true)
    expect(parse({ cinLlpin: 'aab-1234' }).success).toBe(true)
    expect(errorOf({ cinLlpin: 'XYZ' }, 'cinLlpin')).toMatch(/CIN or an LLPIN/)
    expect(errorOf({ website: 'not a site' }, 'website')).toMatch(/website/)
  })
  it('needs the full address', () => {
    expect(errorOf({ city: '' }, 'city')).toBeTruthy()
    expect(errorOf({ pincode: '12' }, 'pincode')).toBeTruthy()
  })
})

describe('images for PDFs', () => {
  it('knows PNG and JPEG by their bytes, not their name', () => {
    expect(sniffPdfImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
    expect(sniffPdfImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffPdfImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
  })
  it('makes light pixels transparent without touching the ink or the input', () => {
    const pixels = new Uint8ClampedArray([250, 250, 250, 255, 20, 20, 60, 255, 230, 240, 200, 255])
    const out = clearLightPixels(pixels, 225)
    expect([...out]).toEqual([250, 250, 250, 0, 20, 20, 60, 255, 230, 240, 200, 255])
    expect(pixels[3]).toBe(255)
  })
})
