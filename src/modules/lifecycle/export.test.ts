import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { zipBuffer } from '@/lib/zip'
import { readZip } from '@/lib/zip-read'
import { cleanValue, exportEntries, flattenRow, rowsToCsv, type ExportSource } from './export'
import { TENANT_COLLECTIONS } from './registry'

const ORG = new Types.ObjectId()
const AT = new Date('2026-10-08T06:00:00Z')

function source(): ExportSource {
  const rows: Record<string, Record<string, unknown>[]> = {
    Task: [{ _id: new Types.ObjectId(), orgId: ORG, title: '=SUM(A1)', tags: ['urgent', 'q4'], createdAt: AT, __v: 0 }],
    Employee: [{ _id: new Types.ObjectId(), orgId: ORG, fullName: 'Asha Rao', bank: { ifsc: 'HDFC0001234', account: '1234' }, createdAt: AT }],
    Invite: [{ _id: new Types.ObjectId(), orgId: ORG, email: 'new@a.in', tokenHash: 'SECRET-HASH', createdAt: AT }],
    OtpChallenge: [{ _id: new Types.ObjectId(), orgId: ORG, codeHash: 'NEVER' }],
    SubscriptionInvoice: [{ _id: new Types.ObjectId(), orgId: ORG, number: 'FB/2026-27/0001', totalPaise: 117_800 }],
  }
  return {
    workspace: async () => ({ name: 'Acme', slug: 'acme', gstin: '23ABCDE1234F1Z5', createdAt: AT }),
    rows: async function* (c) {
      yield* rows[c.name] ?? []
    },
    files: async function* () {
      yield { id: 'f1', name: 'offer letter.pdf', data: Buffer.from('%PDF-1.4') }
      yield { skipped: 0 }
    },
  }
}

describe('workspace export', () => {
  it('has workspace.json, JSON and CSV per module, stored files and a README', async () => {
    const files = readZip(await zipBuffer(exportEntries(source(), TENANT_COLLECTIONS, { workspace: 'Acme', at: AT })))
    const names = [...files.keys()]
    expect(names[0]).toBe('workspace.json')
    expect(names).toEqual(expect.arrayContaining(['json/work/Task.json', 'csv/work/Task.csv', 'json/muster/Employee.json', 'csv/muster/Employee.csv', 'json/workspace/Invite.json', 'json/billing/SubscriptionInvoice.json', 'files/f1-offer_letter.pdf', 'README.txt']))
    expect(JSON.parse(files.get('workspace.json')!.toString())).toMatchObject({ name: 'Acme', gstin: '23ABCDE1234F1Z5' })
    const tasks = JSON.parse(files.get('json/work/Task.json')!.toString())
    expect(tasks[0]).toMatchObject({ title: '=SUM(A1)', tags: ['urgent', 'q4'], orgId: String(ORG), createdAt: AT.toISOString() })
    expect(tasks[0].__v).toBeUndefined()
    expect(files.get('files/f1-offer_letter.pdf')!.toString()).toBe('%PDF-1.4')
    expect(files.get('README.txt')!.toString()).toContain('muster/Employee: 1')
  })

  it('never includes secrets or one-time codes, and leaves out empty collections', async () => {
    const files = readZip(await zipBuffer(exportEntries(source(), TENANT_COLLECTIONS, { workspace: 'Acme', at: AT })))
    const all = [...files.values()].map((b) => b.toString()).join('\n')
    expect(all).not.toContain('SECRET-HASH')
    expect(all).not.toContain('NEVER')
    expect([...files.keys()].some((n) => n.includes('OtpChallenge') || n.includes('Counter'))).toBe(false)
    expect(files.has('json/work/Project.json')).toBe(false)
  })

  it('writes CSV with nested fields as dot paths, lists joined, and formulas defused', () => {
    expect(flattenRow({ a: { b: 1, c: { d: 'x' } }, tags: ['p', 'q'], items: [{ n: 1 }] })).toEqual({ 'a.b': 1, 'a.c.d': 'x', tags: 'p; q', items: '[{"n":1}]' })
    const csv = rowsToCsv([{ title: '=SUM(A1)', bank: { ifsc: 'HDFC0001234' } }])
    expect(csv).toContain('title,bank.ifsc')
    expect(csv).toContain("'=SUM(A1)")
  })

  it('cleans ids, dates and buffers', () => {
    const id = new Types.ObjectId()
    expect(cleanValue({ id, at: AT, data: Buffer.from('x'), passwordHash: 'h', nested: [{ apiSecret: 's', ok: 1 }] })).toEqual({ id: String(id), at: AT.toISOString(), nested: [{ ok: 1 }] })
  })
})
