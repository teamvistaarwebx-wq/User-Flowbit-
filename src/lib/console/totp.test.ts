import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, hotp, otpauthUrl, totp, totpStep, verifyTotp } from './totp'

// RFC 6238 appendix B: the SHA-1 seed "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const at = (seconds: number) => new Date(seconds * 1000)

describe('base32', () => {
  it('encodes the RFC seed as authenticator apps expect', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })
  it('round-trips random bytes and ignores spaces, case and padding', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(secret.toLowerCase().replace(/(.{4})/g, '$1 '))!)).toBe(secret)
    expect(base32Decode('GEZD====')).toEqual(base32Decode('GEZD'))
  })
  it('refuses characters outside the alphabet', () => {
    expect(base32Decode('GEZ1')).toBeNull()
  })
})

describe('HOTP / TOTP (RFC 4226, RFC 6238)', () => {
  it('matches the RFC 4226 test values', () => {
    const key = Buffer.from('12345678901234567890')
    expect([0, 1, 2, 3, 9].map((c) => hotp(key, c))).toEqual(['755224', '287082', '359152', '969429', '520489'])
  })
  it('matches the RFC 6238 SHA-1 vectors (8 digits)', () => {
    expect(totp(RFC_SECRET, at(59), 8)).toBe('94287082')
    expect(totp(RFC_SECRET, at(1111111109), 8)).toBe('07081804')
    expect(totp(RFC_SECRET, at(1234567890), 8)).toBe('89005924')
    expect(totp(RFC_SECRET, at(20000000000), 8)).toBe('65353130')
  })
  it('uses 30-second steps', () => {
    expect(totpStep(at(59))).toBe(1)
    expect(totpStep(at(60))).toBe(2)
  })
})

describe('verifyTotp', () => {
  const now = at(1_800_000_000)
  const code = (offsetSteps: number) => totp(RFC_SECRET, new Date(now.getTime() + offsetSteps * 30_000))

  it('accepts the current code and returns its step', () => {
    expect(verifyTotp(RFC_SECRET, code(0), { at: now })).toBe(totpStep(now))
  })
  it('accepts one step of clock drift either way', () => {
    expect(verifyTotp(RFC_SECRET, code(-1), { at: now })).toBe(totpStep(now) - 1)
    expect(verifyTotp(RFC_SECRET, code(1), { at: now })).toBe(totpStep(now) + 1)
  })
  it('refuses codes two steps away', () => {
    expect(verifyTotp(RFC_SECRET, code(-2), { at: now })).toBeNull()
    expect(verifyTotp(RFC_SECRET, code(2), { at: now })).toBeNull()
  })
  it('never accepts the same or an older step twice (replay)', () => {
    const step = verifyTotp(RFC_SECRET, code(0), { at: now })!
    expect(verifyTotp(RFC_SECRET, code(0), { at: now, lastStep: step })).toBeNull()
    expect(verifyTotp(RFC_SECRET, code(-1), { at: now, lastStep: step })).toBeNull()
    expect(verifyTotp(RFC_SECRET, code(1), { at: now, lastStep: step })).toBe(step + 1)
  })
  it('refuses malformed input and a bad secret', () => {
    expect(verifyTotp(RFC_SECRET, '12345', { at: now })).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef', { at: now })).toBeNull()
    expect(verifyTotp('not base32!', code(0), { at: now })).toBeNull()
  })
  it('tolerates spaces in the typed code', () => {
    const c = code(0)
    expect(verifyTotp(RFC_SECRET, `${c.slice(0, 3)} ${c.slice(3)}`, { at: now })).not.toBeNull()
  })
})

describe('recovery codes', () => {
  it('generates 10 distinct readable codes', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/)
  })
  it('works once, case and dashes ignored', () => {
    const codes = generateRecoveryCodes(3)
    const hashes = codes.map(hashRecoveryCode)
    const remaining = consumeRecoveryCode(hashes, codes[1].toUpperCase().replace(/-/g, ' '))
    expect(remaining).toEqual([hashes[0], hashes[2]])
    expect(consumeRecoveryCode(remaining!, codes[1])).toBeNull()
    expect(hashes).toHaveLength(3)
  })
  it('V2-REVIEW C4: the typed code hashes to the exact stored hash, so the atomic $pull filter matches it', () => {
    const codes = generateRecoveryCodes(2)
    const hashes = codes.map(hashRecoveryCode)
    expect(hashes).toContain(hashRecoveryCode(codes[0].toUpperCase().replace(/-/g, ' ')))
  })
  it('refuses unknown and malformed codes', () => {
    const hashes = generateRecoveryCodes(2).map(hashRecoveryCode)
    expect(consumeRecoveryCode(hashes, 'aaaa-bbbb-cccc')).toBeNull()
    expect(consumeRecoveryCode(hashes, '123456')).toBeNull()
  })
})

describe('otpauth URL for the QR code', () => {
  it('names the issuer and account and carries the secret', () => {
    const url = otpauthUrl({ secret: 'JBSWY3DPEHPK3PXP', account: 'asha@useflowbit.com' })
    expect(url.startsWith('otpauth://totp/Flowbit%20Console%3Aasha%40useflowbit.com?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP')
    expect(params.get('issuer')).toBe('Flowbit Console')
    expect(params.get('digits')).toBe('6')
    expect(params.get('period')).toBe('30')
  })
})
