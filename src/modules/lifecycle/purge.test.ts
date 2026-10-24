import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { deletionEnabled, purgeSummary, purgeWorkspace, type PurgeFilter, type PurgeStore } from './purge'
import { TENANT_COLLECTIONS, type TenantCollection } from './registry'
import { ownerDeletionPurgeDue } from '@/lib/lifecycle'

const NOW = new Date('2027-08-01T00:00:00Z')
const DAY = 86_400_000
type Doc = { _id: string; orgId: Types.ObjectId; createdAt: Date; [key: string]: unknown }

const matches = (doc: Doc, f: PurgeFilter) => {
  if (String(doc.orgId) !== String(f.orgId)) return false
  if (f.createdAt && '$lt' in f.createdAt) return doc.createdAt.getTime() < f.createdAt.$lt.getTime()
  if (f.createdAt && '$gte' in f.createdAt) return doc.createdAt.getTime() >= f.createdAt.$gte.getTime()
  return true
}

/** The purge's storage in memory: every collection holds rows of both workspaces. */
function memoryStore(seed: Map<string, Doc[]>, files: Map<string, string>) {
  const db = new Map([...seed].map(([k, v]) => [k, v.map((d) => ({ ...d }))]))
  const fileStore = new Map(files)
  const tombstones: string[] = []
  const rows = (c: TenantCollection) => db.get(c.name) ?? []
  const store: PurgeStore = {
    count: async (c, f) => rows(c).filter((d) => matches(d, f)).length,
    deleteMany: async (c, f) => {
      const before = rows(c)
      const kept = before.filter((d) => !matches(d, f))
      db.set(c.name, kept)
      return before.length - kept.length
    },
    anonymise: async (c, f, change) => {
      let n = 0
      db.set(
        c.name,
        rows(c).map((d) => {
          if (!matches(d, f)) return d
          n += 1
          const next: Doc = { ...d, ...change.set }
          return Object.fromEntries(Object.entries(next).filter(([k]) => !change.unset.includes(k))) as Doc
        }),
      )
      return n
    },
    filePaths: async (orgId) => [...fileStore.keys()].filter((p) => p.startsWith(`${String(orgId)}/`)),
    deleteFile: async (path) => {
      fileStore.delete(path)
    },
    tombstone: async (orgId) => {
      tombstones.push(String(orgId))
    },
  }
  return { store, db, fileStore, tombstones }
}

const A = new Types.ObjectId()
const B = new Types.ObjectId()

function seed(): { docs: Map<string, Doc[]>; files: Map<string, string> } {
  const docs = new Map<string, Doc[]>()
  for (const c of TENANT_COLLECTIONS) {
    docs.set(c.name, [
      { _id: `${c.name}-a-new`, orgId: A, createdAt: new Date(NOW.getTime() - 10 * DAY), actorName: 'Asha', to: ['asha@a.in'], subject: 'Hi Asha', payload: { email: 'asha@a.in' } },
      { _id: `${c.name}-a-old`, orgId: A, createdAt: new Date(NOW.getTime() - 500 * DAY), actorName: 'Asha', to: ['asha@a.in'] },
      { _id: `${c.name}-b`, orgId: B, createdAt: new Date(NOW.getTime() - 500 * DAY), actorName: 'Bina', to: ['bina@b.in'], subject: 'Hi Bina', payload: { email: 'bina@b.in' } },
    ])
  }
  const files = new Map([
    [`${String(A)}/2027-01/1-offer.pdf`, 'a'],
    [`${String(B)}/2027-01/2-offer.pdf`, 'b'],
  ])
  return { docs, files }
}

const rowsOf = (db: Map<string, Doc[]>, name: string, org: Types.ObjectId) => (db.get(name) ?? []).filter((d) => String(d.orgId) === String(org))

