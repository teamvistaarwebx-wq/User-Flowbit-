import { describe, expect, it } from 'vitest'
import { parseDay, parseStamp } from './datetime'
import { detectFormat, detectFromHeaders, MAX_PUNCH_ROWS, parseAttlog, parseDirection } from './formats'
import { readPunchFile } from './read'

const file = (fileName: string, text: string) => ({ fileName, bytes: Buffer.from(text, 'utf8'), format: 'auto' as const })
const ok = <T,>(value: T | { error: string }): T => {
  if (value && typeof value === 'object' && 'error' in value) throw new Error(value.error)
  return value as T
}

const ESSL_CSV = ['UserId,LogDate,DeviceId,Direction', '17,2026-10-01 09:55:12,1,in', '17,2026-10-01 19:05:40,1,out', '0023,01/10/2026 10:41,2,'].join('\n')
const ESSL_REPORT = ['Employee Code,Employee Name,Log Date,Direction,Device Name', 'VW-0001,Aditi Sharma,01-Oct-2026 09:58,In,Front door'].join('\n')
const ATTLOG = ['     17\t2026-10-01 09:55:12\t0\t1\t0\t0', '     17\t2026-10-01 19:05:40\t1\t1\t0\t0', '      3\t2026-10-01 10:02:00\t0\t15\t0\t0', ''].join('\r\n')
const ZK_TIME_CSV = ['AC-No.,Name,Time,State,New State,Exception,Operation', '17,Aditi,01/10/2026 09:55,C/In,,,', '17,Aditi,01/10/2026 07:05 PM,C/Out,,,'].join('\n')
const BIOTIME_CSV = ['Employee ID,First Name,Department,Date,Time,Punch State,Terminal SN', '17,Aditi,Design,2026-10-01,09:55:12,Check In,CQUJ1234'].join('\n')

describe('datetime', () => {
  it('reads the date layouts devices write, day first', () => {
    expect(parseDay('2026-10-01')).toBe('2026-10-01')
    expect(parseDay('2026/10/1')).toBe('2026-10-01')
    expect(parseDay('01/10/2026')).toBe('2026-10-01')
    expect(parseDay('1.10.2026')).toBe('2026-10-01')
    expect(parseDay('01-Oct-2026')).toBe('2026-10-01')
    expect(parseDay('31/02/2026')).toBeNull()
  })
  it('reads 24-hour and AM/PM times, and converts zoned stamps to IST', () => {
    expect(parseStamp('2026-10-01 09:55:12')).toEqual({ date: '2026-10-01', seconds: 9 * 3600 + 55 * 60 + 12 })
    expect(parseStamp('01/10/2026 07:05 PM')).toEqual({ date: '2026-10-01', seconds: 19 * 3600 + 5 * 60 })
    expect(parseStamp('2026-10-01T20:00:00Z')).toEqual({ date: '2026-10-02', seconds: 1 * 3600 + 30 * 60 })
    expect(parseStamp('2026-10-01')).toEqual({ date: '2026-10-01', seconds: null })
    expect(parseStamp('yesterday')).toBeNull()
  })
  it('reads month-name dates written with spaces, alone or with a time', () => {
    expect(parseStamp('01 Oct 2026')).toEqual({ date: '2026-10-01', seconds: null })
    expect(parseStamp('1 October, 2026 9:55 AM')).toEqual({ date: '2026-10-01', seconds: 9 * 3600 + 55 * 60 })
    expect(parseStamp('01-Oct-2026 21:05:09')).toEqual({ date: '2026-10-01', seconds: 21 * 3600 + 5 * 60 + 9 })
    expect(parseStamp('01 Oct 2026 25:00')).toBeNull()
  })
})

describe('format detection', () => {
  it('spots attlog lines with no header', () => {
    expect(detectFormat(ATTLOG)).toBe('zkteco_dat')
  })
  it('tells eSSL and ZKTeco exports apart by their headers', () => {
    expect(detectFormat(ESSL_CSV)).toBe('essl')
    expect(detectFormat(ESSL_REPORT)).toBe('essl')
    expect(detectFormat(ZK_TIME_CSV)).toBe('zkteco_csv')
    expect(detectFromHeaders(['Employee ID', 'Punch State', 'Terminal SN'])).toBe('zkteco_csv')
    expect(detectFromHeaders(['Person', 'When'])).toBe('generic')
  })
  it('reads directions in their usual spellings', () => {
    expect(parseDirection('C/In')).toBe('in')
    expect(parseDirection('Check Out')).toBe('out')
    expect(parseDirection('0', true)).toBe('in')
    expect(parseDirection('1', true)).toBe('out')
    expect(parseDirection('1')).toBeNull()
  })
})

