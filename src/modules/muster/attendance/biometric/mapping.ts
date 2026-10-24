import type { CsvRow } from '../../import/csv'
import { deviceKey, type PunchDay } from './punches'

/**
 * Device user id → employee (pure). An employee's saved biometric id wins; otherwise a device id
 * equal to an employee code matches that employee. Ids are compared by deviceKey ("0007" = "7").
 */

export type MappableEmployee = { id: string; code: string; name: string; biometricId?: string | null }
export type DeviceMatch = { employee: MappableEmployee; by: 'biometric_id' | 'code' }
export type UnmappedDevice = { deviceId: string; days: number; punches: number }

export const BIOMETRIC_ID_PATTERN = /^[A-Za-z0-9._-]{1,32}$/
export const BIOMETRIC_ID_HINT = 'Use up to 32 letters, digits, dots, dashes or underscores.'

export function deviceResolver(employees: readonly MappableEmployee[]): (deviceId: string) => DeviceMatch | null {
  const byBiometric = new Map<string, MappableEmployee>()
  const byCode = new Map<string, MappableEmployee>()
  for (const e of employees) {
    if (e.biometricId) byBiometric.set(deviceKey(e.biometricId), e)
    byCode.set(deviceKey(e.code), e)
  }
  return (deviceId) => {
    const key = deviceKey(deviceId)
    const saved = byBiometric.get(key)
    if (saved) return { employee: saved, by: 'biometric_id' }
    const coded = byCode.get(key)
    // A code match only counts when that employee has no other biometric id saved.
    return coded && (!coded.biometricId || deviceKey(coded.biometricId) === key) ? { employee: coded, by: 'code' } : null
  }
}

/** The holder of a biometric id other than `exceptId`, if any. */
export function biometricHolder(employees: readonly MappableEmployee[], biometricId: string, exceptId?: string): MappableEmployee | null {
  const key = deviceKey(biometricId)
  return employees.find((e) => e.id !== exceptId && e.biometricId && deviceKey(e.biometricId) === key) ?? null
}

export type DayRows = { rows: CsvRow[]; unmapped: UnmappedDevice[]; dayByLine: Map<number, PunchDay> }

/**
 * Mapped days as rows for the attendance import (columns code, date, status, in, out, note; status
 * blank so it is worked out from the times), keyed by the first kept punch's file line.
 */
export function daysToRows(days: readonly PunchDay[], resolve: (deviceId: string) => DeviceMatch | null): DayRows {
  const unmapped = new Map<string, UnmappedDevice>()
  const rows: CsvRow[] = []
  const dayByLine = new Map<number, PunchDay>()
  for (const day of days) {
    const match = resolve(day.deviceId)
    if (!match) {
      const key = deviceKey(day.deviceId)
      const seen = unmapped.get(key) ?? { deviceId: day.deviceId, days: 0, punches: 0 }
      unmapped.set(key, { ...seen, days: seen.days + 1, punches: seen.punches + day.punches })
      continue
    }
    const line = day.lines[0]
    dayByLine.set(line, day)
    rows.push({ line, values: { code: match.employee.code, date: day.date, status: '', in: day.in, out: day.out ?? '', note: `Biometric device (${day.punches} ${day.punches === 1 ? 'punch' : 'punches'})` } })
  }
  return { rows, unmapped: [...unmapped.values()], dayByLine }
}
