import { ACCOUNT_TYPES, type AccountType } from '@/lib/account-types'

/**
 * Arc AI request caps a month, per workspace, by account type (Console →
 * Settings → Arc AI). Pure and client-safe. A cap of 0 means Arc uses its
 * built-in templates only. When a workspace reaches its cap Arc falls back to
 * the templates until the next calendar month (IST).
 */

export type AiCaps = Readonly<Record<AccountType, number>>

/** Upper bound that catches a typo in the Console. */
export const MAX_AI_CAP = 100_000

export const DEFAULT_AI_CAPS: AiCaps = { free: 0, trial: 50, paid: 500, comped: 500, internal: 500, test: 50 }

/** Stored caps over the defaults: whole numbers in [0, MAX_AI_CAP], anything else replaced by the default. */
export function mergeAiCaps(stored: unknown): AiCaps {
  const value = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries(
    ACCOUNT_TYPES.map((type) => {
      const got = value[type]
      return [type, typeof got === 'number' && Number.isInteger(got) && got >= 0 && got <= MAX_AI_CAP ? got : DEFAULT_AI_CAPS[type]]
    }),
  ) as Record<AccountType, number>
}

/** 'YYYY-MM' of `at` in IST: the window the cap counts in. */
export function aiMonthIST(at: Date = new Date()): string {
  const ist = new Date(at.getTime() + 330 * 60_000)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
}

export type AiAllowance = Readonly<{ cap: number; used: number; left: number; allowed: boolean }>

export function aiAllowance(cap: number, used: number): AiAllowance {
  const left = Math.max(0, cap - used)
  return { cap, used, left, allowed: left > 0 }
}

/** Why AI is not available right now: the plan has no AI ('plan', cap 0) or this month's cap is used ('cap'). */
export function aiBlockReason(allowance: Pick<AiAllowance, 'cap' | 'allowed'>): 'plan' | 'cap' | null {
  if (allowance.allowed) return null
  return allowance.cap === 0 ? 'plan' : 'cap'
}
