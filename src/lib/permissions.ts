import { ALL_PERMISSIONS, permissionsOf, isPermission, type Permission } from '@/lib/catalog'

/**
 * Built-in roles (SPEC section 4). Permission sets are explicit so the role
 * matrix in Settings -> Roles can show exactly what each role gets. Custom
 * roles are Role documents whose `key` is their own id; members point at them
 * by storing the Role _id (as a string) in `Member.role`.
 */

export const BUILTIN_ROLE_KEYS = ['owner', 'admin', 'hr_admin', 'hr_exec', 'finance', 'manager', 'sales', 'member'] as const
export type RoleKey = (typeof BUILTIN_ROLE_KEYS)[number]

export const isBuiltInRole = (role: string): role is RoleKey => (BUILTIN_ROLE_KEYS as readonly string[]).includes(role)

/** What every member can do in Work: their own tasks, meetings, posts and time. */
const WORK_BASIC: Permission[] = [
  'tasks.read', 'tasks.write', 'projects.read', 'meetings.write', 'posts.write', 'time.write', 'whiteboards.write', 'arc.use',
]

const MUSTER_ALL = permissionsOf('muster')
const ORBIT_ALL = permissionsOf('orbit')
const FOLIO_ALL = permissionsOf('folio')
const WORK_ALL = permissionsOf('work')

export type BuiltInRole = { key: RoleKey; label: string; description: string; permissions: readonly Permission[] }

const unique = (list: Permission[]): Permission[] => [...new Set(list)]

export const BUILTIN_ROLES: Record<RoleKey, BuiltInRole> = {
  owner: {
    key: 'owner',
    label: 'Owner',
    description: 'Everything, including the subscription and deleting the workspace.',
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    key: 'admin',
    label: 'Admin',
    description: 'Everything except the subscription and deleting the workspace.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'billing.manage' && p !== 'org.delete'),
  },
  hr_admin: {
    key: 'hr_admin',
    label: 'HR admin',
    description: 'All of Muster: people, attendance, leave, claims, payroll run and approval, letters.',
    permissions: unique([...MUSTER_ALL, ...WORK_BASIC, 'clients.read', 'audit.read']),
  },
  hr_exec: {
    key: 'hr_exec',
    label: 'HR executive',
    description: 'People, attendance, leave, claims and letters. Does not see salaries or payroll, and no sensitive IDs.',
    permissions: unique([
      'people.read', 'people.read_all', 'people.write', 'people.import', 'attendance.read', 'attendance.manage', 'attendance.approve',
      'leave.read', 'leave.approve', 'leave.manage', 'claims.read', 'claims.review', 'claims.forms',
      'letters.read', 'letters.write', 'hr.reports', ...WORK_BASIC, 'clients.read',
      // No 'payroll.read' (owner decision D3): salaries, payslips, salary structures and pay reports stay hidden.
    ]),
  },
  finance: {
    key: 'finance',
    label: 'Finance',
    description: 'Payroll approval and release, claim payouts, all of Folio and reports.',
    permissions: unique([
      'payroll.read', 'payroll.approve', 'payroll.lock', 'payroll.release', 'claims.read', 'claims.review', 'claims.pay',
      'people.read', 'people.read_all', 'people.read_sensitive', 'attendance.read', 'letters.read', 'hr.reports', ...FOLIO_ALL, 'orbit.read', 'orbit.reports', 'work.reports',
      'clients.read', 'clients.write', ...WORK_BASIC, 'audit.read',
    ]),
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    description: 'All of Work, approvals for direct reports, and read access to Orbit.',
    permissions: unique([
      ...WORK_ALL, 'leave.read', 'leave.approve', 'attendance.read', 'attendance.approve', 'people.read', 'people.read_team',
      'letters.read', 'orbit.read', 'orbit.view_all', 'clients.read', 'clients.write',
    ]),
  },
  sales: {
    key: 'sales',
    label: 'Sales',
    description: 'All of Orbit, client records and Folio quotes.',
    permissions: unique([...ORBIT_ALL, 'clients.read', 'clients.write', 'quotes.write', ...WORK_BASIC]),
  },
  member: {
    key: 'member',
    label: 'Member',
    description: 'Their own tasks and self-service: attendance, leave, claims and payslips.',
    permissions: unique([...WORK_BASIC, 'clients.read']),
  },
}

export type CustomRole = { _id: unknown; key: string; label: string; permissions: string[] }

/**
 * The permission set for a member's role. Built-in keys resolve from code
 * (so updates ship with releases); anything else is looked up in the org's
 * custom roles by id or key. Unknown roles get nothing.
 */
export function resolvePermissions(role: string, customRoles: readonly CustomRole[] = []): Set<Permission> {
  if (isBuiltInRole(role)) return new Set(BUILTIN_ROLES[role].permissions)
  const custom = customRoles.find((r) => String(r._id) === role || r.key === role)
  if (!custom) return new Set()
  return new Set(custom.permissions.filter(isPermission))
}

export function roleLabel(role: string, customRoles: readonly CustomRole[] = []): string {
  if (isBuiltInRole(role)) return BUILTIN_ROLES[role].label
  return customRoles.find((r) => String(r._id) === role || r.key === role)?.label ?? 'Custom role'
}

/** Role documents to insert when a workspace is created. */
export const builtInRoleDocs = () =>
  BUILTIN_ROLE_KEYS.map((key) => ({
    key,
    label: BUILTIN_ROLES[key].label,
    description: BUILTIN_ROLES[key].description,
    permissions: [...BUILTIN_ROLES[key].permissions],
    builtIn: true,
  }))
