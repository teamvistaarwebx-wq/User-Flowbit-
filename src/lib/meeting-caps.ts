import type { AccountType } from '@/lib/account-types'

/**
 * Meetings AI transcription hours a month per workspace (Console → Settings →
 * Meetings AI), pure and client-safe: Free 0, Trial 1 hour, paid 5 hours per
 * seat. Counted in seconds of transcribed audio per IST month (lib/ai-caps aiMonthIST).
 */

export type MeetingCaps = Readonly<{ free: number; trial: number; paidPerSeat: number }>

export const DEFAULT_MEETING_CAPS: MeetingCaps = { free: 0, trial: 1, paidPerSeat: 5 }
/** Catches a typo in the Console. */
export const MAX_MEETING_HOURS = 10_000
const HOUR = 3600

export function mergeMeetingCaps(stored: unknown): MeetingCaps {
  const value = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const pick = (key: keyof MeetingCaps) => {
    const got = value[key]
    return typeof got === 'number' && Number.isFinite(got) && got >= 0 && got <= MAX_MEETING_HOURS ? got : DEFAULT_MEETING_CAPS[key]
  }
  return { free: pick('free'), trial: pick('trial'), paidPerSeat: pick('paidPerSeat') }
}

/** The month's cap in seconds: Free and Trial (and Test) flat, paid, Comped and Internal by seat. */
export function meetingCapSeconds(caps: MeetingCaps, accountType: AccountType, seats: number): number {
  if (accountType === 'free') return Math.round(caps.free * HOUR)
  if (accountType === 'trial' || accountType === 'test') return Math.round(caps.trial * HOUR)
  return Math.round(caps.paidPerSeat * Math.max(1, seats) * HOUR)
}

export type MeetingAllowance = Readonly<{ capSeconds: number; usedSeconds: number; leftSeconds: number; allowed: boolean }>

/** Whether `needSeconds` more fits under the cap this month. */
export function meetingAllowance(capSeconds: number, usedSeconds: number, needSeconds = 1): MeetingAllowance {
  const left = Math.max(0, capSeconds - usedSeconds)
  return { capSeconds, usedSeconds, leftSeconds: left, allowed: left > 0 && needSeconds <= left }
}

/** "1 h 30 min" / "45 min". */
export function hoursLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}
