import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP, HMAC-SHA1,
 * 6 digits, 30-second steps) as authenticator apps implement them, plus
 * single-use recovery codes. Server-only (node:crypto), no state: callers
 * store the secret sealed and the last used step, so a code works once.
 */

export const TOTP_DIGITS = 6
export const TOTP_STEP_SECONDS = 30
/** Steps either side of now that still count (clock drift of about 30 seconds). */
export const TOTP_WINDOW = 1
export const RECOVERY_CODE_COUNT = 10

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

/** Decodes base32 (case, spaces and padding ignored); null on a character outside the alphabet. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s=]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new 160-bit secret, base32 (what authenticator apps expect). */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20))

/** RFC 4226 HOTP value for a counter, zero-padded. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', key).update(message).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(code % 10 ** digits).padStart(digits, '0')
}

export const totpStep = (at: Date, stepSeconds = TOTP_STEP_SECONDS) => Math.floor(at.getTime() / 1000 / stepSeconds)

/** The code for a base32 secret at a moment. */
export function totp(secret: string, at: Date = new Date(), digits = TOTP_DIGITS): string {
  const key = base32Decode(secret)
  if (!key) throw new Error('Invalid TOTP secret')
  return hotp(key, totpStep(at), digits)
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * The matched step when `code` is valid at `at` within ±window steps and newer
 * than `lastStep` (a code is never accepted twice), else null.
 */
export function verifyTotp(secret: string, code: string, opts: { at?: Date; window?: number; lastStep?: number | null } = {}): number | null {
  const digits = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(digits)) return null
  const key = base32Decode(secret)
  if (!key) return null
  const now = totpStep(opts.at ?? new Date())
  const window = opts.window ?? TOTP_WINDOW
  for (let delta = -window; delta <= window; delta += 1) {
    const step = now + delta
    if (opts.lastStep != null && step <= opts.lastStep) continue
    if (sameText(hotp(key, step), digits)) return step
  }
  return null
}

/** otpauth:// URI an authenticator app reads from the enrolment QR code. */
export function otpauthUrl(input: { secret: string; account: string; issuer?: string }): string {
  const issuer = input.issuer ?? 'Flowbit Console'
  const label = encodeURIComponent(`${issuer}:${input.account}`)
  const params = new URLSearchParams({ secret: input.secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** "abcd-efgh-ijkl"-style codes: 12 characters from an alphabet without look-alikes. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(12)
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('')
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
  })
}

const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Stored form of a recovery code (sha256 of the normalised code). */
export const hashRecoveryCode = (code: string) => createHash('sha256').update(normaliseRecovery(code)).digest('hex')

/**
 * Uses one recovery code: the remaining hashes when it matched one, else null.
 * Returns a new array; the matched hash is gone, so a code works once.
 */
export function consumeRecoveryCode(hashes: readonly string[], input: string): string[] | null {
  if (normaliseRecovery(input).length !== 12) return null
  const hash = hashRecoveryCode(input)
  const index = hashes.findIndex((h) => sameText(h, hash))
  if (index < 0) return null
  return [...hashes.slice(0, index), ...hashes.slice(index + 1)]
}
