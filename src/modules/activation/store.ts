import 'server-only'
import { Types } from 'mongoose'
import { Meeting } from '@/models/work/Meeting'
import { TaskComment } from '@/models/work/TaskComment'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { CreditNote } from '@/models/folio/CreditNote'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { FolioRetainer } from '@/models/folio/Retainer'
import { PortalContact } from '@/models/portal/PortalContact'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { CompOff } from '@/models/muster/CompOff'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Letter } from '@/models/muster/Letter'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { Client } from '@/models/Client'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { AttendanceDay } from '@/models/AttendanceDay'
import { UsageEvent } from '@/models/console/UsageEvent'
import { FolioEntity } from '@/models/folio/Entity'
import { Invoice } from '@/models/folio/Invoice'
import { Employee } from '@/models/muster/Employee'
import { Lead } from '@/models/orbit/Lead'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { nextTaskKey } from '@/modules/work/tasks/create'
import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'
import { checklistProgress, showChecklist, type ChecklistProgress } from './checklist'
import { SAMPLE_TASK_COUNT, buildSampleSet, hasSampleData, type SampleCollection, type SampleWriter } from './sample-data'

/** Server side of activation: the sample-data writer over the workspace's scoped models, and the checklist facts. */

const NOT_SAMPLE = { sample: { $ne: true } }

const MODELS = { clients: Client, projects: Project, tasks: Task, leads: Lead, invoices: Invoice, employees: Employee } as const

type Db = Pick<Ctx, 'db'>['db']
type IdModel = typeof Client
const oid = (ids: string[]) => ids.map((id) => new Types.ObjectId(id))

/** Ids among `ids` that rows of `model` point at through `field` (narrowed by `extra`). */
async function referenced(db: Db, model: IdModel, field: string, ids: string[], extra: Record<string, unknown> = {}): Promise<string[]> {
  const found = await db(model).distinct(field, { [field]: { $in: oid(ids) }, ...extra })
  return found.map(String)
}

/** What makes a sample row "used": real data that would break or vanish with it. Checked children first. */
const USE_CHECKS: Record<SampleCollection, (db: Db, ids: string[]) => Promise<string[]>[]> = {
  employees: (db, ids) => [
    ...[PayrollEntry, Payslip, PayrollAdjustment, SalaryStructure, LeaveRequest, Claim, AttendanceCorrection, CompOff, Letter, TaxDeclaration, BankChangeRequest, EmployeeDocument].map((m) => referenced(db, m as unknown as IdModel, 'employeeId', ids)),
    referenced(db, AttendanceDay as unknown as IdModel, 'employeeId', ids, { firstIn: { $ne: null } }),
    db(Employee).distinct('_id', { _id: { $in: oid(ids) }, memberId: { $ne: null } }).then((r) => r.map(String)),
  ],
  invoices: (db, ids) => [db(Invoice).distinct('_id', { _id: { $in: oid(ids) }, $or: [{ status: { $ne: 'draft' } }, { number: { $type: 'string' } }] }).then((r) => r.map(String))],
  leads: (db, ids) => [Activity, Deal, SequenceEnrollment].map((m) => referenced(db, m as unknown as IdModel, 'leadId', ids)),
  tasks: (db, ids) => [
    referenced(db, TimeEntry as unknown as IdModel, 'taskId', ids),
    referenced(db, TaskComment as unknown as IdModel, 'taskId', ids),
    referenced(db, Task as unknown as IdModel, 'parentId', ids),
  ],
  projects: (db, ids) => [Task, TimeEntry, Meeting].map((m) => referenced(db, m as unknown as IdModel, 'projectId', ids)),
  clients: (db, ids) => [Project, Task, Invoice, Quote, FolioReceipt, CreditNote, FolioRetainer, FolioBillingPlan, Deal, Activity, PortalContact].map((m) => referenced(db, m as unknown as IdModel, 'clientId', ids)),
}

