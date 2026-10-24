import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GLOBAL_MODELS, TENANT_COLLECTIONS } from './registry'

/** Every model name defined under src/models (defineModel('Name', …)). */
function modelNames(dir = path.join(process.cwd(), 'src/models')): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return modelNames(full)
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) return []
    return [...readFileSync(full, 'utf8').matchAll(/defineModel\('([A-Za-z]+)'/g)].map((m) => m[1])
  })
}

describe('lifecycle registry', () => {
  it('lists every model, so export and deletion never miss a collection', () => {
    const listed = new Set([...TENANT_COLLECTIONS.map((c) => c.name), ...GLOBAL_MODELS])
    const missing = modelNames().filter((name) => !listed.has(name))
    expect(missing).toEqual([])
  })

  it('every tenant collection has an orgId path and is listed once', () => {
    for (const c of TENANT_COLLECTIONS) expect(c.model.schema.path('orgId'), c.name).toBeTruthy()
    expect(new Set(TENANT_COLLECTIONS.map((c) => c.name)).size).toBe(TENANT_COLLECTIONS.length)
  })

  it("keeps only Flowbit's invoices and credit notes as they are, and anonymises the logs it keeps", () => {
    expect(TENANT_COLLECTIONS.filter((c) => c.purge === 'keep').map((c) => c.name)).toEqual(['SubscriptionInvoice', 'FlowbitCreditNote'])
    for (const c of TENANT_COLLECTIONS.filter((x) => x.purge === 'log' || x.purge === 'anonymise')) expect(c.anonymise, c.name).toBeDefined()
    expect(TENANT_COLLECTIONS.filter((c) => c.purge === 'log').map((c) => c.name).sort()).toEqual(['AuditLog', 'Message'])
  })
})
