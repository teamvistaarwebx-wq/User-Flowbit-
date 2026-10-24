import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { lastFour, openSecret, parseEncryptionKey, sealSecret } from './secret-box'

const key = randomBytes(32)

describe('secret box (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const sealed = sealSecret('rzp_test_secret_123', key)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('rzp_test_secret_123')
    expect(openSecret(sealed, key)).toBe('rzp_test_secret_123')
  })

  it('uses a fresh IV each time', () => {
    expect(sealSecret('same', key)).not.toBe(sealSecret('same', key))
  })

  it('refuses another key, a tampered value and junk', () => {
    const sealed = sealSecret('hello', key)
    expect(openSecret(sealed, randomBytes(32))).toBeNull()
    const parts = sealed.split('.')
    const flipped = Buffer.from(parts[3], 'base64url')
    flipped[0] ^= 1
    expect(openSecret([parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.'), key)).toBeNull()
    expect(openSecret('plain-text', key)).toBeNull()
    expect(openSecret('', key)).toBeNull()
    expect(openSecret(null, key)).toBeNull()
  })

  it('parses hex and base64 keys of 32 bytes only', () => {
    expect(parseEncryptionKey(key.toString('hex'))?.equals(key)).toBe(true)
    expect(parseEncryptionKey(key.toString('base64'))?.equals(key)).toBe(true)
    expect(parseEncryptionKey('short')).toBeNull()
    expect(parseEncryptionKey('')).toBeNull()
    expect(parseEncryptionKey(randomBytes(16).toString('hex'))).toBeNull()
  })

  it('shows only the last four characters', () => {
    expect(lastFour('rzp_live_ABCDwxyz')).toBe('••••wxyz')
    expect(lastFour('')).toBe('')
  })
})