describe('parsing', () => {
  it('ZKTeco attlog.dat: user id, stamp and the state column; skips junk lines', () => {
    const parsed = parseAttlog(`${ATTLOG}\r\nnot a punch\r\n`)
    expect(parsed.punches).toHaveLength(3)
    expect(parsed.punches[0]).toEqual({ line: 1, deviceId: '17', date: '2026-10-01', seconds: 35712, direction: 'in' })
    expect(parsed.punches[1].direction).toBe('out')
    expect(parsed.skipped).toEqual([{ line: 5, reason: expect.stringContaining('Not a punch line') }])
  })
  it('eSSL device logs: UserId, LogDate (mixed layouts) and Direction', () => {
    const parsed = ok(readPunchFile(file('logs.csv', ESSL_CSV)))
    expect(parsed.format).toBe('essl')
    expect(parsed.columns).toMatchObject({ id: 'userid', datetime: 'logdate', direction: 'direction' })
    expect(parsed.punches.map((p) => [p.deviceId, p.date, p.seconds, p.direction])).toEqual([
      ['17', '2026-10-01', 35712, 'in'],
      ['17', '2026-10-01', 68740, 'out'],
      ['0023', '2026-10-01', 38460, null],
    ])
  })
  it('eSSL report export: Employee Code and Log Date', () => {
    const parsed = ok(readPunchFile(file('report.csv', ESSL_REPORT)))
    expect(parsed.punches[0]).toMatchObject({ deviceId: 'VW-0001', date: '2026-10-01', seconds: 9 * 3600 + 58 * 60, direction: 'in' })
  })
  it('ZKTeco CSV exports: the ZKTime "Time" column and BioTime date + time columns', () => {
    const zk = ok(readPunchFile(file('zk.csv', ZK_TIME_CSV)))
    expect(zk.format).toBe('zkteco_csv')
    expect(zk.punches.map((p) => [p.deviceId, p.seconds, p.direction])).toEqual([['17', 35700, 'in'], ['17', 68700, 'out']])
    const bio = ok(readPunchFile(file('biotime.csv', BIOTIME_CSV)))
    expect(bio.punches[0]).toMatchObject({ deviceId: '17', date: '2026-10-01', seconds: 35712, direction: 'in' })
  })
  it('a generic file with columns picked by hand, and a manual format override', () => {
    const text = ['Person,When', 'E7,2026-10-01 09:00'].join('\n')
    expect(readPunchFile(file('p.csv', text))).toEqual({ error: expect.stringContaining('user id') })
    const picked = ok(readPunchFile({ ...file('p.csv', text), picks: { id: 'person', datetime: 'when' } }))
    expect(picked.format).toBe('generic')
    expect(picked.punches[0]).toMatchObject({ deviceId: 'E7', seconds: 9 * 3600 })
    expect(readPunchFile({ ...file('p.csv', ESSL_CSV), format: 'zkteco_dat' })).toEqual({ error: expect.stringContaining('No punch lines') })
  })
  it('lists unreadable rows instead of failing the file', () => {
    const parsed = ok(readPunchFile(file('logs.csv', `${ESSL_CSV}\n18,32/10/2026 09:00,1,in\n,2026-10-01 09:00,1,in`)))
    expect(parsed.punches).toHaveLength(3)
    expect(parsed.skipped.map((s) => s.line)).toEqual([5, 6])
  })
  it(`refuses more than ${MAX_PUNCH_ROWS} punches and the wrong file type`, () => {
    const many = Array.from({ length: MAX_PUNCH_ROWS + 1 }, () => '1\t2026-10-01 09:00:00\t0').join('\n')
    expect(readPunchFile(file('attlog.dat', many))).toEqual({ error: expect.stringContaining('at most 50,000') })
    expect(readPunchFile(file('punches.pdf', 'x'))).toEqual({ error: expect.stringContaining('.dat, .txt, .csv or .xlsx') })
  })
})