describe('workspace deletion', () => {
  it('is a dry run locally, in dev and on previews (owner decision D4)', () => {
    expect(deletionEnabled({})).toBe(false)
    expect(deletionEnabled({ NODE_ENV: 'development', LIFECYCLE_DELETE_ENABLED: '1' })).toBe(false)
    expect(deletionEnabled({ NODE_ENV: 'production', APP_URL: 'http://localhost:3000' })).toBe(false)
    expect(deletionEnabled({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false)
  })

  it('is on by default on a deployed production server, and LIFECYCLE_DELETE_ENABLED=false stops it', () => {
    const prod = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' }
    expect(deletionEnabled(prod)).toBe(true)
    expect(deletionEnabled({ ...prod, LIFECYCLE_DELETE_ENABLED: 'false' })).toBe(false)
    expect(deletionEnabled({ ...prod, LIFECYCLE_DELETE_ENABLED: 'FALSE' })).toBe(false)
    expect(deletionEnabled({ LIFECYCLE_DELETE_ENABLED: 'true' })).toBe(true)
  })

  it('dry run: reports what would go and changes nothing', async () => {
    const { docs, files } = seed()
    const mem = memoryStore(docs, files)
    const report = await purgeWorkspace(mem.store, TENANT_COLLECTIONS, A, { apply: false, now: NOW })
    expect(report.apply).toBe(false)
    expect(report.tombstone).toBe(false)
    expect(report.files).toBe(1)
    expect(report.collections.find((l) => l.name === 'Task')).toMatchObject({ action: 'delete', deleted: 2 })
    expect(report.collections.find((l) => l.name === 'AuditLog')).toMatchObject({ action: 'log', deleted: 1, anonymised: 1 })
    expect(report.collections.find((l) => l.name === 'SubscriptionInvoice')).toMatchObject({ action: 'keep', kept: 2, deleted: 0 })
    expect(mem.db).toEqual(seed().docs)
    expect(mem.fileStore.size).toBe(2)
    expect(mem.tombstones).toEqual([])
    expect(purgeSummary(report)).toContain('dry run')
  })

  it('applied: hard-deletes tenant data, keeps invoices, keeps recent logs anonymised, deletes files and leaves a tombstone', async () => {
    const { docs, files } = seed()
    const mem = memoryStore(docs, files)
    const report = await purgeWorkspace(mem.store, TENANT_COLLECTIONS, A, { apply: true, now: NOW })
    expect(report.apply).toBe(true)
    for (const name of ['Task', 'Employee', 'Payslip', 'Lead', 'Invoice', 'Member', 'StoredFile', 'UsageEvent']) expect(rowsOf(mem.db, name, A)).toEqual([])
    expect(rowsOf(mem.db, 'SubscriptionInvoice', A)).toHaveLength(2)
    const audit = rowsOf(mem.db, 'AuditLog', A)
    expect(audit.map((d) => d._id)).toEqual(['AuditLog-a-new'])
    expect(audit[0]).toMatchObject({ actorName: 'Deleted workspace member', summary: '[removed]' })
    const messages = rowsOf(mem.db, 'Message', A)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ to: ['[removed]'], subject: '[removed]' })
    const billing = rowsOf(mem.db, 'BillingEvent', A)
    expect(billing).toHaveLength(2)
    expect(billing.every((d) => d.payload === undefined)).toBe(true)
    expect([...mem.fileStore.keys()]).toEqual([`${String(B)}/2027-01/2-offer.pdf`])
    expect(mem.tombstones).toEqual([String(A)])
  })

  it('never touches another workspace', async () => {
    const { docs, files } = seed()
    const mem = memoryStore(docs, files)
    const before = new Map([...docs].map(([k, v]) => [k, v.filter((d) => String(d.orgId) === String(B))]))
    await purgeWorkspace(mem.store, TENANT_COLLECTIONS, A, { apply: true, now: NOW })
    for (const c of TENANT_COLLECTIONS) expect(rowsOf(mem.db, c.name, B)).toEqual(before.get(c.name))
    expect(mem.fileStore.get(`${String(B)}/2027-01/2-offer.pdf`)).toBe('b')
    expect(mem.tombstones).not.toContain(String(B))
  })

  it('purges an owner-deleted workspace after 30 days and leaves one deleted 10 days ago alone (D4)', async () => {
    // Arrange: both owners deleted their workspace, A 31 days ago and B 10 days ago
    const { docs, files } = seed()
    const mem = memoryStore(docs, files)
    const orgs = [
      { _id: A, deletedAt: new Date(NOW.getTime() - 31 * DAY), subscription: { status: 'active', plan: 'suite', accountType: 'paid' } },
      { _id: B, deletedAt: new Date(NOW.getTime() - 10 * DAY), subscription: { status: 'active', plan: 'suite', accountType: 'paid' } },
    ]
    const before = new Map([...docs].map(([k, v]) => [k, v.filter((d) => String(d.orgId) === String(B))]))
    // Act: what the lifecycle job's owner-deleted pass does
    for (const org of orgs.filter((o) => ownerDeletionPurgeDue(o, NOW))) await purgeWorkspace(mem.store, TENANT_COLLECTIONS, org._id, { apply: true, now: NOW })
    // Assert
    expect(rowsOf(mem.db, 'Task', A)).toEqual([])
    expect(mem.tombstones).toEqual([String(A)])
    for (const c of TENANT_COLLECTIONS) expect(rowsOf(mem.db, c.name, B)).toEqual(before.get(c.name))
  })

  it('builds every filter with the workspace id', async () => {
    const filters: PurgeFilter[] = []
    const spy: PurgeStore = {
      count: async (_c, f) => (filters.push(f), 0),
      deleteMany: async (_c, f) => (filters.push(f), 0),
      anonymise: async (_c, f) => (filters.push(f), 0),
      filePaths: async () => [],
      deleteFile: async () => {},
      tombstone: async () => {},
    }
    await purgeWorkspace(spy, TENANT_COLLECTIONS, A, { apply: true, now: NOW })
    expect(filters.length).toBeGreaterThan(TENANT_COLLECTIONS.length)
    expect(filters.every((f) => String(f.orgId) === String(A))).toBe(true)
  })
})
