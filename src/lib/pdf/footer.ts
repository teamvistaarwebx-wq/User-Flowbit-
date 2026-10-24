/**
 * Which footer a PDF prints. A document only says it is computer-generated and needs no signature
 * when it has no signature block at all (a payslip with "Show signature on payslips" off, Flowbit's
 * own subscription invoice). Once a signature block prints, signed with an image or left as a blank
 * rule to sign on, the footer stays neutral: brand line, number and the page count only.
 */

export const UNSIGNED_FOOTER = 'This is a computer-generated document and does not need a signature.'

/** What the signature block of a document looks like. */
export type SignatureState = 'none' | 'blank' | 'signed'

type SignatureLike = { imageSrc?: string | null } | null | undefined

export const signatureStateOf = (signature: SignatureLike): SignatureState => (!signature ? 'none' : signature.imageSrc ? 'signed' : 'blank')

/** True when the computer-generated "no signature needed" line may print. */
export const saysNoSignatureNeeded = (signature: SignatureLike): boolean => signatureStateOf(signature) === 'none'

/**
 * The footer note: the given parts (brand line, number, notes) joined by " · ", with the
 * computer-generated line appended only when there is no signature block.
 */
export function footerText(parts: readonly (string | null | undefined | false)[], signature: SignatureLike): string {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
  return (saysNoSignatureNeeded(signature) ? [...kept, UNSIGNED_FOOTER] : kept).join(' · ')
}
