/**
 * What an AI may never do through MCP (docs/specs/mcp.md A1), whatever the
 * scopes or the role: attendance, payroll and salary, issuing / voiding /
 * deleting invoices, payments, deleting records, roles, settings, billing.
 * Also the fields that never leave Flowbit (salary, PAN, bank). Pure.
 */

export type NeverRule = Readonly<{ key: string; label: string; pattern: RegExp }>

export const NEVER_RULES: readonly NeverRule[] = [
  { key: 'attendance', label: 'Attendance changes', pattern: /attendance|check_?in|check_?out|punch/ },
  { key: 'payroll', label: 'Payroll and salary', pattern: /payroll|salary|payslip|ctc|wage/ },
  { key: 'invoice_issue', label: 'Issuing, voiding or deleting invoices', pattern: /(issue|void|cancel|send|email|finali[sz]e|write_?off)_?(invoice|bill)|invoice_?(issue|void|delete|send)/ },
  { key: 'payments', label: 'Recording payments', pattern: /payment|receipt|refund|settle|mark_?paid|record_?paid/ },
  { key: 'delete', label: 'Deleting records', pattern: /^(delete|remove|destroy|purge|drop)|_(delete|remove|destroy|purge)$/ },
  { key: 'roles', label: 'Changing roles or members', pattern: /role|permission|invite|member_?(add|remove|disable)|(add|remove|disable)_?member/ },
  { key: 'settings', label: 'Changing settings', pattern: /setting|config|module|integration|webhook/ },
  { key: 'billing', label: 'Billing and the subscription', pattern: /billing|subscription|plan_?change|wallet|checkout/ },
]

const norm = (op: string) => op.trim().toLowerCase().replace(/[\s.-]+/g, '_')

/** The fixed rule an operation falls under, or null. */
export function neverRuleFor(op: string): NeverRule | null {
  const n = norm(op)
  return NEVER_RULES.find((r) => r.pattern.test(n)) ?? null
}

export const neverMessage = (rule: NeverRule) => `${rule.label}: never allowed through AI apps (Claude, ChatGPT). Do this in Flowbit itself.`

/** Keys that are dropped from anything returned to an AI, at any depth. */
const SENSITIVE_KEY = /^(pan|pan_?number|aadhaar|aadhar|uan|esic(_?number)?|pf_?account_?number|bank|bank_?account|bank_?details|account_?number|ifsc|salary.*|ctc.*|gross_?(pay|paise)?|net_?pay.*|basic_?(pay|paise)|password.*|.*token_?hash|.*secret.*)$/i

export const isSensitiveKey = (key: string) => SENSITIVE_KEY.test(key)

/** A deep copy without sensitive keys. Dates become ISO strings, ObjectIds strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null) return value ?? null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const ctor = (value as { constructor?: { name?: string } }).constructor?.name
    if (ctor === 'ObjectId' || ctor === 'ObjectID') return String(value)
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !isSensitiveKey(k)).map(([k, v]) => [k, redact(v, depth + 1)]))
  }
  return value
}
