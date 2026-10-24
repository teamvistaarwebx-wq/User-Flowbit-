import { describe, expect, it } from 'vitest'
import { checkOtp, generateOtp, hashOtp, OTP_MAX_ATTEMPTS, verifyOtpHash } from './otp'

const SECRET = 'test-secret-that-is-long-enough-for-hmac'
const NOW = new Date('2026-10-08T06:00:00Z')
const challenge = (code: string, over: object = {}) => ({ codeHash: hashOtp(code, SECRET), attempts: 0, expiresAt: new Date(NOW.getTime() + 60_000), consumedAt: null, ...over })

describe('signup and claim codes', () => {
  it('generates six digits and stores only an HMAC', () => {
    const code = generateOtp()
    expect(code).toMatch(/^\d{6}$/)
    expect(hashOtp(code, SECRET)).not.toContain(code)
    expect(verifyOtpHash(code, hashOtp(code, SECRET), SECRET)).toBe(true)
    expect(verifyOtpHash(code, hashOtp(code, 'another-secret'), SECRET)).toBe(false)
  })

  it('accepts the right code once, before it expires', () => {
    expect(checkOtp(challenge('123456'), '123456', SECRET, NOW)).toBe('ok')
  })

  it('refuses in order: no code, used, expired, too many attempts, wrong code', () => {
    expect(checkOtp(null, '123456', SECRET, NOW)).toBe('missing')
    expect(checkOtp(challenge('123456', { consumedAt: NOW }), '123456', SECRET, NOW)).toBe('used')
    expect(checkOtp(challenge('123456', { expiresAt: new Date(NOW.getTime() - 1) }), '123456', SECRET, NOW)).toBe('expired')
    expect(checkOtp(challenge('123456', { attempts: OTP_MAX_ATTEMPTS }), '123456', SECRET, NOW)).toBe('too_many')
    expect(checkOtp(challenge('123456'), '654321', SECRET, NOW)).toBe('mismatch')
  })

  it('still judges the last allowed attempt', () => {
    expect(checkOtp(challenge('123456', { attempts: OTP_MAX_ATTEMPTS - 1 }), '123456', SECRET, NOW)).toBe('ok')
  })
})
