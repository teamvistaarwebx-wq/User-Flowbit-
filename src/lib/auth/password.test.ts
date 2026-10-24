import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import { verifyPassword } from './password'

describe('V2-REVIEW C5: verifyPassword without a hash', () => {
  it('returns false after doing the same bcrypt work', async () => {
    const compare = vi.spyOn(bcrypt, 'compare')
    expect(await verifyPassword('anything1', null)).toBe(false)
    expect(compare).toHaveBeenCalledTimes(1)
    compare.mockRestore()
  }, 20_000)
})
