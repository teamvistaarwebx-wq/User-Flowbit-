import { CONSENT_NOTICE_VERSION, type ConsentSource } from './consent'
import { normalizePhone } from '@/modules/whatsapp/phone'

/**
 * Consent log for a WhatsApp-capable number given to a client contact, a
 * client or a billing recipient by someone in the workspace (DPDP,
 * notifications-v2 §0b.9: time, source, notice version). Members prove their
 * own number by OTP (modules/whatsapp/phone-actions), which logs already.
 * Pure: the row to write, or null when the number did not change or is not
 * a usable number.
 */

export type NumberGiven = Readonly<{
  phone: string | null | undefined
  /** The number before this save (same E.164 = nothing new to record). */
  previous?: string | null
  source: Extract<ConsentSource, 'admin' | 'import'>
  /** Short description without the person's name, e.g. "client contact", "billing recipient". */
  where: string
}>

export type NumberConsentRow = Readonly<{ channel: 'whatsapp'; address: string; action: 'opt_in'; source: ConsentSource; noticeVersion: string; note: string }>

export function numberConsentRow(input: NumberGiven): NumberConsentRow | null {
  const address = normalizePhone(input.phone ?? '')
  if (!address) return null
  if (input.previous && normalizePhone(input.previous) === address) return null
  return {
    channel: 'whatsapp',
    address,
    action: 'opt_in',
    source: input.source,
    noticeVersion: CONSENT_NOTICE_VERSION,
    note: `Number added to a ${input.where} by the workspace (business relationship); STOP opts out`,
  }
}

/** Every number that is new in `next` compared with `before` (lists of contacts or recipients). */
export function newNumbers(before: readonly (string | null | undefined)[], next: readonly (string | null | undefined)[]): string[] {
  const had = new Set(before.map((p) => normalizePhone(p ?? '')).filter(Boolean))
  return [...new Set(next.map((p) => normalizePhone(p ?? '')).filter((p): p is string => Boolean(p) && !had.has(p)))]
}
