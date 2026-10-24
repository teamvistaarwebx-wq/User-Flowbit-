import { formatDate } from '@/lib/dates'
import { completedService, formatService } from '../people/tenure'
import type { LetterDefinition } from './catalogue'

/**
 * Letter placeholders and rendering (pure). `{{ key }}` is replaced; unknown
 * keys stay visible so a gap is obvious; an empty value drops its paragraph
 * and a short heading ("Performance:") that only introduced it.
 */

export type LetterVariables = Record<string, string>

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
const EMPTY = '\u0000empty\u0000'
const isLabel = (paragraph: string) => paragraph.length < 60 && paragraph.trimEnd().endsWith(':')

export function renderTemplate(body: string, variables: LetterVariables): string {
  const substituted = body.replace(PLACEHOLDER, (match, key: string) => {
    const value = variables[key]
    if (value === undefined) return match
    return value.trim().length > 0 ? value : EMPTY
  })
  const kept: string[] = []
  for (const paragraph of substituted.split(/\n\s*\n/).map((b) => b.trim())) {
    if (paragraph.includes(EMPTY)) {
      if (kept.length > 0 && isLabel(kept[kept.length - 1])) kept.pop()
      continue
    }
    kept.push(paragraph)
  }
  return kept.filter(Boolean).join('\n\n')
}

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))]
}

export const missingPlaceholders = (text: string, variables: LetterVariables): string[] =>
  placeholdersIn(text).filter((key) => !variables[key]?.trim())

export const isSalaryPlaceholder = (key: string): boolean => key.startsWith('salary.')

/** A letter states pay when a template input is a pay figure, or its wording uses a salary placeholder. */
export function statesPay(definition: LetterDefinition | undefined, wording: { subject: string; body: string } | null | undefined): boolean {
  if (definition?.inputs.some((i) => i.pay)) return true
  return wording ? [...placeholdersIn(wording.subject), ...placeholdersIn(wording.body)].some(isSalaryPlaceholder) : false
}

export const VARIABLE_REFERENCE: { group: string; keys: { key: string; describes: string }[] }[] = [
  {
    group: 'Employee',
    keys: [
      { key: 'employee.name', describes: 'Full name' },
      { key: 'employee.code', describes: 'Employee ID' },
      { key: 'employee.designation', describes: 'Designation or internship role' },
      { key: 'employee.department', describes: 'Department' },
      { key: 'employee.email', describes: 'Work email' },
      { key: 'employee.manager', describes: 'Reporting manager' },
      { key: 'employee.dateOfJoining', describes: 'Start date' },
      { key: 'employee.dateOfExit', describes: 'Last working day, if recorded' },
      { key: 'employee.duration', describes: 'Time served, e.g. "6 months"' },
      { key: 'employee.employmentType', describes: 'Full-time, intern, and so on' },
      { key: 'employee.status', describes: 'Current lifecycle status' },
      { key: 'employee.workLocation', describes: 'Work location' },
    ],
  },
  { group: 'Company', keys: [{ key: 'company.name', describes: 'Workspace name' }, { key: 'company.address', describes: 'Registered address' }] },
  {
    group: 'Letter',
    keys: [
      { key: 'letter.reference', describes: 'Reference number' },
      { key: 'letter.issueDate', describes: 'Date of issue' },
      { key: 'signatory.name', describes: 'Authorised signatory' },
      { key: 'signatory.designation', describes: "Signatory's designation" },
    ],
  },
  {
    group: 'What HR typed',
    keys: [
      { key: 'comments.hr', describes: 'HR comments' },
      { key: 'comments.manager', describes: 'Manager comments' },
      { key: 'comments.recommendation', describes: 'Recommendation' },
      { key: 'comments.performance', describes: 'Performance remarks' },
      { key: 'work.undertaken', describes: 'Work or project undertaken' },
      { key: 'input.effectiveDate', describes: 'Effective from' },
      { key: 'input.lastWorkingDay', describes: 'Last working day' },
    ],
  },
  { group: 'Salary', keys: [{ key: 'salary.monthlyGross', describes: 'Current monthly gross' }, { key: 'salary.ctcAnnual', describes: 'Current annual CTC' }] },
]

/** The placeholder reference a reader may see (no salary group without payroll.read). */
export const placeholderReference = (canSeePay: boolean) =>
  canSeePay ? VARIABLE_REFERENCE : VARIABLE_REFERENCE.filter((g) => g.keys.every((k) => !isSalaryPlaceholder(k.key)))

