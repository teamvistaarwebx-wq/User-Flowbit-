import { Types } from 'mongoose'
import { addDays } from '@/lib/dates'
import { priceDocument, storedPricing } from '@/modules/folio/invoices/pricing'

/**
 * "Load sample agency" (pure): a small, believable agency in the user's own
 * workspace (2 clients, 3 projects, 15 tasks, 5 leads, 2 draft invoices,
 * 3 employees). Every row carries `sample: true`, so "Remove sample data"
 * deletes exactly these and nothing the team entered.
 */

export const SAMPLE_COLLECTIONS = ['clients', 'projects', 'tasks', 'leads', 'invoices', 'employees'] as const
export type SampleCollection = (typeof SAMPLE_COLLECTIONS)[number]
export type SampleDoc = Record<string, unknown> & { sample: true }
export type SampleSet = Record<SampleCollection, SampleDoc[]>

export type SampleInput = Readonly<{
  today: string
  memberId: Types.ObjectId
  /** Products the workspace has: rows of other products are left out. */
  products: { work: boolean; orbit: boolean; folio: boolean; muster: boolean }
  /** One task key per call, e.g. 'VW-12'. */
  taskKeys: readonly string[]
  /** The Folio business to bill from; without one the invoices are skipped. */
  entity?: { id: Types.ObjectId; kind: 'gst' | 'non_gst'; stateCode: string | null } | null
}>

export const SAMPLE_TASK_COUNT = 15

const CLIENTS = [
  { name: 'Sharma Textiles (sample)', email: 'accounts@sharmatextiles.example', phone: '+91 98200 11111', city: 'Surat', stateCode: '24' },
  { name: 'Rao Foods (sample)', email: 'finance@raofoods.example', phone: '+91 98450 22222', city: 'Bengaluru', stateCode: '29' },
]

const PROJECTS = [
  { code: 'SMPL-WEB', name: 'Sharma Textiles website', client: 0, color: '#818CF8', start: -20, end: 25 },
  { code: 'SMPL-SEO', name: 'Rao Foods SEO retainer', client: 1, color: '#5EEAB0', start: -45, end: 120 },
  { code: 'SMPL-OPS', name: 'Agency operations', client: null, color: '#F472B6', start: -60, end: null },
] as const

type TaskSeed = readonly [title: string, project: number, status: 'todo' | 'in_progress' | 'in_review' | 'done', due: number, priority: 'low' | 'medium' | 'high' | 'urgent']
const TASKS: readonly TaskSeed[] = [
  ['Homepage wireframe', 0, 'done', -10, 'high'],
  ['Product catalogue page', 0, 'in_progress', 3, 'high'],
  ['Write About us copy', 0, 'in_review', 1, 'medium'],
  ['Mobile menu fixes', 0, 'todo', 6, 'medium'],
  ['Launch checklist', 0, 'todo', 20, 'urgent'],
  ['Keyword research: biscuits', 1, 'done', -15, 'medium'],
  ['Fix 404s from old site', 1, 'in_progress', 2, 'high'],
  ['October blog posts (4)', 1, 'todo', 12, 'medium'],
  ['Google Business profile', 1, 'todo', -2, 'medium'],
  ['Monthly SEO report', 1, 'todo', 22, 'low'],
  ['Send September invoices', 2, 'done', -8, 'high'],
  ['Renew domain and hosting', 2, 'todo', 9, 'medium'],
  ['Team offsite plan', 2, 'in_progress', 14, 'low'],
  ['Update proposal template', 2, 'todo', 5, 'low'],
  ['Collect GST invoices from vendors', 2, 'todo', 4, 'medium'],
]

const LEADS = [
  { companyName: 'Mehta Jewellers (sample)', contactName: 'Kavita Mehta', sector: 'd2c', source: 'instagram', stage: 'new' },
  { companyName: 'Green Acres Realty (sample)', contactName: 'Arjun Nair', sector: 'real_estate', source: 'referral', stage: 'contacted' },
  { companyName: 'Seva Foundation (sample)', contactName: 'Meera Iyer', sector: 'dev_ngo', source: 'linkedin', stage: 'engaged' },
  { companyName: 'Chai Point Express (sample)', contactName: 'Rohit Gupta', sector: 'd2c', source: 'email_outreach', stage: 'meeting_booked' },
  { companyName: 'Urban Nest Interiors (sample)', contactName: 'Sana Khan', sector: 'other', source: 'referral', stage: 'new' },
] as const

