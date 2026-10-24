/**
 * Break types (Muster → HR settings → Attendance rules), pure and client-safe.
 * Each type is paid or unpaid and has a daily limit in minutes. Effective
 * minutes are the minutes actually worked; payable minutes add the paid
 * breaks, each counted up to its daily limit (minutes past the limit, unpaid
 * breaks and breaks taken without a type are not paid).
 */

export const BREAK_TYPES = ['lunch', 'power_nap', 'tea', 'personal'] as const
export type BreakType = (typeof BREAK_TYPES)[number]
/** A break started without a type (before break types, or the WhatsApp bot): counted, never paid. */
export const UNTYPED_BREAK = 'other' as const
export type BreakKey = BreakType | typeof UNTYPED_BREAK

export type BreakPolicy = Readonly<{ paid: boolean; limitMinutes: number }>
export type BreakPolicies = Readonly<Record<BreakType, BreakPolicy>>
export type BreakMinutes = Readonly<Partial<Record<BreakKey, number>>>

export const DEFAULT_BREAK_POLICIES: BreakPolicies = {
  lunch: { paid: false, limitMinutes: 45 },
  power_nap: { paid: true, limitMinutes: 20 },
  tea: { paid: true, limitMinutes: 30 },
  personal: { paid: false, limitMinutes: 30 },
}

export const BREAK_LABEL: Readonly<Record<BreakKey, string>> = { lunch: 'Lunch Break', power_nap: 'Power Nap', tea: 'Tea/Coffee Break', personal: 'Personal/Rest Break', other: 'Break' }
/** Lucide icon names (components/shell/break-icons maps them). */
export const BREAK_ICON: Readonly<Record<BreakKey, 'Utensils' | 'Moon' | 'Coffee' | 'Armchair' | 'Pause'>> = { lunch: 'Utensils', power_nap: 'Moon', tea: 'Coffee', personal: 'Armchair', other: 'Pause' }

export const MIN_BREAK_LIMIT = 5
export const MAX_BREAK_LIMIT = 240

export const isBreakType = (value: unknown): value is BreakType => typeof value === 'string' && (BREAK_TYPES as readonly string[]).includes(value)

/** Stored settings over the defaults; a bad value keeps the default. */
export function mergeBreakPolicies(stored: unknown): BreakPolicies {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, Partial<Record<keyof BreakPolicy, unknown>> | undefined>) : {}
  const pick = (type: BreakType): BreakPolicy => {
    const s = raw[type] ?? {}
    const base = DEFAULT_BREAK_POLICIES[type]
    const limit = Number(s.limitMinutes)
    return {
      paid: typeof s.paid === 'boolean' ? s.paid : base.paid,
      limitMinutes: Number.isInteger(limit) && limit >= MIN_BREAK_LIMIT && limit <= MAX_BREAK_LIMIT ? limit : base.limitMinutes,
    }
  }
  return Object.fromEntries(BREAK_TYPES.map((t) => [t, pick(t)])) as Record<BreakType, BreakPolicy>
}

/** Paid break minutes: each paid type up to its daily limit. */
export function paidBreakMinutes(breaks: BreakMinutes, policies: BreakPolicies): number {
  return BREAK_TYPES.reduce((sum, t) => (policies[t].paid ? sum + Math.min(Math.max(0, breaks[t] ?? 0), policies[t].limitMinutes) : sum), 0)
}

/** Worked minutes plus the paid break minutes. */
export const payableMinutes = (workedMinutes: number, breaks: BreakMinutes, policies: BreakPolicies): number => Math.max(0, Math.round(workedMinutes)) + paidBreakMinutes(breaks, policies)

export type BreakUsage = Readonly<{ type: BreakType; used: number; limit: number; left: number; over: number; paid: boolean }>

/** Minutes used of each type today, what is left and how far past the limit. */
export const breakUsage = (breaks: BreakMinutes, policies: BreakPolicies): BreakUsage[] =>
  BREAK_TYPES.map((type) => {
    const used = Math.max(0, Math.round(breaks[type] ?? 0))
    const limit = policies[type].limitMinutes
    return { type, used, limit, left: Math.max(0, limit - used), over: Math.max(0, used - limit), paid: policies[type].paid }
  })

/** Why a break of `type` cannot start now (its daily limit is used up), or null. */
export function breakRefusal(type: BreakType, breaks: BreakMinutes, policies: BreakPolicies): string | null {
  const used = breaks[type] ?? 0
  return used >= policies[type].limitMinutes ? `You have used today's ${policies[type].limitMinutes} min of ${BREAK_LABEL[type]}. Pick another break.` : null
}

/** Sum of break minutes per type over several days (the register's month totals). */
export const addBreakMinutes = (a: BreakMinutes, b: BreakMinutes): BreakMinutes =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, (a[k as BreakKey] ?? 0) + (b[k as BreakKey] ?? 0)]))

/** Only the keys with minutes, rounded; for storing on the day. */
export const cleanBreakMinutes = (breaks: BreakMinutes): Record<string, number> =>
  Object.fromEntries(Object.entries(breaks).flatMap(([k, v]) => (v && v > 0 ? [[k, Math.round(v)]] : [])))


export type DayHours = Readonly<{ effective: number; payable: number; breaks: BreakMinutes }>

const BREAK_KEYS: readonly BreakKey[] = [...BREAK_TYPES, UNTYPED_BREAK]

/** Per-type break minutes as stored on a day; a day from before break types counts its breaks as untyped. */
export function storedBreakMinutes(day: Readonly<{ breakMinutes?: number | null; breakByType?: unknown }>): BreakMinutes {
  const raw = day.breakByType && typeof day.breakByType === 'object' ? (day.breakByType as Record<string, unknown>) : null
  if (!raw) return (day.breakMinutes ?? 0) > 0 ? { [UNTYPED_BREAK]: Math.round(day.breakMinutes ?? 0) } : {}
  return Object.fromEntries(BREAK_KEYS.flatMap((k) => (typeof raw[k] === 'number' && (raw[k] as number) > 0 ? [[k, Math.round(raw[k] as number)]] : [])))
}

/** Effective (worked) and payable minutes of a stored day, with its breaks per type. */
export function dayHours(day: Readonly<{ workedMinutes?: number | null; breakMinutes?: number | null; breakByType?: unknown }>, policies: BreakPolicies): DayHours {
  const breaks = storedBreakMinutes(day)
  const effective = Math.max(0, Math.round(day.workedMinutes ?? 0))
  return { effective, payable: payableMinutes(effective, breaks, policies), breaks }
}

/** Several days' hours added up (the register's month totals). */
export const addDayHours = (a: DayHours, b: DayHours): DayHours => ({ effective: a.effective + b.effective, payable: a.payable + b.payable, breaks: addBreakMinutes(a.breaks, b.breaks) })

export const NO_HOURS: DayHours = { effective: 0, payable: 0, breaks: {} }

/** Break keys in display order, only those with minutes. */
export const breakEntries = (breaks: BreakMinutes): [BreakKey, number][] => BREAK_KEYS.flatMap((k) => ((breaks[k] ?? 0) > 0 ? [[k, breaks[k] as number] as [BreakKey, number]] : []))
