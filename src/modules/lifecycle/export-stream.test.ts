import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { zipBuffer, zipChunks } from '@/lib/zip'
import { readZip } from '@/lib/zip-read'
import { exportEntries, type ExportSource, type PartLimits } from './export'
import { TENANT_COLLECTIONS } from './registry'

const ORG = new Types.ObjectId()
const AT = new Date('2026-10-08T06:00:00Z')
const LIMITS: PartLimits = { rows: 1_000, bytes: 4 * 1024 * 1024 }
const TASKS = 25_000

/**
 * A large workspace whose rows are made one at a time, like a cursor. It
 * counts rows handed out, so the test can check that the export never holds
 * more than one part of them.
 */
function largeSource() {
  const state = { produced: 0 }
  const source: ExportSource = {
    workspace: async () => ({ name: 'Big Co' }),
    rows: async function* (c) {
      if (c.name === 'Task') {
        for (let i = 0; i < TASKS; i += 1) {
          state.produced += 1
          yield { _id: new Types.ObjectId(), orgId: ORG, title: `Task ${i}`, n: i, createdAt: AT }
        }
      }
      if (c.name === 'Message') {
        yield { _id: new Types.ObjectId(), orgId: ORG, subject: 'Invoice INV-1', status: 'delivered', html: '<p>'.padEnd(200_000, 'x'), text: 'body' }
      }
    },
    files: async function* () {
      yield { skipped: 0 }
    },
  }
  return { source, state }
}

describe('workspace export streaming (V2-REVIEW T3)', () => {
  it('writes a large collection in parts and never holds more than one part of rows', async () => {
    const { source, state } = largeSource()
    let written = 0
    let maxOutstanding = 0
    let maxEntryBytes = 0
    const names: string[] = []
    for await (const entry of exportEntries(source, TENANT_COLLECTIONS, { workspace: 'Big Co', at: AT }, LIMITS)) {
      names.push(entry.name)
      maxEntryBytes = Math.max(maxEntryBytes, Buffer.byteLength(entry.data))
      if (entry.name.startsWith('json/work/Task')) {
        written += JSON.parse(String(entry.data)).length
        maxOutstanding = Math.max(maxOutstanding, state.produced - written)
      }
    }
    expect(written).toBe(TASKS)
    // One part, plus the one row read ahead to know whether another part follows.
    expect(maxOutstanding).toBeLessThanOrEqual(1)
    expect(names.filter((n) => n.startsWith('json/work/Task'))).toHaveLength(TASKS / LIMITS.rows)
    expect(names).toContain('json/work/Task.part-001.json')
    expect(names).toContain('csv/work/Task.part-025.csv')
    expect(names).not.toContain('json/work/Task.json')
    expect(maxEntryBytes).toBeLessThan(LIMITS.bytes + 64 * 1024)
  })

  it('starts a new part when the bytes limit is reached before the row limit', async () => {
    const { source } = largeSource()
    const names: string[] = []
    for await (const entry of exportEntries(source, TENANT_COLLECTIONS, { workspace: 'Big Co', at: AT }, { rows: 100_000, bytes: 200_000 })) names.push(entry.name)
    expect(names.filter((n) => n.startsWith('json/work/Task')).length).toBeGreaterThan(5)
  })

  it('leaves message bodies out and keeps the log fields, with counts in the README', async () => {
    const { source } = largeSource()
    const files = readZip(await zipBuffer(exportEntries(source, TENANT_COLLECTIONS, { workspace: 'Big Co', at: AT }, LIMITS)))
    const messages = JSON.parse(files.get('json/messages/Message.json')!.toString())
    expect(messages[0]).toMatchObject({ subject: 'Invoice INV-1', status: 'delivered' })
    expect(messages[0].html).toBeUndefined()
    expect(messages[0].text).toBeUndefined()
    expect(files.get('README.txt')!.toString()).toContain(`work/Task: ${TASKS}`)
    const first = JSON.parse(files.get('json/work/Task.part-001.json')!.toString())
    expect(first[0]).toMatchObject({ title: 'Task 0', n: 0 })
    expect(JSON.parse(files.get('json/work/Task.part-025.json')!.toString()).at(-1)).toMatchObject({ n: TASKS - 1 })
  })

  it('streams the ZIP chunk by chunk as entries are produced', async () => {
    const { source, state } = largeSource()
    const chunks = zipChunks(exportEntries(source, TENANT_COLLECTIONS, { workspace: 'Big Co', at: AT }, LIMITS))
    // The first chunks go out long before every task has been read.
    for (let i = 0; i < 6; i += 1) await chunks.next()
    expect(state.produced).toBeLessThan(TASKS)
    await chunks.return(undefined)
  })
})