const EMPLOYEES = [
  { code: 'SMPL-001', firstName: 'Asha', lastName: 'Verma (sample)', designation: 'Design Lead', joinDate: -400, dob: '1993-03-14', workLocation: 'Pune' },
  { code: 'SMPL-002', firstName: 'Ravi', lastName: 'Kumar (sample)', designation: 'SEO Specialist', joinDate: -200, dob: '1996-11-02', workLocation: 'Pune' },
  { code: 'SMPL-003', firstName: 'Neha', lastName: 'Joshi (sample)', designation: 'Account Manager', joinDate: -30, dob: '1995-07-21', workLocation: 'Mumbai' },
] as const

const INVOICES = [
  { client: 0, lines: [{ description: 'Website design and build (milestone 1)', quantity: 1, ratePaise: 7_500_000 }] },
  { client: 1, lines: [{ description: 'SEO retainer: October', quantity: 1, ratePaise: 4_500_000 }, { description: 'Blog posts', quantity: 4, ratePaise: 300_000 }] },
] as const

const mark = <T extends Record<string, unknown>>(doc: T): T & { sample: true } => ({ ...doc, sample: true })

function invoiceDocs(input: SampleInput, clientIds: Types.ObjectId[]): SampleDoc[] {
  const entity = input.entity
  if (!input.products.folio || !entity) return []
  return INVOICES.map((inv) => {
    const client = CLIENTS[inv.client]
    const priced = priceDocument({
      entityKind: entity.kind,
      entityStateCode: entity.stateCode,
      clientStateCode: client.stateCode,
      supplyMode: 'auto',
      lines: inv.lines.map((l) => ({ ...l, unit: 'nos', discountPercent: 0, gstRatePercent: 18, hsnSac: '998314' })),
      discountType: null,
      discountValue: 0,
      tdsPercent: 0,
      roundOffTotal: true,
    })
    return mark({
      clientId: clientIds[inv.client],
      entityId: entity.id,
      status: 'draft',
      issueDate: input.today,
      dueDate: addDays(input.today, 15),
      billTo: { name: client.name, city: client.city, stateCode: client.stateCode, country: 'India', addressLines: [] },
      ...storedPricing(priced),
      createdBy: input.memberId,
    })
  })
}

/** Every sample row for the workspace, ids linked (projects → clients, tasks → projects, invoices → clients). */
export function buildSampleSet(input: SampleInput): SampleSet {
  const me = input.memberId
  const { today, products } = input
  const hasClients = products.work || products.orbit || products.folio
  const clientIds = CLIENTS.map(() => new Types.ObjectId())
  const projectIds = PROJECTS.map(() => new Types.ObjectId())
  const clients = hasClients ? CLIENTS.map((c, i) => mark({ _id: clientIds[i], name: c.name, email: c.email, phone: c.phone, kind: 'company', status: 'active', contacts: [{ name: 'Accounts', email: c.email, primary: true }] })) : []
  const projects = products.work
    ? PROJECTS.map((p, i) => mark({
        _id: projectIds[i], code: p.code, name: p.name, clientId: p.client === null || !hasClients ? undefined : clientIds[p.client], status: 'active', leadId: me, memberIds: [me], color: p.color,
        startDate: addDays(today, p.start), endDate: p.end === null ? undefined : addDays(today, p.end), createdById: me, description: 'Sample project. Remove it any time from Home or Settings → Company profile.',
      }))
    : []
  const tasks = products.work
    ? TASKS.map(([title, project, status, due, priority], i) => mark({
        key: input.taskKeys[i], title, status, priority, assigneeIds: [me], creatorId: me, watcherIds: [me], projectId: projectIds[project],
        clientId: PROJECTS[project].client === null || !hasClients ? undefined : clientIds[PROJECTS[project].client!], dueDate: addDays(today, due), order: i,
        ...(status === 'done' ? { completedAt: new Date(`${addDays(today, due)}T12:00:00+05:30`), startedAt: new Date(`${addDays(today, due - 3)}T10:00:00+05:30`) } : status === 'todo' ? {} : { startedAt: new Date(`${addDays(today, -2)}T10:00:00+05:30`) }),
      }))
    : []
  const leads = products.orbit ? LEADS.map((l) => mark({ ...l, email: '', ownerId: me, createdBy: me, notes: 'Sample lead.' })) : []
  const employees = products.muster
    ? EMPLOYEES.map((e) => {
        const workEmail = `${e.firstName.toLowerCase()}.sample@example.com`
        return mark({ code: e.code, firstName: e.firstName, lastName: e.lastName, fullName: `${e.firstName} ${e.lastName}`, workEmail, workEmailLower: workEmail, designation: e.designation, joinDate: addDays(today, e.joinDate), dob: e.dob, workLocation: e.workLocation, status: 'active', employmentType: 'full_time' })
      })
    : []
  return { clients, projects, tasks, leads, invoices: invoiceDocs(input, clientIds), employees }
}

