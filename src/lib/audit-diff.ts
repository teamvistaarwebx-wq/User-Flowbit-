/**
 * Before/after diff for audit entries (platform spec 9.3). Pure, safe in
 * tests. Compares the union of keys, ignores bookkeeping fields, redacts
 * secrets and masks bank account numbers to the last 4 digits.
 */

const IGNORED = new Set(['_id', '__v', 'orgId', 'createdAt', 'updatedAt'])
const REDACTED = '«redacted»'
const SENSITIVE_IDS = new Set(['pan', 'uan', 'esicNumber', 'aadhaar', 'pfAccountNumber'])

type Plain = Record<string, unknown>

const isSecretKey = (key: string) => key === 'passwordHash' || /token/i.test(key) || /secret/i.test(key)
const isAccountKey = (key: string) => /accountNumber$/i.test(key)

/** "XXXXXXXX5432" style masking: last 4 digits only. */
export function maskAccount(value: unknown): string {
  const digits = String(value ?? '').replace(/\s+/g, '')
  if (digits.length <= 4) return digits
  return `${'X'.repeat(Math.min(digits.length - 4, 8))}${digits.slice(-4)}`
}

/** Normalises ids/dates and redacts secrets so values compare and store safely. */
export function sanitizeForAudit(value: unknown, key = '', redactIds = false, redact = true): unknown {
  if (redact && isSecretKey(key)) return REDACTED
  if (redact && redactIds && SENSITIVE_IDS.has(key)) return value == null || value === '' ? value : REDACTED
  if (redact && isAccountKey(key)) return value == null || value === '' ? value : maskAccount(value)
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object') {
    if (typeof (value as { toHexString?: unknown }).toHexString === 'function') return String(value)
    if (Array.isArray(value)) return value.map((v) => sanitizeForAudit(v, '', redactIds, redact))
    return Object.fromEntries(
      Object.entries(value as Plain)
        .filter(([k]) => k !== '__v')
        .map(([k, v]) => [k, sanitizeForAudit(v, k, redactIds, redact)]),
    )
  }
  return value
}

export type AuditDiff = { before?: Plain; after?: Plain }

/**
 * Only the keys that changed (compared before redaction, so a changed PAN or
 * password still shows up, redacted). A create (before null) stores `after`
 * only; a delete or void (after null) stores `before` only.
 * `redactIds: true` also hides PAN/UAN/ESIC/Aadhaar values (Muster).
 */
export function diff(before: object | null | undefined, after: object | null | undefined, opts: { redactIds?: boolean } = {}): AuditDiff {
  const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => !IGNORED.has(k)))
  const shown = (o: Plain) => sanitizeForAudit(o, '', opts.redactIds) as Plain
  if (!before && !after) return {}
  if (!before) return { after: shown(strip(after!)) }
  if (!after) return { before: shown(strip(before)) }
  const b = strip(before)
  const a = strip(after)
  const raw = (o: Plain, k: string) => JSON.stringify(sanitizeForAudit(o[k], k, false, false))
  const changed = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => raw(b, k) !== raw(a, k))
  const pick = (o: Plain) => shown(Object.fromEntries(changed.map((k) => [k, o[k]])))
  return { before: pick(b), after: pick(a) }
}
