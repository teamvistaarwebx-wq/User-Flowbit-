import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import type { ListParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { User } from '@/models/User'
import { Member } from '@/models/Member'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee, WITHOUT_SENSITIVE } from '@/models/muster/Employee'
import { DIRECTORY_STATUSES, workModeOf, type WorkMode } from './lifecycle'
import { employeesWithSalary } from './foreign'
import { visibleEmployeeIds, visibleFilter } from './scope'

export type Option = { value: string; label: string }

/** Departments, designations and possible managers for forms and filters. */
export async function peopleOptions(ctx: Ctx) {
  const [departments, designations, managers] = await Promise.all([
    ctx.db(Department).find({ deletedAt: null }).sort({ name: 1 }).lean(),
    ctx.db(Designation).find({ deletedAt: null }).sort({ title: 1 }).lean(),
    ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES } }, { fullName: 1, code: 1 }).sort({ fullName: 1 }).lean(),
  ])
  return {
    departments: departments.map((d) => ({ value: String(d._id), label: d.name, code: d.code })),
    designations: designations.map((d) => ({ value: String(d._id), label: d.title })),
    managers: managers.map((m) => ({ value: String(m._id), label: `${m.fullName} (${m.code})` })),
  }
}

export const STATUS_FILTERS = ['current', 'probation', 'notice_period', 'past', 'all'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

const statusClause = (f: StatusFilter): Record<string, unknown> => {
  if (f === 'all') return {}
  if (f === 'probation') return { status: 'probation' }
  if (f === 'notice_period') return { status: { $in: ['notice_period', 'resigned'] } }
  if (f === 'past') return { status: { $nin: DIRECTORY_STATUSES } }
  return { status: { $in: DIRECTORY_STATUSES } }
}

const blank = (path: string) => ({ [path]: { $in: [null, ''] } })

/** Mongo clause for "missing PAN, bank account or salary structure". */
function incompleteClause(withSalary: Set<string>): Record<string, unknown> {
  return { $or: [blank('pan'), blank('bank.accountNumber'), blank('bank.ifsc'), { _id: { $nin: [...withSalary].map((id) => new Types.ObjectId(id)) } }] }
}

export type DirectoryRow = {
  id: string
  code: string
  fullName: string
  workEmail: string
  designation: string | null
  department: string | null
  status: string
  employmentType: string
  workMode: WorkMode
  joinDate: string
  linked: boolean
  missing: string[]
}

/** The people directory page: filters from the URL, sensitive values never loaded (only readiness booleans). */
export async function listPeople(ctx: Ctx, p: ListParams) {
  const ids = await visibleEmployeeIds(ctx)
  const status = (STATUS_FILTERS as readonly string[]).includes(p.get('status') ?? '') ? (p.get('status') as StatusFilter) : 'current'
  const withSalary = await employeesWithSalary(ctx)
  const filter: Record<string, unknown> = { deletedAt: null, ...visibleFilter(ids), ...statusClause(status) }
  const and: Record<string, unknown>[] = []
  if (p.q) {
    const rx = new RegExp(escapeRegex(p.q), 'i')
    and.push({ $or: [{ fullName: rx }, { code: rx }, { workEmail: rx }, { designation: rx }] })
  }
  const dept = p.get('dept')
  if (dept && Types.ObjectId.isValid(dept)) filter.departmentId = new Types.ObjectId(dept)
  if (p.get('filter') === 'incomplete') and.push(incompleteClause(withSalary))
  if (p.get('filter') === 'nologin') filter.memberId = null
  // An unset work mode counts as office.
  const mode = p.get('mode')
  if (mode === 'remote') filter.workMode = 'remote'
  else if (mode === 'office') filter.workMode = { $ne: 'remote' }
  if (and.length) filter.$and = and

  const sort: Record<string, 1 | -1> = p.sort === 'joinDate' ? { joinDate: p.dir === 'asc' ? 1 : -1 } : p.sort === 'code' ? { code: p.dir === 'asc' ? 1 : -1 } : { fullName: p.dir === 'desc' && p.sort === 'fullName' ? -1 : 1 }
  const [rows, total, departments] = await Promise.all([
    ctx.db(Employee).find(filter, { ...WITHOUT_SENSITIVE, address: 0, notes: 0 }).sort(sort).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(Employee).countDocuments(filter),
    ctx.db(Department).find({}).lean(),
  ])
  const ready = await readinessOf(ctx, rows.map((r) => r._id), withSalary)
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))
  const out: DirectoryRow[] = rows.map((r) => ({
    id: String(r._id),
    code: r.code,
    fullName: r.fullName,
    workEmail: r.workEmail,
    designation: r.designation ?? null,
    department: r.departmentId ? (deptName.get(String(r.departmentId)) ?? null) : null,
    status: r.status,
    employmentType: r.employmentType,
    workMode: workModeOf(r.workMode),
    joinDate: r.joinDate,
    linked: Boolean(r.memberId),
    missing: ready.get(String(r._id)) ?? [],
  }))
  return { rows: out, total, status }
}

