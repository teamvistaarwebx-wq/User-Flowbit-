import { todayIST } from '@/lib/dates'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EXIT_STATUSES, statusLabelOf, type EmployeeStatus, type EmploymentType, type WorkMode } from '../people/lifecycle'
import { startsWork, type OnboardingStatus } from '../people/onboarding'
import { AADHAAR_PATTERN, birthDateProblem, ESIC_PATTERN, splitName, UAN_PATTERN } from '../people/validation'
import { BIOMETRIC_ID_HINT, BIOMETRIC_ID_PATTERN } from '../attendance/biometric/mapping'
import { deviceKey } from '../attendance/biometric/punches'
import type { CsvRow } from './csv'

/** Employee CSV import rules (pure): columns, row validation, template. */

export const MAX_ROWS = 500

export const IMPORT_COLUMNS = [
  'employee_code', 'full_name', 'work_email', 'personal_email', 'phone', 'gender', 'date_of_birth', 'date_of_joining',
  'employment_type', 'employment_status', 'exit_date', 'department', 'designation', 'reporting_manager', 'work_location', 'work_mode', 'pt_state', 'biometric_id',
  'pan', 'uan', 'aadhaar', 'esic_number', 'bank_name', 'bank_account_holder', 'bank_account_number', 'bank_ifsc',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation', 'notes',
] as const

export const SENSITIVE_COLUMNS = new Set(['pan', 'uan', 'aadhaar', 'esic_number', 'bank_name', 'bank_account_holder', 'bank_account_number', 'bank_ifsc'])
/** Accepted alternative headers. */
const ALIASES: Record<string, string> = { official_email: 'work_email', email: 'work_email', joining_date: 'date_of_joining', dob: 'date_of_birth', status: 'employment_status', manager: 'reporting_manager', code: 'employee_code', last_working_day: 'exit_date', date_of_exit: 'exit_date', device_user_id: 'biometric_id', biometric_user_id: 'biometric_id' }
const KNOWN = new Set<string>([...IMPORT_COLUMNS, 'first_name', 'last_name', 'monthly_gross', 'ctc_annual'])

export type ImportContext = {
  existingCodes: Set<string>
  /** lowercased work email → holder name */
  existingEmails: Map<string, string>
  /** lowercased name or code → id */
  departments: Map<string, string>
  designations: Map<string, { id: string; title: string }>
  /** lowercased code or work email → id */
  managers: Map<string, string>
  canSensitive: boolean
  /** Device user ids already saved (deviceKey → holder name); unset skips the clash check. */
  existingBiometricIds?: Map<string, string>
  /** Joining-document progress of a new record (nothing uploaded yet). Unset means no gate. */
  onboarding?: OnboardingStatus
  today?: string
}

export type ImportRecord = {
  code?: string
  fullName: string
  workEmail: string
  personalEmail?: string
  phone?: string
  gender?: 'female' | 'male' | 'other'
  dob?: string
  joinDate: string
  employmentType: EmploymentType
  status: EmployeeStatus
  exitDate?: string
  departmentId?: string
  designationId?: string
  designation?: string
  managerId?: string
  workLocation?: string
  workMode?: WorkMode
  biometricId?: string
  ptState?: string
  pan?: string
  uan?: string
  aadhaar?: string
  esicNumber?: string
  bank?: { bankName?: string; accountName?: string; accountNumber?: string; ifsc?: string }
  emergencyContact?: { name?: string; phone?: string; relation?: string }
  notes?: string
}

export type CheckedRow = { line: number; name: string; email: string; errors: string[]; warnings: string[]; record: ImportRecord | null }