/** Sample rows through ctx.db: every read and write is limited to this workspace. */
export function sampleWriter(ctx: Pick<Ctx, 'db'>): SampleWriter {
  const db = (c: SampleCollection) => ctx.db(MODELS[c] as typeof Client)
  return {
    insertMany: async (c, docs) => {
      await db(c).insertMany(docs)
    },
    deleteSample: async (c) => (await db(c).deleteMany({ sample: true })).deletedCount ?? 0,
    countSample: (c) => db(c).countDocuments({ sample: true }),
    sampleIds: async (c) => (await db(c).distinct('_id', { sample: true })).map(String),
    inUse: async (c, ids) => new Set((await Promise.all(USE_CHECKS[c](ctx.db, ids))).flat()),
    deleteIds: async (c, ids) => (await db(c).deleteMany({ _id: { $in: oid(ids) }, sample: true })).deletedCount ?? 0,
    adopt: async (c, ids) => {
      await db(c).updateMany({ _id: { $in: oid(ids) } }, { $unset: { sample: 1 } })
    },
  }
}

export const workspaceHasSample = (ctx: Ctx) => hasSampleData(sampleWriter(ctx))

/** The sample set for this workspace and member (task keys taken from the workspace's own sequence). */
export async function sampleSetFor(ctx: Ctx) {
  const products = { work: ctx.has('work'), orbit: ctx.has('orbit'), folio: ctx.has('folio'), muster: ctx.has('muster') }
  const taskKeys = products.work ? await Promise.all(Array.from({ length: SAMPLE_TASK_COUNT }, () => nextTaskKey(ctx))) : []
  const entity = products.folio ? await ctx.db(FolioEntity).findOne({ isActive: true }, { kind: 1, address: 1 }).sort({ isDefault: -1 }).lean() : null
  return buildSampleSet({
    today: todayIST(),
    memberId: ctx.memberId,
    products,
    taskKeys,
    entity: entity ? { id: entity._id, kind: entity.kind as 'gst' | 'non_gst', stateCode: entity.address?.stateCode ?? null } : null,
  })
}

const products = (ctx: Ctx): ProductKey[] => PRODUCT_KEYS.filter((p) => ctx.has(p))

/** The Home checklist for this workspace: progress from real (non-sample) data and usage events, and whether to show it. */
export async function checklistFor(ctx: Ctx): Promise<{ show: boolean; progress: ChecklistProgress; hasSample: boolean }> {
  const canManage = ctx.can('org.manage')
  const dismissedAt = ctx.org.activation?.checklistDismissedAt ?? null
  const empty = { show: false, progress: { items: [], done: 0, total: 0, complete: true }, hasSample: false }
  if (!canManage) return empty
  // Dismissed: no checklist, but the sample agency can still be removed from Home.
  if (dismissedAt) return { ...empty, hasSample: await workspaceHasSample(ctx) }
  const [invites, teammates, projects, tasks, checkins, invoices, usage, hasSample] = await Promise.all([
    ctx.db(Invite).countDocuments({ revokedAt: null, acceptedAt: null, expiresAt: { $gt: new Date() } }),
    ctx.db(Member).countDocuments({ status: 'active', _id: { $ne: ctx.memberId } }),
    ctx.has('work') ? ctx.db(Project).countDocuments(NOT_SAMPLE) : 0,
    ctx.has('work') ? ctx.db(Task).countDocuments(NOT_SAMPLE) : 0,
    ctx.has('muster') ? ctx.db(AttendanceDay).countDocuments({ firstIn: { $ne: null } }) : 0,
    ctx.has('folio') ? ctx.db(Invoice).countDocuments(NOT_SAMPLE) : 0,
    UsageEvent.distinct('kind', { orgId: ctx.orgId, kind: { $in: ['task_created', 'attendance_marked', 'invoice_issued'] } }),
    workspaceHasSample(ctx),
  ])
  const progress = checklistProgress({ invites, teammates, projects, tasks, checkins, invoices, usage: new Set(usage.map(String)) }, products(ctx))
  return { show: showChecklist({ canManage, createdAt: ctx.org.createdAt, now: new Date(), dismissedAt, complete: progress.complete }), progress, hasSample }
}
