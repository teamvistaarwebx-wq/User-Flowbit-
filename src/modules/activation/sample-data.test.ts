import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { SAMPLE_COLLECTIONS, buildSampleSet, describeCounts, discardSampleSet, hasSampleData, insertSampleSet, removalMessage, removeSampleSet, type SampleCollection, type SampleInput, type SampleWriter } from './sample-data'

const ALL = { work: true, orbit: true, folio: true, muster: true }
const input = (extra: Partial<SampleInput> = {}): SampleInput => ({
  today: '2026-10-09',
  memberId: new Types.ObjectId(),
  products: ALL,
  taskKeys: Array.from({ length: 15 }, (_, i) => `VW-${i + 1}`),
  entity: { id: new Types.ObjectId(), kind: 'gst', stateCode: '27' },
  ...extra,
})

type Row = Record<string, unknown> & { orgId: string }

/** One shared store for every workspace; each writer only sees its own org, like ctx.db. */
function fakeDb(used: Partial<Record<SampleCollection, (row: Row) => boolean>> = {}) {
  const rows = new Map<SampleCollection, Row[]>(SAMPLE_COLLECTIONS.map((c) => [c, []]))
  const mine = (c: SampleCollection, orgId: string) => rows.get(c)!.filter((r) => r.orgId === orgId && r.sample === true)
  const writer = (orgId: string): SampleWriter => ({
    sampleIds: async (c) => mine(c, orgId).map((r) => String(r._id)),
    inUse: async (c, ids) => new Set(mine(c, orgId).filter((r) => ids.includes(String(r._id)) && (used[c]?.(r) ?? false)).map((r) => String(r._id))),
    deleteIds: async (c, ids) => {
      const before = rows.get(c)!
      const after = before.filter((r) => !(r.orgId === orgId && r.sample === true && ids.includes(String(r._id))))
      rows.set(c, after)
      return before.length - after.length
    },
    adopt: async (c, ids) => {
      rows.set(c, rows.get(c)!.map((r) => (r.orgId === orgId && ids.includes(String(r._id)) ? { ...r, sample: undefined } : r)))
    },
    insertMany: async (c, docs) => {
      rows.set(c, [...rows.get(c)!, ...docs.map((d) => ({ _id: new Types.ObjectId(), ...d, orgId }))])
    },
    deleteSample: async (c) => {
      const before = rows.get(c)!
      const after = before.filter((r) => !(r.orgId === orgId && r.sample === true))
      rows.set(c, after)
      return before.length - after.length
    },
    countSample: async (c) => rows.get(c)!.filter((r) => r.orgId === orgId && r.sample === true).length,
  })
  return { rows, writer }
}

describe('sample agency data', () => {
  it('has the promised shape, every row marked sample', () => {
    const set = buildSampleSet(input())
    expect(Object.fromEntries(SAMPLE_COLLECTIONS.map((c) => [c, set[c].length]))).toEqual({ clients: 2, projects: 3, tasks: 15, leads: 5, invoices: 2, employees: 3 })
    expect(SAMPLE_COLLECTIONS.every((c) => set[c].every((d) => d.sample === true))).toBe(true)
  })

  it('links tasks to sample projects and invoices to sample clients, as drafts with GST', () => {
    const set = buildSampleSet(input())
    const projectIds = set.projects.map((p) => String(p._id))
    const clientIds = set.clients.map((c) => String(c._id))
    expect(set.tasks.every((t) => projectIds.includes(String(t.projectId)))).toBe(true)
    expect(set.tasks.map((t) => t.key)).toEqual(input().taskKeys)
    expect(set.invoices.every((i) => clientIds.includes(String(i.clientId)) && i.status === 'draft' && Number(i.totalPaise) > 0)).toBe(true)
  })

  it('leaves out products the workspace does not have, and invoices without a Folio business', () => {
    const set = buildSampleSet(input({ products: { work: true, orbit: false, folio: true, muster: false }, entity: null }))
    expect([set.leads.length, set.employees.length, set.invoices.length, set.tasks.length]).toEqual([0, 0, 0, 15])
  })

  it('removes only sample rows, and only in its own workspace', async () => {
    const { rows, writer } = fakeDb()
    const a = writer('org-a')
    const b = writer('org-b')
    await insertSampleSet(a, buildSampleSet(input()))
    await insertSampleSet(b, buildSampleSet(input()))
    await a.insertMany('tasks', [{ title: 'Real task', sample: undefined as unknown as true }])
    rows.set('clients', [...rows.get('clients')!, { orgId: 'org-a', name: 'Real client' }])

    const { removed } = await removeSampleSet(a)
    expect(removed).toMatchObject({ clients: 2, projects: 3, tasks: 15, leads: 5, invoices: 2, employees: 3 })
    expect(await hasSampleData(a)).toBe(false)
    expect(await hasSampleData(b)).toBe(true)
    expect(rows.get('tasks')!.filter((r) => r.orgId === 'org-a').map((r) => r.title)).toEqual(['Real task'])
    expect(rows.get('clients')!.filter((r) => r.orgId === 'org-a').map((r) => r.name)).toEqual(['Real client'])
    expect(await b.countSample('tasks')).toBe(15)
  })

  it('keeps sample rows the team has used, and reports them (R1 1.1)', async () => {
    const { rows, writer } = fakeDb({ invoices: (r) => r.status !== 'draft', employees: (r) => r.code === 'SMPL-001' })
    const a = writer('org-a')
    await insertSampleSet(a, buildSampleSet(input()))
    rows.set('invoices', rows.get('invoices')!.map((r, i) => (i === 0 ? { ...r, status: 'issued', number: 'INV-1' } : r)))

    const result = await removeSampleSet(a)
    expect(result.removed).toMatchObject({ invoices: 1, employees: 2, tasks: 15 })
    expect(result.kept).toMatchObject({ invoices: 1, employees: 1, tasks: 0 })
    expect(rows.get('invoices')!.map((r) => r.number)).toEqual(['INV-1'])
    expect(rows.get('employees')!.map((r) => [r.code, r.sample])).toEqual([['SMPL-001', undefined]])
    expect(await hasSampleData(a)).toBe(false)
    expect(removalMessage(result)).toMatch(/^Removed .*\. Kept 1 invoice and 1 employee because your team has used them/)
  })

  it('discards a half-finished load completely', async () => {
    const { writer } = fakeDb({ invoices: () => true })
    const a = writer('org-a')
    await insertSampleSet(a, buildSampleSet(input()))
    expect(await discardSampleSet(a)).toMatchObject({ invoices: 2 })
    expect(await hasSampleData(a)).toBe(false)
  })

  it('says when there was nothing to remove', () => {
    const zero = Object.fromEntries(SAMPLE_COLLECTIONS.map((c) => [c, 0])) as Record<SampleCollection, number>
    expect(removalMessage({ removed: zero, kept: zero })).toBe('There was no sample data to remove.')
  })

  it('describes what was loaded', () => {
    expect(describeCounts({ projects: 3, tasks: 15, clients: 2 })).toBe('2 clients, 3 projects and 15 tasks')
    expect(describeCounts({ invoices: 1 })).toBe('1 draft invoice')
    expect(describeCounts({})).toBe('nothing')
  })
})