/** What the check step returns to the browser (records stay on the server). */
export type ImportPreview = { summary: string; rows: Omit<CheckedRow, 'record'>[]; ready: number; ignored: string[]; withheld: string[]; salaryIgnored: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REAL_DAY = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
const TYPE_ALIAS: Record<string, EmploymentType> = { consultant: 'contract', contractor: 'contract', fulltime: 'full_time', parttime: 'part_time' }

/** Header names → canonical, plus the lists of unknown and withheld columns. */
export function mapHeaders(headers: string[], canSensitive: boolean) {
  const canonical = headers.map((h) => ALIASES[h] ?? h)
  const ignored = canonical.filter((h) => !KNOWN.has(h))
  const withheld = canSensitive ? [] : canonical.filter((h) => SENSITIVE_COLUMNS.has(h))
  const salaryIgnored = canonical.filter((h) => h === 'monthly_gross' || h === 'ctc_annual')
  return { canonical, ignored, withheld, salaryIgnored }
}

function rowValues(row: CsvRow): Record<string, string> {
  return Object.fromEntries(Object.entries(row.values).map(([k, v]) => [ALIASES[k] ?? k, v]))
}

/** Validates every row against the org and against the other rows of the file. */
export function validateRows(rows: CsvRow[], ctx: ImportContext): CheckedRow[] {
  const today = ctx.today ?? todayIST()
  const seenEmails = new Map<string, number>()
  const seenCodes = new Map<string, number>()
  const seenBiometric = new Map<string, number>()
  return rows.map((row) => {
    const v = rowValues(row)
    const errors: string[] = []
    const warnings: string[] = []
    const fullName = v.full_name || [v.first_name, v.last_name].filter(Boolean).join(' ')
    const email = (v.work_email ?? '').toLowerCase()
    const code = v.employee_code?.trim() || undefined

    if (!fullName || fullName.length < 2) errors.push('Full name is missing.')
    if (!email) errors.push('Work email is missing.')
    else if (!EMAIL.test(email)) errors.push(`"${v.work_email}" is not an email address.`)
    else if (ctx.existingEmails.has(email)) errors.push(`That work email already belongs to ${ctx.existingEmails.get(email)}.`)
    else if (seenEmails.has(email)) errors.push(`The same email is on line ${seenEmails.get(email)} of this file.`)
    if (email) seenEmails.set(email, seenEmails.get(email) ?? row.line)
    if (code) {
      if (ctx.existingCodes.has(code)) errors.push(`Employee code ${code} is already in use.`)
      else if (seenCodes.has(code)) errors.push(`Employee code ${code} is also on line ${seenCodes.get(code)}.`)
      seenCodes.set(code, seenCodes.get(code) ?? row.line)
    }
    if (!v.date_of_joining) errors.push('Date of joining is missing.')
    else if (!REAL_DAY(v.date_of_joining)) errors.push(`Date of joining "${v.date_of_joining}" is not a real day. Use YYYY-MM-DD.`)
    if (v.date_of_birth) {
      if (!REAL_DAY(v.date_of_birth)) errors.push(`Date of birth "${v.date_of_birth}" is not a real day. Use YYYY-MM-DD.`)
      else {
        const problem = birthDateProblem(v.date_of_birth, today)
        if (problem) errors.push(problem)
      }
    }
    const rawType = (v.employment_type ?? '').toLowerCase().replace(/[\s-]/g, '_')
    const employmentType = (TYPE_ALIAS[rawType.replace(/_/g, '')] ?? rawType) as EmploymentType
    if (!rawType) errors.push('Employment type is missing (full_time, part_time, intern or contract).')
    else if (!EMPLOYMENT_TYPES.includes(employmentType)) errors.push(`Employment type "${v.employment_type}" is not one of full_time, part_time, intern, contract.`)
    const status = importStatus(v, ctx.onboarding, errors, warnings)
    const exitDate = exitDateOf(v, status, errors)

    const departmentId = v.department ? ctx.departments.get(v.department.toLowerCase()) : undefined
    if (v.department && !departmentId) errors.push(`No department called "${v.department}". Add it in HR settings first.`)
    const designation = v.designation ? ctx.designations.get(v.designation.toLowerCase()) : undefined
    if (v.designation && !designation) errors.push(`No designation called "${v.designation}". Add it in HR settings first.`)
    const managerId = v.reporting_manager ? ctx.managers.get(v.reporting_manager.toLowerCase()) : undefined
    if (v.reporting_manager && !managerId) errors.push(`No employee with code or email "${v.reporting_manager}" to report to.`)

    const workMode = workModeIn(v.work_mode)
    if (workMode === null) errors.push(`Work mode "${v.work_mode}" is not office or remote.`)
    const biometricId = biometricIdOf(v.biometric_id, ctx.existingBiometricIds, seenBiometric, row.line, errors)
    const sensitive = ctx.canSensitive ? sensitiveOf(v, warnings) : {}
    const record: ImportRecord | null = errors.length
      ? null
      : {
          code, fullName: splitName(fullName).fullName, workEmail: email, personalEmail: v.personal_email || undefined, phone: v.phone || undefined,
          gender: (['female', 'male', 'other'] as const).find((g) => g === (v.gender ?? '').toLowerCase()),
          dob: v.date_of_birth || undefined, joinDate: v.date_of_joining, employmentType, status, exitDate, departmentId, designationId: designation?.id, designation: designation?.title,
          managerId, workLocation: v.work_location || undefined, ...(workMode ? { workMode } : {}), biometricId, ptState: v.pt_state ? v.pt_state.toUpperCase().slice(0, 2) : undefined, ...sensitive,
          emergencyContact: { name: v.emergency_contact_name || undefined, phone: v.emergency_contact_phone || undefined, relation: v.emergency_contact_relation || undefined },
          notes: v.notes || undefined,
        }
    return { line: row.line, name: fullName || '—', email: email || '—', errors, warnings, record }
  })
}

const WORK_MODE_ALIAS: Record<string, WorkMode> = { office: 'office', onsite: 'office', on_site: 'office', in_office: 'office', remote: 'remote', wfh: 'remote', work_from_home: 'remote', home: 'remote' }

/** The work_mode cell: undefined when blank (counts as office), null when it is not a work mode. */
export function workModeIn(raw: string | undefined): WorkMode | undefined | null {
  const key = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!key) return undefined
  return WORK_MODE_ALIAS[key] ?? null
}

