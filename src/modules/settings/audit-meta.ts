/** Audit log presentation rules (platform spec 9.1). Pure and client-safe. */

export type AuditProduct = 'work' | 'muster' | 'orbit' | 'folio' | 'workspace'

const PREFIX_PRODUCT: Record<string, AuditProduct> = {
  task: 'work', project: 'work', space: 'work', team: 'work', meeting: 'work', post: 'work', time: 'work', timesheet: 'work', whiteboard: 'work', milestone: 'work',
  employee: 'muster', people: 'muster', attendance: 'muster', leave: 'muster', claim: 'muster', payroll: 'muster', payslip: 'muster', salary: 'muster', letter: 'muster', holiday: 'muster', department: 'muster', designation: 'muster', bank: 'muster',
  lead: 'orbit', deal: 'orbit', contact: 'orbit', activity: 'orbit', orbit: 'orbit',
  invoice: 'folio', quote: 'folio', receipt: 'folio', retainer: 'folio', credit_note: 'folio', entity: 'folio', folio: 'folio',
}

/** Workspace, Work, Muster, Orbit or Folio for an audit row. */
export function auditProduct(row: { product?: string | null; action: string }): AuditProduct {
  if (row.product === 'work' || row.product === 'muster' || row.product === 'orbit' || row.product === 'folio') return row.product
  return PREFIX_PRODUCT[row.action.split('.')[0]] ?? 'workspace'
}

/** Action prefixes for a product chip (used to filter rows without a stored product). */
export const prefixesOf = (product: AuditProduct) => Object.entries(PREFIX_PRODUCT).filter(([, p]) => p === product).map(([prefix]) => prefix)

const SENSITIVE = [
  /^member\.(role_changed|disabled)$/,
  /^org\.(ownership_transferred|deleted)$/,
  /^payroll\.(unlock|unlocked|release|released)/,
  /^salary\./,
  /^invoice\.void/,
  /^letter\.revok/,
  /^subscription\.canceled$/,
  /^platform\./,
]

/** Red in the audit log: role changes, disabling, ownership, payroll unlock/release, salary, voids, revokes, cancellations, platform actions. */
export const isSensitiveAction = (action: string) => SENSITIVE.some((re) => re.test(action))

/** A link for the row's entity when the page exists. */
export function entityHref(entity: string, entityId?: string | null): string | null {
  if (!entityId) return null
  switch (entity) {
    case 'Invoice':
      return `/app/folio/invoices/${entityId}`
    case 'Employee':
      return `/app/hr/people/${entityId}`
    case 'Task':
      return `/app/work/tasks/${entityId}`
    case 'Project':
      return `/app/work/projects/${entityId}`
    case 'Client':
      return `/app/clients/${entityId}`
    case 'Lead':
      return `/app/orbit/leads/${entityId}`
    case 'Deal':
      return `/app/orbit/deals/${entityId}`
    case 'Letter':
      return `/app/hr/letters/${entityId}`
    case 'PayrollCycle':
      return `/app/hr/payroll/${entityId}`
    case 'Member':
      return '/app/settings/members'
    case 'Role':
      return '/app/settings/roles'
    case 'Subscription':
    case 'SubscriptionInvoice':
      return '/app/settings/subscription'
    default:
      return null
  }
}

type ChangeRow = { field: string; before: string; after: string }

const isPlainObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const listOf = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
const show = (v: unknown): string =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? '—' : Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Nested objects one level deep become "officeHours.start" rows instead of raw JSON. */
function flatten(o: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o ?? {})) {
    if (isPlainObject(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2
    else out[k] = v
  }
  return out
}

/**
 * Rows of a before → after table from audit meta. Lists (e.g. the switched-on
 * products) compare as one row, never index by index; `added`/`removed`
 * meta (role edits) lists what changed.
 */
export function changeRows(meta: unknown): ChangeRow[] {
  if (!meta || typeof meta !== 'object') return []
  const { before, after, added, removed } = meta as { before?: unknown; after?: unknown; added?: unknown; removed?: unknown }
  if (Array.isArray(before) || Array.isArray(after)) {
    const b = listOf(before)
    const a = listOf(after)
    return [
      { field: 'Added', before: '—', after: show(a.filter((x) => !b.includes(x))) },
      { field: 'Removed', before: show(b.filter((x) => !a.includes(x))), after: '—' },
      { field: 'All', before: show(b), after: show(a) },
    ].filter((r) => r.field === 'All' || r.before !== '—' || r.after !== '—')
  }
  if (before === undefined && after === undefined && (Array.isArray(added) || Array.isArray(removed))) {
    return [
      ...(listOf(added).length ? [{ field: 'Added', before: '—', after: show(added) }] : []),
      ...(listOf(removed).length ? [{ field: 'Removed', before: show(removed), after: '—' }] : []),
    ]
  }
  const b = flatten(isPlainObject(before) ? before : undefined)
  const a = flatten(isPlainObject(after) ? after : undefined)
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])]
  return keys.filter((field) => show(b[field]) !== show(a[field])).map((field) => ({ field, before: show(b[field]), after: show(a[field]) }))
}
