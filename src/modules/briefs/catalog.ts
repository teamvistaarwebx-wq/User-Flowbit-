import type { Permission, ProductKey } from '@/lib/catalog'

/**
 * Brief sections (notifications-v2 §4) and role presets, pure. A section is
 * offered only when the person's role and the workspace's products allow it,
 * and its data is re-checked against the same rule when the brief is built.
 */

export const BRIEF_AREAS = ['work', 'approvals', 'team', 'money', 'sales', 'compliance'] as const
export type BriefArea = (typeof BRIEF_AREAS)[number]

export const AREA_LABEL: Readonly<Record<BriefArea, string>> = { work: 'Work', approvals: 'Approvals', team: 'Team', money: 'Money', sales: 'Sales', compliance: 'Compliance' }

export type SectionDef = Readonly<{
  key: string
  area: BriefArea
  label: string
  product?: ProductKey
  /** Any one of these permissions opens the section. */
  anyPerm: readonly Permission[]
}>

export const APPROVAL_PERMS: readonly Permission[] = ['leave.approve', 'attendance.approve', 'time.approve', 'claims.review', 'people.read_sensitive']

export const BRIEF_SECTIONS: readonly SectionDef[] = [
  { key: 'work.due_today', area: 'work', label: 'My tasks due today', product: 'work', anyPerm: ['tasks.read'] },
  { key: 'work.overdue', area: 'work', label: 'Overdue', product: 'work', anyPerm: ['tasks.read'] },
  { key: 'work.due_week', area: 'work', label: 'Due this week', product: 'work', anyPerm: ['tasks.read'] },
  { key: 'work.blocked', area: 'work', label: 'Blocked', product: 'work', anyPerm: ['tasks.read'] },
  { key: 'work.meetings', area: 'work', label: "Today's meetings", product: 'work', anyPerm: ['tasks.read'] },
  { key: 'work.timesheet', area: 'work', label: 'My timesheet this week', product: 'work', anyPerm: ['time.write'] },
  { key: 'approvals.pending', area: 'approvals', label: 'Waiting on me', anyPerm: APPROVAL_PERMS },
  { key: 'team.today', area: 'team', label: 'On leave, absent or late today', product: 'muster', anyPerm: ['people.read_all', 'people.read_team'] },
  { key: 'team.overdue', area: 'team', label: "The team's overdue tasks", product: 'work', anyPerm: ['tasks.manage'] },
  { key: 'money.dues', area: 'money', label: 'Due today and overdue (top 5 clients)', product: 'folio', anyPerm: ['folio.read'] },
  { key: 'money.receipts', area: 'money', label: "Yesterday's receipts", product: 'folio', anyPerm: ['folio.read'] },
  { key: 'money.billing', area: 'money', label: "This month's billing so far", product: 'folio', anyPerm: ['folio.read'] },
  { key: 'sales.followups', area: 'sales', label: 'Follow-ups due', product: 'orbit', anyPerm: ['orbit.read'] },
  { key: 'sales.new_leads', area: 'sales', label: 'New leads yesterday', product: 'orbit', anyPerm: ['orbit.read'] },
  { key: 'sales.closing', area: 'sales', label: 'Deals closing this week', product: 'orbit', anyPerm: ['orbit.read'] },
  { key: 'compliance.next7', area: 'compliance', label: 'Statutory dates in the next 7 days', anyPerm: ['org.manage', 'folio.settings'] },
]

const BY_KEY = new Map(BRIEF_SECTIONS.map((s) => [s.key, s]))
export const sectionByKey = (key: string): SectionDef | undefined => BY_KEY.get(key)

/** What the viewer may see: permission and product checks, as on Ctx. */
export type BriefAccess = Readonly<{ can: (perm: Permission) => boolean; has: (product: ProductKey) => boolean }>

export const sectionAllowed = (section: SectionDef, access: BriefAccess): boolean =>
  (!section.product || access.has(section.product)) && section.anyPerm.some((p) => access.can(p))

/** The allowed section keys among `keys`, in the given order, without duplicates or unknown keys. */
export function allowedSections(keys: readonly string[], access: BriefAccess): string[] {
  const seen = new Set<string>()
  return keys.filter((key) => {
    const section = sectionByKey(key)
    if (!section || seen.has(key) || !sectionAllowed(section, access)) return false
    seen.add(key)
    return true
  })
}

export type PresetKey = 'owner' | 'manager' | 'accounts' | 'sales' | 'employee'

const WORK_CORE = ['work.due_today', 'work.overdue', 'work.meetings']
const PRESETS: Readonly<Record<PresetKey, readonly string[]>> = {
  owner: BRIEF_SECTIONS.map((s) => s.key),
  manager: [...WORK_CORE, 'work.blocked', 'approvals.pending', 'team.today', 'team.overdue'],
  accounts: [...WORK_CORE, 'approvals.pending', 'money.dues', 'money.receipts', 'money.billing', 'compliance.next7'],
  sales: [...WORK_CORE, 'approvals.pending', 'sales.followups', 'sales.new_leads', 'sales.closing'],
  employee: [...WORK_CORE, 'work.due_week', 'approvals.pending'],
}

/** The role preset that fits the person: owner or admin gets everything, then managers, accounts, sales, else employee. */
export function presetFor(access: BriefAccess): PresetKey {
  if (access.can('org.manage')) return 'owner'
  if (access.can('tasks.manage') || access.can('people.read_team') || access.can('people.read_all')) return 'manager'
  if (access.can('invoices.write') || access.can('receipts.write')) return 'accounts'
  if (access.can('leads.write') || access.can('deals.write')) return 'sales'
  return 'employee'
}

/** The preset's sections the person may actually see. */
export const presetSections = (preset: PresetKey, access: BriefAccess): string[] => allowedSections(PRESETS[preset], access)
