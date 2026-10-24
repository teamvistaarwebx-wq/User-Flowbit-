import bcrypt from 'bcryptjs'
import { z } from 'zod'

const COST = 12

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST)

let dummyHash: Promise<string> | null = null

/**
 * False without a hash, but only after the same bcrypt work, so the response
 * time does not tell which emails have an account (V2-REVIEW C5).
 */
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (hash) return bcrypt.compare(plain, hash)
  dummyHash ??= bcrypt.hash('flowbit-no-account', COST)
  await bcrypt.compare(plain, await dummyHash)
  return false
}
