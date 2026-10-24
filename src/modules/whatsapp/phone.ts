/**
 * Phone numbers for WhatsApp A (pure). Stored and compared in E.164
 * ('+919876543210'); Interakt wants the country code and the national number
 * apart. Flowbit messages Indian numbers only for now.
 */

/** '+91 98765-43210', '09876543210', '9876543210' → '+919876543210'; null when it is not an Indian mobile number. */
export function toE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[^\d+]/g, '')
  const bare = digits.startsWith('+') ? digits.slice(1) : digits
  const national = bare.length === 12 && bare.startsWith('91') ? bare.slice(2) : bare.length === 11 && bare.startsWith('0') ? bare.slice(1) : bare
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null
}

/**
 * Country codes a workspace may message besides India (+91, the default):
 * the Gulf, South Asia, South-East Asia, UK, Europe, North America, Australia.
 * Longest first, so '+971…' is never read as '+9'.
 */
export const KNOWN_COUNTRY_CODES: readonly string[] = ['971', '966', '974', '968', '973', '965', '977', '880', '94', '65', '60', '61', '44', '49', '33', '1'].sort((a, b) => b.length - a.length)

/**
 * A customer's number as WhatsApp B stores it (E.164), pure. Without a '+',
 * the number is Indian (+91 default): '98765 43210', '0987…', '91987…'.
 * With a '+', any known country code and 6–12 more digits. Null otherwise.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim().replace(/^\(\+?(\d+)\)/, '+$1')
  const international = text.startsWith('+') || text.startsWith('00')
  if (!international) return toE164(text)
  const digits = text.replace(/\D/g, '').replace(/^00/, '')
  if (digits.startsWith('91')) return toE164(`+${digits}`)
  const code = KNOWN_COUNTRY_CODES.find((c) => digits.startsWith(c))
  if (!code) return null
  const national = digits.slice(code.length)
  return /^\d{6,12}$/.test(national) ? `+${code}${national}` : null
}

/** Interakt's split form of an E.164 number. */
export function splitE164(e164: string): { countryCode: string; phoneNumber: string } {
  const digits = e164.replace(/^\+/, '')
  const code = digits.startsWith('91') && digits.length === 12 ? '91' : (KNOWN_COUNTRY_CODES.find((c) => digits.startsWith(c)) ?? digits.slice(0, 2))
  return { countryCode: `+${code}`, phoneNumber: digits.slice(code.length) }
}

/**
 * A pattern that finds a stored phone however it was typed ('+91 98765-43210',
 * '09876543210'): the last 10 digits with anything but digits between them,
 * at the end of the field. Used to match an inbound number to a record.
 */
export function phonePattern(e164: string): RegExp {
  const tail = e164.replace(/\D/g, '').slice(-10)
  return new RegExp(`${tail.split('').join('\\D*')}\\D*$`)
}

/** '+91 98765 43210' for screens; the last digits only, '••••• 43210', where the number must not show in full. */
export const formatPhone = (e164: string): string => `${e164.slice(0, 3)} ${e164.slice(3, 8)} ${e164.slice(8)}`
export const maskPhone = (e164: string): string => `••••• ${e164.slice(-5)}`
