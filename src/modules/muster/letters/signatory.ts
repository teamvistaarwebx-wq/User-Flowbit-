import { defaultSignatoryOf, signatoryById, type CompanyProfile, type CompanySignatory } from '@/lib/company-profile'

/**
 * Who signs an HR letter (pure). Muster settings may name a company signatory per letter type; otherwise
 * the company profile's default signs. The issue form can pick another signatory or type a name (no
 * signature image then). The choice is stored on the letter with the signature and seal file ids, so a
 * reprint is signed exactly as the issued letter was.
 */

/** The editor's "someone else" choice: a typed name and designation, without a signature image. */
export const CUSTOM_SIGNER = 'custom'

export function letterSignerFor(profile: Pick<CompanyProfile, 'signatories'>, defaults: Record<string, string>, templateCode: string): CompanySignatory | null {
  return signatoryById(profile, defaults[templateCode]) ?? defaultSignatoryOf(profile)
}

export type LetterSigner = {
  signatoryName: string
  signatoryDesignation: string
  signatoryId: string | null
  signatureFileId: string | null
  sealFileId: string | null
}

/** What a letter stores for a company signatory. */
export const signerSnapshot = (s: CompanySignatory): LetterSigner => ({ signatoryName: s.name, signatoryDesignation: s.designation, signatoryId: s.id, signatureFileId: s.signatureFileId, sealFileId: s.sealFileId })

/** What a letter stores for a typed-in signer: no company signatory, so no image. */
export const typedSigner = (name: string, designation: string): LetterSigner => ({ signatoryName: name, signatoryDesignation: designation, signatoryId: null, signatureFileId: null, sealFileId: null })

/**
 * The signer chosen in the editor: a company signatory by id (their own name and designation), or the typed
 * name for "someone else" or a signatory removed meanwhile.
 */
export function chosenSigner(profile: Pick<CompanyProfile, 'signatories'>, choice: string | null | undefined, typed: { name: string; designation: string }): LetterSigner {
  const signatory = choice && choice !== CUSTOM_SIGNER ? signatoryById(profile, choice) : null
  return signatory ? signerSnapshot(signatory) : typedSigner(typed.name, typed.designation)
}

/**
 * At issue: a company signatory who is still on the profile signs with their current signature and seal (a
 * replaced image is picked up); one removed meanwhile keeps the snapshot taken when the draft was saved.
 */
export function issueSnapshot(profile: Pick<CompanyProfile, 'signatories'>, letter: { signatoryId?: unknown; signatureFileId?: unknown; sealFileId?: unknown }): { signatureFileId: string | null; sealFileId: string | null } {
  const current = letter.signatoryId ? signatoryById(profile, String(letter.signatoryId)) : null
  if (current) return { signatureFileId: current.signatureFileId, sealFileId: current.sealFileId }
  return { signatureFileId: letter.signatureFileId ? String(letter.signatureFileId) : null, sealFileId: letter.sealFileId ? String(letter.sealFileId) : null }
}
