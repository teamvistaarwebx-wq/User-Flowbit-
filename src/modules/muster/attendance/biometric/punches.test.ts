import { describe, expect, it } from 'vitest'
import type { RawPunch } from './formats'
import { buildDays, cutoffSeconds, deviceKey } from './punches'

let line = 1
const at = (deviceId: string, date: string, time: string, direction: RawPunch['direction'] = null): RawPunch => {
  const [h, m, s = 0] = time.split(':').map(Number)
  line += 1
  return { line, deviceId, date, seconds: h * 3600 + m * 60 + s, direction }
}

describe('buildDays', () => {
  it('groups by person and IST date: first punch in, last punch out', () => {
    const days = buildDays([at('17', '2026-10-01', '13:02:00'), at('17', '2026-10-01', '09:55:00'), at('17', '2026-10-01', '19:05:00'), at('3', '2026-10-01', '10:00:00'), at('3', '2026-10-01', '18:00:00'), at('17', '2026-10-02', '09:50:00'), at('17', '2026-10-02', '18:30:00')])
    expect(days.map((d) => [d.deviceId, d.date, d.in, d.out, d.punches])).toEqual([
      ['3', '2026-10-01', '10:00', '18:00', 2],
      ['17', '2026-10-01', '09:55', '19:05', 3],
      ['17', '2026-10-02', '09:50', '18:30', 2],
    ])
    expect(days[1].warnings).toEqual([])
  })

  it('treats "0017" and "17" as the same person', () => {
    const days = buildDays([at('0017', '2026-10-01', '09:55:00'), at('17', '2026-10-01', '19:00:00')])
    expect(days).toHaveLength(1)
    expect(deviceKey('0017')).toBe('17')
    expect(deviceKey('0')).toBe('0')
  })

  it('ignores repeat punches less than 2 minutes apart', () => {
    const [day] = buildDays([at('17', '2026-10-01', '09:55:00'), at('17', '2026-10-01', '09:55:40'), at('17', '2026-10-01', '09:56:59'), at('17', '2026-10-01', '09:58:00'), at('17', '2026-10-01', '19:05:00'), at('17', '2026-10-01', '19:05:30')])
    expect(day).toMatchObject({ in: '09:55', out: '19:05', punches: 6, duplicates: 3 })
    expect(day.warnings).toContain('3 repeat punches within 2 minutes ignored.')
  })

  it('flags a single punch, and a double tap that leaves one, as missing out', () => {
    const days = buildDays([at('17', '2026-10-01', '09:55:00'), at('3', '2026-10-01', '09:30:00'), at('3', '2026-10-01', '09:31:00')])
    expect(days.map((d) => [d.deviceId, d.out, d.warnings.includes('Only one punch: missing out.')])).toEqual([['3', undefined, true], ['17', undefined, true]])
  })

  it('puts punches after midnight but before the cutoff on the previous day’s shift', () => {
    const days = buildDays([at('17', '2026-10-01', '21:00:00'), at('17', '2026-10-02', '01:30:00'), at('17', '2026-10-02', '09:58:00'), at('17', '2026-10-02', '18:00:00')])
    expect(days.map((d) => [d.date, d.in, d.out])).toEqual([['2026-10-01', '21:00', '25:30'], ['2026-10-02', '09:58', '18:00']])
    expect(days[0].warnings[0]).toContain('01:30 after midnight')
  })

  it('takes the cutoff from the options (05:00 here, 00:00 turns it off)', () => {
    const punches = [at('17', '2026-10-01', '22:00:00'), at('17', '2026-10-02', '04:30:00')]
    expect(buildDays(punches).map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(buildDays(punches, { cutoff: '05:00' }).map((d) => [d.date, d.out])).toEqual([['2026-10-01', '28:30']])
    expect(buildDays(punches, { cutoff: '00:00' })).toHaveLength(2)
  })

  it('refuses a cutoff that is not HH:MM up to 06:00', () => {
    expect(cutoffSeconds('04:00')).toBe(14400)
    expect(cutoffSeconds('07:00')).toBeNull()
    expect(cutoffSeconds('4am')).toBeNull()
    expect(() => buildDays([], { cutoff: '09:00' })).toThrow('06:00')
  })

  it('warns when the device marked the first punch as out', () => {
    const [day] = buildDays([at('17', '2026-10-01', '09:55:00', 'out'), at('17', '2026-10-01', '19:00:00', 'out')])
    expect(day.warnings).toContain('The device marked the first punch as out.')
  })
})
