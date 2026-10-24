import { describe, expect, it } from 'vitest'
import { companyProfileOf } from '@/lib/company-profile'
import { readPolicy } from '@/modules/muster/settings/defaults'
import { chosenSigner, CUSTOM_SIGNER, issueSnapshot, letterSignerFor } from './signatory'

const A = 'a'.repeat(24)
const B = 'b'.repeat(24)
const PROFILE = companyProfileOf({
  name: 'Vistaar',
  signatories: [
    { _id: A, name: 'Asha Rao', designation: 'Director', signatureFileId: '1'.repeat(24), isDefault: true },
    { _id: B, name: 'Bharat Jain', designation: 'HR Head', signatureFileId: '2'.repeat(24), sealFileId: '3'.repeat(24) },
  ],
})

describe('who signs an HR letter', () => {
  it('uses the letter type default from Muster settings, else the company default', () => {
    expect(letterSignerFor(PROFILE, { offer_letter: B }, 'offer_letter')?.name).toBe('Bharat Jain')
    expect(letterSignerFor(PROFILE, { offer_letter: B }, 'relieving_letter')?.name).toBe('Asha Rao')
    // A removed signatory named in settings falls back to the default.
    expect(letterSignerFor(PROFILE, { offer_letter: 'c'.repeat(24) }, 'offer_letter')?.name).toBe('Asha Rao')
    expect(letterSignerFor(companyProfileOf({ name: 'Solo' }), {}, 'offer_letter')).toBeNull()
  })

  it('stores the picked signatory with their own name, designation, signature and seal', () => {
    expect(chosenSigner(PROFILE, B, { name: 'typed', designation: 'typed' })).toEqual({ signatoryName: 'Bharat Jain', signatoryDesignation: 'HR Head', signatoryId: B, signatureFileId: '2'.repeat(24), sealFileId: '3'.repeat(24) })
  })

  it('a typed-in signer carries no image', () => {
    expect(chosenSigner(PROFILE, CUSTOM_SIGNER, { name: 'Meera', designation: 'Manager' })).toEqual({ signatoryName: 'Meera', signatoryDesignation: 'Manager', signatoryId: null, signatureFileId: null, sealFileId: null })
  })

  it('at issue, takes the signatory’s current images; a removed one keeps the stored snapshot', () => {
    expect(issueSnapshot(PROFILE, { signatoryId: B, signatureFileId: 'old', sealFileId: null })).toEqual({ signatureFileId: '2'.repeat(24), sealFileId: '3'.repeat(24) })
    expect(issueSnapshot(PROFILE, { signatoryId: 'c'.repeat(24), signatureFileId: 'f'.repeat(24) })).toEqual({ signatureFileId: 'f'.repeat(24), sealFileId: null })
    expect(issueSnapshot(PROFILE, {})).toEqual({ signatureFileId: null, sealFileId: null })
  })

  it('reads the per-type defaults from the Muster policy, dropping anything that is not an id', () => {
    expect(readPolicy({ letterSignatories: { offer_letter: B, junk: 42, bad: 'nope' } }).letterSignatories).toEqual({ offer_letter: B })
    expect(readPolicy(null).letterSignatories).toEqual({})
  })
})