/** A device user id: the right shape, not held by anyone yet, and once per file. */
function biometricIdOf(raw: string | undefined, existing: Map<string, string> | undefined, seen: Map<string, number>, line: number, errors: string[]): string | undefined {
  const id = raw?.trim()
  if (!id) return undefined
  if (!BIOMETRIC_ID_PATTERN.test(id)) {
    errors.push(`Biometric id "${id}": ${BIOMETRIC_ID_HINT}`)
    return undefined
  }
  const key = deviceKey(id)
  if (existing?.has(key)) errors.push(`Biometric id ${id} already belongs to ${existing.get(key)}.`)
  else if (seen.has(key)) errors.push(`Biometric id ${id} is also on line ${seen.get(key)}.`)
  if (!seen.has(key)) seen.set(key, line)
  return id
}

const gateBlocks = (onboarding: OnboardingStatus | undefined) => Boolean(onboarding && !onboarding.ready)

/**
 * The row's status. A new record has no joining documents yet, so while the
 * workspace's threshold is not met nobody can be imported straight into work:
 * a blank status becomes Joining pending and a working status is refused
 * (the same rule as Add person and Change status).
 */
function importStatus(v: Record<string, string>, onboarding: OnboardingStatus | undefined, errors: string[], warnings: string[]): EmployeeStatus {
  const raw = (v.employment_status ?? '').toLowerCase().replace(/[\s-]/g, '_')
  if (!raw) {
    if (!gateBlocks(onboarding)) return 'probation'
    warnings.push('No status given, so they start as Joining pending until their joining documents are in.')
    return 'joining_pending'
  }
  const status = raw as EmployeeStatus
  if (!EMPLOYEE_STATUSES.includes(status)) {
    errors.push(`Status "${v.employment_status}" is not a known status.`)
    return status
  }
  if (startsWork(null, status) && gateBlocks(onboarding)) {
    errors.push(`${statusLabelOf(status)} starts work, but joining documents are ${onboarding!.percent}% complete and ${onboarding!.threshold}% is needed. Import them as joining_pending, then start them from their profile once the documents are in.`)
  }
  return status
}

/** People who have left need their last working day, or they stay on the register and in payroll. */
function exitDateOf(v: Record<string, string>, status: EmployeeStatus, errors: string[]): string | undefined {
  const exitDate = v.exit_date?.trim() || undefined
  const leaving = EXIT_STATUSES.includes(status)
  if (!exitDate) {
    if (leaving) errors.push(`${statusLabelOf(status)} needs the last working day in the exit_date column (YYYY-MM-DD).`)
    return undefined
  }
  if (!REAL_DAY(exitDate)) {
    errors.push(`Exit date "${exitDate}" is not a real day. Use YYYY-MM-DD.`)
    return undefined
  }
  if (!leaving) {
    errors.push(`An exit date is only for people who have left (${EXIT_STATUSES.join(', ')}).`)
    return undefined
  }
  if (v.date_of_joining && REAL_DAY(v.date_of_joining) && exitDate < v.date_of_joining) errors.push('The exit date is before the date of joining.')
  return exitDate
}