/** "1 year 2 months"; under a month, days. */
export function describeDuration(from: string, to: string): string {
  if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`)) || to < from) return '—'
  const service = completedService(from, to)
  if (service.completedMonths) return formatService(service)
  const days = Math.max(1, service.totalDays)
  return `${days} day${days === 1 ? '' : 's'}`
}

const money = (paise: number | null | undefined) =>
  paise == null ? '' : (Math.round(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type VariableSource = {
  employee: {
    fullName: string
    code: string
    workEmail: string
    designation?: string | null
    department?: string | null
    manager?: string | null
    joinDate: string
    exitDate?: string | null
    employmentType: string
    employmentTypeLabel: string
    statusLabel: string
    workLocation?: string | null
  }
  company: { name: string; address: string }
  letter: { reference: string; issueDate: string; signatoryName: string; signatoryDesignation: string }
  /** Only for readers with payroll.read; otherwise salary placeholders stay unfilled. */
  salary: { monthlyGross: number; ctcAnnual: number } | null
  inputs: Record<string, string>
  today: string
}

/** Values from the record: person, company, letter and (with payroll access) salary. */
export function baseVariables(src: Omit<VariableSource, 'inputs'>): LetterVariables {
  const e = src.employee
  return {
    'employee.name': e.fullName,
    'employee.code': e.code,
    'employee.email': e.workEmail,
    'employee.designation': e.designation ?? '',
    'employee.department': e.department ?? '',
    'employee.manager': e.manager ?? '',
    'employee.dateOfJoining': formatDate(e.joinDate),
    'employee.dateOfExit': e.exitDate ? formatDate(e.exitDate) : 'date',
    'employee.duration': describeDuration(e.joinDate, e.exitDate ?? src.today),
    'employee.employmentType': e.employmentTypeLabel,
    'employee.status': e.statusLabel,
    'employee.workLocation': e.workLocation ?? '',
    'company.name': src.company.name,
    'company.address': src.company.address,
    ...letterVariables(src.letter),
    ...(src.salary ? { 'salary.monthlyGross': money(src.salary.monthlyGross), 'salary.ctcAnnual': money(src.salary.ctcAnnual) } : {}),
  }
}

/** The letter's own fields (reference, issue date, signatory), which the editor changes live. */
export const letterVariables = (l: VariableSource['letter']): LetterVariables => ({
  'letter.reference': l.reference,
  'letter.issueDate': formatDate(l.issueDate),
  'signatory.name': l.signatoryName,
  'signatory.designation': l.signatoryDesignation,
})

const ALIASES: Record<string, string> = { hrComments: 'comments.hr', managerComments: 'comments.manager', recommendationComments: 'comments.recommendation', performanceRemarks: 'comments.performance', workUndertaken: 'work.undertaken' }

/**
 * What HR typed. An empty optional field drops its paragraph; an empty
 * required one is left out, so its placeholder stays visible and the letter
 * cannot be issued until it is filled.
 */
export function inputVariables(inputs: Record<string, string>, definition?: LetterDefinition): LetterVariables {
  const required = new Set(definition?.inputs.filter((i) => i.required).map((i) => i.name) ?? [])
  const payInputs = new Set(definition?.inputs.filter((i) => i.pay).map((i) => i.name) ?? [])
  const keep = (key: string, value: string) => value.trim().length > 0 || !required.has(key)
  const shown = (key: string, value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
    if (payInputs.has(key) && value.trim() && Number.isFinite(Number(value))) return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return value
  }
  const aliases = Object.entries(ALIASES).filter(([key]) => keep(key, inputs[key] ?? '')).map(([key, alias]) => [alias, inputs[key] ?? ''])
  const typed = Object.entries(inputs).filter(([key, value]) => keep(key, value)).map(([key, value]) => [`input.${key}`, shown(key, value)])
  return Object.fromEntries([...aliases, ...typed])
}

/** Every value a letter can use. Number inputs marked as pay print as rupees with paise. */
export function buildVariables(src: VariableSource, definition?: LetterDefinition): LetterVariables {
  return { ...baseVariables(src), ...inputVariables(src.inputs, definition) }
}

/** Field problems in the template inputs: required, real dates, plain non-negative numbers (≤2 decimals). */
export function inputProblems(definition: LetterDefinition, inputs: Record<string, string>): Record<string, string> {
  const problems: Record<string, string> = {}
  for (const field of definition.inputs) {
    const value = (inputs[field.name] ?? '').trim()
    const key = `inputs.${field.name}`
    if (!value) {
      if (field.required) problems[key] = `${field.label} is required`
      continue
    }
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) problems[key] = 'Use a real date'
    if (field.type === 'number' && !/^\d+(\.\d{1,2})?$/.test(value)) problems[key] = 'Use plain digits, with at most two decimals'
  }
  return problems
}

const EMAIL_LINE: Record<string, string> = {
  onboarding: 'We are glad to have you with us.',
  internship: 'Thank you for the work you have put in with us.',
  employment: 'Thank you for your work with us.',
  compensation: 'Please read it through and keep it for your records.',
  disciplinary: 'Please read it carefully. If anything in it is unclear, speak to HR.',
  exit: 'Thank you for your time with us, and good wishes for what comes next.',
}

export type LetterEmailSource = { templateName: string; category: string; reference: string; issueDate: string; employeeName: string; orgName: string; signatoryName: string; signatoryDesignation: string; hasLogin?: boolean }

/** The covering email for an issued letter, drafted from the letter; HR edits it before sending. Blank lines separate paragraphs. */
export function defaultLetterEmail(l: LetterEmailSource): { subject: string; body: string } {
  const first = l.employeeName.trim().split(/\s+/)[0] ?? l.employeeName
  const paragraphs = [
    `Dear ${first},`,
    `Please find attached your ${l.templateName} (${l.reference}), dated ${formatDate(l.issueDate)}.${l.hasLogin === false ? '' : ' You can also download it any time from My letters in Flowbit.'}`,
    EMAIL_LINE[l.category] ?? '',
    `Regards,\n${l.signatoryName}\n${l.signatoryDesignation}, ${l.orgName}`,
  ].filter(Boolean)
  return { subject: `${l.templateName} from ${l.orgName} (${l.reference})`, body: paragraphs.join('\n\n') }
}
