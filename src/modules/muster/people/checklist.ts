import { DEFAULT_MANDATORY_DOCUMENTS, docLabel } from '../settings/defaults'

/**
 * Joining checklist (pure, derived; nothing is ticked by hand). Statutory
 * steps read booleans only, so every reader sees the same percentage.
 */

export type ChecklistRecord = {
  personalEmail?: boolean
  phone?: boolean
  dob?: boolean
  address?: boolean
  emergency?: boolean
  department?: boolean
  designation?: boolean
  manager?: boolean
  pan?: boolean
  bank?: boolean
  uan?: boolean
  employmentType: string
  documentTypes: readonly string[]
  /** The workspace's mandatory joining documents (HR settings). */
  mandatoryDocuments?: readonly string[]
  hasSalary?: boolean
  hasLogin?: boolean
}

export type ChecklistStep = { key: string; group: 'Contact' | 'Role' | 'Statutory' | 'Documents' | 'Ready'; label: string; required: boolean; done: boolean }

const SUGGESTED_DOCUMENTS = ['Graduation Marksheet', 'Post-Graduation Marksheet', 'Previous Employment Relieving Letter', 'Previous Employment Certificate', 'PAN card', 'Photograph', 'Signed offer letter', 'Nomination form']

export function checklistSteps(r: ChecklistRecord): ChecklistStep[] {
  const fullTime = r.employmentType === 'full_time'
  const has = (doc: string) => r.documentTypes.includes(doc)
  const mandatory: readonly string[] = r.mandatoryDocuments ?? DEFAULT_MANDATORY_DOCUMENTS
  const optional = SUGGESTED_DOCUMENTS.filter((d) => !mandatory.includes(d))
  return [
    { key: 'personalEmail', group: 'Contact', label: 'Personal email', required: true, done: Boolean(r.personalEmail) },
    { key: 'phone', group: 'Contact', label: 'Phone number', required: true, done: Boolean(r.phone) },
    { key: 'dob', group: 'Contact', label: 'Date of birth', required: true, done: Boolean(r.dob) },
    { key: 'address', group: 'Contact', label: 'Address', required: true, done: Boolean(r.address) },
    { key: 'emergency', group: 'Contact', label: 'Emergency contact', required: true, done: Boolean(r.emergency) },
    { key: 'department', group: 'Role', label: 'Department', required: true, done: Boolean(r.department) },
    { key: 'designation', group: 'Role', label: 'Designation', required: true, done: Boolean(r.designation) },
    { key: 'manager', group: 'Role', label: 'Reporting manager', required: true, done: Boolean(r.manager) },
    { key: 'pan', group: 'Statutory', label: 'PAN', required: true, done: Boolean(r.pan) },
    { key: 'bank', group: 'Statutory', label: 'Bank account', required: true, done: Boolean(r.bank) },
    { key: 'uan', group: 'Statutory', label: 'UAN', required: fullTime, done: Boolean(r.uan) },
    ...mandatory.map((d) => ({ key: `doc:${d}`, group: 'Documents' as const, label: docLabel(d), required: true, done: has(d) })),
    ...optional.map((d) => ({ key: `doc:${d}`, group: 'Documents' as const, label: docLabel(d), required: false, done: has(d) })),
    { key: 'salary', group: 'Ready', label: 'Salary structure', required: fullTime, done: Boolean(r.hasSalary) },
    { key: 'login', group: 'Ready', label: 'Flowbit access', required: false, done: Boolean(r.hasLogin) },
  ]
}

/** Required steps plus optional ones already done count; percent of those that are done. */
export function checklistProgress(steps: readonly ChecklistStep[]): { done: number; total: number; percent: number; missing: ChecklistStep[] } {
  const counted = steps.filter((s) => s.required || s.done)
  const done = counted.filter((s) => s.done).length
  const total = counted.length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 100, missing: steps.filter((s) => s.required && !s.done) }
}