/** Sensitive values: shape problems are warnings, and the bad value is left out. */
function sensitiveOf(v: Record<string, string>, warnings: string[]): Partial<ImportRecord> {
  const pick = (value: string | undefined, ok: boolean, warning: string) => {
    if (!value) return undefined
    if (ok) return value
    warnings.push(warning)
    return undefined
  }
  const pan = v.pan?.toUpperCase().replace(/\s/g, '')
  const ifsc = v.bank_ifsc?.toUpperCase().replace(/\s/g, '')
  const account = v.bank_account_number?.replace(/\s/g, '')
  const out: Partial<ImportRecord> = {
    pan: pick(pan, /^[A-Z]{5}\d{4}[A-Z]$/.test(pan ?? ''), `PAN "${v.pan}" does not look right, so it was left out.`),
    uan: pick(v.uan, UAN_PATTERN.test(v.uan ?? ''), `UAN "${v.uan}" should be 12 digits, so it was left out.`),
    aadhaar: pick(v.aadhaar?.replace(/\s/g, ''), AADHAAR_PATTERN.test(v.aadhaar?.replace(/\s/g, '') ?? ''), 'Aadhaar should be 12 digits, so it was left out.'),
    esicNumber: pick(v.esic_number, ESIC_PATTERN.test(v.esic_number ?? ''), `ESIC number "${v.esic_number}" should be 10 to 17 digits, so it was left out.`),
    bank: {
      bankName: v.bank_name || undefined,
      accountName: v.bank_account_holder || undefined,
      accountNumber: pick(account, /^\d{6,20}$/.test(account ?? ''), 'The account number should be 6 to 20 digits, so it was left out.'),
      ifsc: pick(ifsc, /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc ?? ''), `IFSC "${v.bank_ifsc}" does not look right, so it was left out.`),
    },
  }
  if (out.bank?.accountNumber && !out.bank.ifsc) warnings.push('An account number without an IFSC cannot be paid.')
  return out
}

/** Template with the columns this person may set, and one example row. */
export function templateColumns(canSensitive: boolean): string[] {
  return IMPORT_COLUMNS.filter((c) => canSensitive || !SENSITIVE_COLUMNS.has(c))
}

export const TEMPLATE_EXAMPLE: Record<string, string> = {
  employee_code: '', full_name: 'Aditi Singh', work_email: 'aditi.singh@example.com', personal_email: 'aditi@gmail.com', phone: '9876543210', gender: 'female',
  date_of_birth: '1996-04-12', date_of_joining: '2026-10-05', employment_type: 'full_time', employment_status: 'joining_pending', exit_date: '', department: 'Design', designation: 'Designer',
  reporting_manager: '', work_location: 'Indore', work_mode: 'office', pt_state: 'MP', biometric_id: '', pan: 'ABCDE1234F', uan: '100200300400', aadhaar: '', esic_number: '', bank_name: 'HDFC Bank',
  bank_account_holder: 'Aditi Singh', bank_account_number: '50100123456789', bank_ifsc: 'HDFC0001234', emergency_contact_name: 'Rakesh Singh', emergency_contact_phone: '9876500000',
  emergency_contact_relation: 'Father', notes: '',
}

/** "3 of 5 rows are ready and 2 need fixing." */
export function checkSummary(rows: CheckedRow[]): string {
  const ready = rows.filter((r) => !r.errors.length).length
  const bad = rows.length - ready
  if (!rows.length) return 'The file has a header but no rows.'
  if (!bad) return rows.length === 1 ? 'The row is ready to import.' : `All ${rows.length} rows are ready to import.`
  const readyPart = `${ready} of ${rows.length} ${rows.length === 1 ? 'row is' : 'rows are'} ready`
  return `${readyPart} and ${bad} ${bad === 1 ? 'needs' : 'need'} fixing. The preview below says what.`
}