export type SampleCounts = Record<SampleCollection, number>

/** Storage for sample rows, already limited to one workspace (ctx.db in the app, a fake in tests). */
export type SampleWriter = Readonly<{
  insertMany: (collection: SampleCollection, docs: SampleDoc[]) => Promise<void>
  /** Deletes every row marked sample: true; returns how many. Only for undoing a half-finished load. */
  deleteSample: (collection: SampleCollection) => Promise<number>
  countSample: (collection: SampleCollection) => Promise<number>
  /** Ids of the rows still marked sample: true. */
  sampleIds: (collection: SampleCollection) => Promise<string[]>
  /** Of these sample ids, the ones real data now depends on (issued, numbered, paid, logged against, linked). */
  inUse: (collection: SampleCollection, ids: string[]) => Promise<Set<string>>
  /** Deletes these rows; returns how many. */
  deleteIds: (collection: SampleCollection, ids: string[]) => Promise<number>
  /** Clears the sample mark, so a row the team has used becomes ordinary data. */
  adopt: (collection: SampleCollection, ids: string[]) => Promise<void>
}>

export type SampleRemoval = { removed: SampleCounts; kept: SampleCounts }

/** Inserts a sample set; parents first so links resolve. */
export async function insertSampleSet(writer: SampleWriter, set: SampleSet): Promise<SampleCounts> {
  const counts = {} as SampleCounts
  for (const c of SAMPLE_COLLECTIONS) {
    if (set[c].length) await writer.insertMany(c, set[c])
    counts[c] = set[c].length
  }
  return counts
}

/** Undoes a half-finished load: every sample row goes, children first. */
export async function discardSampleSet(writer: SampleWriter): Promise<SampleCounts> {
  const counts = {} as SampleCounts
  for (const c of [...SAMPLE_COLLECTIONS].reverse()) counts[c] = await writer.deleteSample(c)
  return counts
}

/**
 * Removes the sample rows nobody has used, children first, so a parent is checked after its unused children
 * are gone. Rows real data depends on (an issued invoice, an employee with payroll, a task with time) are kept
 * and lose the sample mark, so they become ordinary data. Real rows are never touched.
 */
export async function removeSampleSet(writer: SampleWriter): Promise<SampleRemoval> {
  const removed = {} as SampleCounts
  const kept = {} as SampleCounts
  for (const c of [...SAMPLE_COLLECTIONS].reverse()) {
    const ids = await writer.sampleIds(c)
    const used = ids.length ? await writer.inUse(c, ids) : new Set<string>()
    const unused = ids.filter((id) => !used.has(id))
    const keep = ids.filter((id) => used.has(id))
    removed[c] = unused.length ? await writer.deleteIds(c, unused) : 0
    if (keep.length) await writer.adopt(c, keep)
    kept[c] = keep.length
  }
  return { removed, kept }
}

/** The toast after removal: what went, and what stayed because the team used it. */
export function removalMessage({ removed, kept }: SampleRemoval): string {
  const anyRemoved = Object.values(removed).some(Boolean)
  const anyKept = Object.values(kept).some(Boolean)
  if (!anyRemoved && !anyKept) return 'There was no sample data to remove.'
  const gone = anyRemoved ? `Removed ${describeCounts(removed)}.` : 'Nothing was removed.'
  const stayed = anyKept ? ` Kept ${describeCounts(kept, 'kept')} because your team has used them (issued, paid, logged or linked); they are now ordinary data you can rename, archive or void.` : ''
  return `${gone}${stayed} Your own data is untouched.`
}

/** True when the workspace still has sample rows. */
export async function hasSampleData(writer: SampleWriter): Promise<boolean> {
  for (const c of SAMPLE_COLLECTIONS) if ((await writer.countSample(c)) > 0) return true
  return false
}

/** "3 projects, 15 tasks and 2 clients" from counts (zero counts left out). */
export function describeCounts(counts: Partial<SampleCounts>, kind: 'loaded' | 'kept' = 'loaded'): string {
  const invoices: [string, string] = kind === 'kept' ? ['invoice', 'invoices'] : ['draft invoice', 'draft invoices']
  const labels: Record<SampleCollection, [string, string]> = { clients: ['client', 'clients'], projects: ['project', 'projects'], tasks: ['task', 'tasks'], leads: ['lead', 'leads'], invoices, employees: ['employee', 'employees'] }
  const parts = SAMPLE_COLLECTIONS.filter((c) => (counts[c] ?? 0) > 0).map((c) => `${counts[c]} ${labels[c][counts[c] === 1 ? 0 : 1]}`)
  if (parts.length <= 1) return parts[0] ?? 'nothing'
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