const present = (path: string) => ({ $gt: [{ $strLenCP: { $trim: { input: { $ifNull: [path, ''] } } } }, 0] })

/** Per employee, which payroll essentials are missing (labels only, never values). */
export async function readinessOf(ctx: Ctx, ids: Types.ObjectId[], withSalary?: Set<string>): Promise<Map<string, string[]>> {
  if (!ids.length) return new Map()
  const salary = withSalary ?? (await employeesWithSalary(ctx))
  const flags = await ctx.db(Employee).aggregate<{ _id: Types.ObjectId; hasPan: boolean; hasBank: boolean }>([
    { $match: { _id: { $in: ids } } },
    { $project: { hasPan: present('$pan'), hasBank: { $and: [present('$bank.accountNumber'), present('$bank.ifsc')] } } },
  ])
  return new Map(
    flags.map((f) => {
      const missing = [!salary.has(String(f._id)) && 'salary structure', !f.hasBank && 'bank account', !f.hasPan && 'PAN'].filter(Boolean) as string[]
      return [String(f._id), missing]
    }),
  )
}

/** Whether PAN, bank account and UAN are on file, as booleans only (any reader sees the same checklist). */
export async function statutoryFlags(ctx: Ctx, id: Types.ObjectId): Promise<{ pan: boolean; bank: boolean; uan: boolean }> {
  const [row] = await ctx.db(Employee).aggregate<{ pan: boolean; bank: boolean; uan: boolean }>([
    { $match: { _id: id } },
    { $project: { _id: 0, pan: present('$pan'), uan: present('$uan'), bank: { $and: [present('$bank.accountNumber'), present('$bank.ifsc')] } } },
  ])
  return row ?? { pan: false, bank: false, uan: false }
}

/** People with the given Employee ids → display names. */
export async function employeeNames(ctx: Pick<Ctx, 'db'>, ids: (Types.ObjectId | string | null | undefined)[]): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter(Boolean).map(String))].filter((id) => Types.ObjectId.isValid(id))
  if (!clean.length) return new Map()
  const rows = await ctx.db(Employee).find({ _id: { $in: clean.map((id) => new Types.ObjectId(id)) } }, { fullName: 1 }).lean()
  return new Map(rows.map((r) => [String(r._id), r.fullName]))
}

/** Members of this org that are not linked to an employee yet (for "Link to member"). */
export async function linkableMembers(ctx: Ctx): Promise<Option[]> {
  const members = await ctx.db(Member).find({ status: { $in: ['active', 'invited'] }, employeeId: null }).lean()
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
  const byId = new Map(users.map((u) => [String(u._id), u]))
  return members
    .map((m) => {
      const u = byId.get(String(m.userId))
      return { value: String(m._id), label: u ? `${u.name} (${u.email})${m.status === 'invited' ? ' · invited' : ''}` : 'Unknown member' }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Name and email of the member linked to an employee. */
export async function linkedMember(ctx: Ctx, memberId: Types.ObjectId | null | undefined) {
  if (!memberId) return null
  const member = await ctx.db(Member).findById(memberId).lean()
  if (!member) return null
  const user = await User.findById(member.userId, { name: 1, email: 1 }).lean()
  return { id: String(member._id), status: member.status, role: member.role, name: user?.name ?? '', email: user?.email ?? '' }
}
