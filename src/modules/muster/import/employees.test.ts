import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { checkSummary, mapHeaders, validateRows, workModeIn, type ImportContext } from './employees'

const ctx: ImportContext = {
  existingCodes: new Set(['VW-0001']),
  existingEmails: new Map([['neha@vistaar.test', 'Neha Verma']]),
  departments: new Map([['design', 'd1'], ['des', 'd1']]),
  designations: new Map([['designer', { id: 'g1', title: 'Designer' }]]),
  managers: new Map([['vw-0001', 'm1']]),
  canSensitive: true,
  today: '2026-10-01',
}

const csv = [
  'Full Name,Official Email,Date of Joining,Employment Type,Department,Designation,Reporting Manager,PAN,Bank Account Number',
  'Aditi Singh,aditi@vistaar.test,2026-10-05,full_time,Design,Designer,VW-0001,ABCDE1234F,50100123456789',
  'Ravi Kumar,neha@vistaar.test,2026-10-05,consultant,,,,,',
  'Meena Rao,aditi@vistaar.test,2026-02-30,staff,Sales,,,bad,',
].join('\n')

describe('employee import', () => {
  const parsed = parseCsv(csv)

  it('normalises headers and accepts official_email', () => {
    expect(parsed.headers[1]).toBe('official_email')
    expect(mapHeaders(parsed.headers, true).canonical).toContain('work_email')
  })

  it('accepts a good row and warns about an account without IFSC', () => {
    const [first] = validateRows(parsed.rows, ctx)
    expect(first.errors).toEqual([])
    expect(first.record).toMatchObject({ fullName: 'Aditi Singh', departmentId: 'd1', designationId: 'g1', managerId: 'm1', employmentType: 'full_time', status: 'probation', pan: 'ABCDE1234F' })
    expect(first.warnings).toContain('An account number without an IFSC cannot be paid.')
  })

  it('reads work_mode: blank counts as office, wfh means remote, anything else is refused', () => {
    expect(workModeIn(undefined)).toBeUndefined()
    expect(workModeIn('  ')).toBeUndefined()
    expect(workModeIn('Remote')).toBe('remote')
    expect(workModeIn('WFH')).toBe('remote')
    expect(workModeIn('Work from home')).toBe('remote')
    expect(workModeIn('On-site')).toBe('office')
    expect(workModeIn('hybrid')).toBeNull()

    const rows = parseCsv(['full_name,work_email,date_of_joining,employment_type,work_mode', 'Asha Verma,asha@vistaar.test,2026-10-05,full_time,remote', 'Kiran Rao,kiran@vistaar.test,2026-10-05,full_time,', 'Om Das,om@vistaar.test,2026-10-05,full_time,hybrid'].join('\n')).rows
    const [remote, blank, bad] = validateRows(rows, ctx)
    expect(remote.record).toMatchObject({ workMode: 'remote' })
    expect(blank.record).not.toHaveProperty('workMode')
    expect(bad.errors).toContain('Work mode "hybrid" is not office or remote.')
  })

  it('names who already holds an email and maps consultant to contract', () => {
    const second = validateRows(parsed.rows, ctx)[1]
    expect(second.errors).toEqual(['That work email already belongs to Neha Verma.'])
  })

  it('reports repeats in the file, impossible days, unknown types and departments', () => {
    const third = validateRows(parsed.rows, ctx)[2]
    expect(third.errors).toContain('The same email is on line 2 of this file.')
    expect(third.errors.some((e) => e.includes('2026-02-30'))).toBe(true)
    expect(third.errors.some((e) => e.includes('"staff"'))).toBe(true)
    expect(third.errors.some((e) => e.includes('No department called "Sales"'))).toBe(true)
    expect(third.warnings.some((w) => w.includes('PAN'))).toBe(true)
  })

  it('withholds sensitive columns from people who cannot see them', () => {
    expect(mapHeaders(parsed.headers, false).withheld).toEqual(['pan', 'bank_account_number'])
    const [first] = validateRows(parsed.rows, { ...ctx, canSensitive: false })
    expect(first.record?.pan).toBeUndefined()
  })

  it('summarises the check', () => {
    expect(checkSummary(validateRows(parsed.rows, ctx))).toBe('1 of 3 rows are ready and 2 need fixing. The preview below says what.')
  })

  describe('joining documents and exits', () => {
    const blocked = { percent: 0, done: 0, total: 6, missing: [], threshold: 60, ready: false }
    const rowsOf = (lines: string[]) => parseCsv(['full_name,work_email,date_of_joining,employment_type,employment_status,exit_date', ...lines].join('\n')).rows

    it('refuses a working status while documents are below the threshold', () => {
      const [row] = validateRows(rowsOf(['Imp Eight,imp8@vistaar.test,2026-10-05,full_time,active,']), { ...ctx, onboarding: blocked })
      expect(row.record).toBeNull()
      expect(row.errors[0]).toContain('joining_pending')
    })

    it('starts a blank status as joining pending when the gate applies', () => {
      const [row] = validateRows(rowsOf(['Imp One,imp1@vistaar.test,2026-10-05,full_time,,']), { ...ctx, onboarding: blocked })
      expect(row.record?.status).toBe('joining_pending')
      expect(row.warnings.length).toBe(1)
    })

    it('keeps probation as the default when the gate is met', () => {
      const [row] = validateRows(rowsOf(['Imp Two,imp2@vistaar.test,2026-10-05,full_time,,']), { ...ctx, onboarding: { ...blocked, ready: true } })
      expect(row.record?.status).toBe('probation')
    })

    it('needs an exit date for people who have left', () => {
      const [missing, given, early] = validateRows(rowsOf([
        'Old One,old1@vistaar.test,2020-01-01,full_time,exited,',
        'Old Two,old2@vistaar.test,2020-01-01,full_time,terminated,2024-03-31',
        'Old Three,old3@vistaar.test,2020-01-01,full_time,exited,2019-12-31',
      ]), ctx)
      expect(missing.errors[0]).toContain('exit_date')
      expect(given.record).toMatchObject({ status: 'terminated', exitDate: '2024-03-31' })
      expect(early.errors).toContain('The exit date is before the date of joining.')
    })
  })
})

describe('employee import: biometric device id', () => {
  const rows = parseCsv([
    'Full Name,Work Email,Date of Joining,Employment Type,Device User ID',
    'Asha Rao,asha@vistaar.test,2026-10-05,full_time,0042',
    'Bharat Jain,bharat@vistaar.test,2026-10-05,full_time,42',
    'Chitra Das,chitra@vistaar.test,2026-10-05,full_time,17',
    'Dev Shah,dev@vistaar.test,2026-10-05,full_time,4 2',
  ].join('\n')).rows
  const checked = validateRows(rows, { ...ctx, existingBiometricIds: new Map([['17', 'Neha Verma']]) })

  it('imports the device user id onto the record', () => {
    expect(checked[0].errors).toEqual([])
    expect(checked[0].record?.biometricId).toBe('0042')
  })
  it('refuses an id used twice in the file, one already held, and a malformed one', () => {
    expect(checked[1].errors).toEqual(['Biometric id 42 is also on line 2.'])
    expect(checked[2].errors).toEqual(['Biometric id 17 already belongs to Neha Verma.'])
    expect(checked[3].errors[0]).toContain('Biometric id "4 2"')
  })
})
