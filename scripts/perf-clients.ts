/**
 * Times the Clients page queries against a local dev database (never the demo DB).
 *
 *   MONGODB_DB=flowbit_v2dev npx tsx scripts/perf-clients.ts [--bulk 2000] [--runs 5]
 *
 * --bulk N adds N synthetic clients (with deals, activities, invoices, projects and time) to the
 * first workspace so slow paths show up; the seed alone has a handful of clients.
 * `server-only` resolves to its empty build here, so the app's server modules load outside Next.
 */
import Module from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { Types } from 'mongoose'
import { argValue } from './lib/env-file'

const ROOT = path.resolve(__dirname, '..')
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'))
} catch {
  // The shell environment is enough.
}

// App modules are imported dynamically below, after this hook is in place.
type Resolver = (request: string, ...rest: unknown[]) => string
const moduleWithResolver = Module as unknown as { _resolveFilename: Resolver }
const originalResolve = moduleWithResolver._resolveFilename
const emptyServerOnly = path.join(path.dirname(require.resolve('server-only')), 'empty.js')
moduleWithResolver._resolveFilename = function resolveServerOnly(this: unknown, request: string, ...rest: unknown[]) {
  return request === 'server-only' ? emptyServerOnly : originalResolve.call(this, request, ...rest)
}

const DEMO_DB = 'flowbit'
const DEFAULT_RUNS = 5
const QUERIES: Record<string, Record<string, string>> = {
  'default (name A–Z)': {},
  'sort recent': { sort: 'recent' },
  'sort outstanding': { sort: 'outstanding' },
  'sort pipeline': { sort: 'pipeline' },
  'search "a"': { q: 'a' },
  'health at risk': { health: 'at_risk' },
  'new 90 days': { new: '90' },
}

const log = (message: string) => process.stdout.write(`${message}\n`)

async function bulkInsert(orgId: Types.ObjectId, ownerMemberId: Types.ObjectId, count: number) {
  const { mongoose } = await import('../src/lib/db')
  const db = mongoose.connection.db!
  const now = new Date()
  const clients = Array.from({ length: count }, (_, i) => ({
    _id: new Types.ObjectId(),
    orgId,
    name: `Perf Client ${String(i).padStart(5, '0')}`,
    kind: 'company',
    status: i % 7 === 0 ? 'lead' : 'active',
    tags: [i % 3 ? 'retail' : 'b2b'],
    contacts: [],
    ownerId: ownerMemberId,
    createdAt: new Date(now.getTime() - (i % 400) * 86_400_000),
    updatedAt: now,
  }))
  await db.collection('clients').insertMany(clients)
  const ids = clients.map((c) => c._id)
  const pick = (i: number) => ids[i % ids.length]
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10)
  await db.collection('deals').insertMany(Array.from({ length: count * 2 }, (_, i) => ({ orgId, title: `Perf deal ${i}`, clientId: pick(i), status: 'open', stage: 'qualified', valuePaise: 100_000 * (i % 50), ownerId: ownerMemberId, createdAt: now, updatedAt: now })))
  await db.collection('activities').insertMany(Array.from({ length: count * 10 }, (_, i) => ({ orgId, clientId: pick(i), type: 'call', status: 'done', subject: 'Perf', occurredAt: new Date(now.getTime() - (i % 120) * 86_400_000), ownerId: ownerMemberId, createdAt: now, updatedAt: now })))
  await db.collection('invoices').insertMany(Array.from({ length: count * 4 }, (_, i) => ({ orgId, clientId: pick(i), status: i % 3 ? 'paid' : 'issued', billingType: 'one_time', issueDate: iso(i % 300), dueDate: iso((i % 300) - 15), totalPaise: 1_180_000, taxablePaise: 1_000_000, balancePaise: i % 3 ? 0 : 1_180_000, createdAt: now, updatedAt: now })))
  log(`bulk: ${count} clients, ${count * 2} deals, ${count * 10} activities, ${count * 4} invoices`)
}

async function main() {
  const dbName = process.env.MONGODB_DB
  if (!dbName || dbName === DEMO_DB) throw new Error('Set MONGODB_DB to a dev database (e.g. flowbit_v2dev); the demo DB is never touched.')
  const { dbConnect } = await import('../src/lib/db')
  await dbConnect()
  const { Org } = await import('../src/models/Org')
  const { Member } = await import('../src/models/Member')
  const { memberCtxFor } = await import('../src/modules/briefs/send')
  const { listClients, parseClientQuery, clientTags } = await import('../src/modules/clients/queries')
  const { orbitPeople } = await import('../src/modules/orbit/people')
  const org = await Org.findOne({}).sort({ createdAt: 1 }).lean()
  if (!org) throw new Error('No workspace: seed the dev DB first.')
  const owner = await Member.findOne({ orgId: org._id, role: 'owner', status: 'active' }).lean()
  if (!owner) throw new Error('No active owner.')
  const bulk = Number(argValue('bulk') ?? 0)
  if (bulk > 0) await bulkInsert(org._id, owner._id, bulk)
  const ctx = await memberCtxFor(org._id, owner.userId)
  if (!ctx) throw new Error('Could not build the owner context.')
  const runs = Number(argValue('runs') ?? DEFAULT_RUNS)
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const time = async (label: string, fn: () => Promise<unknown>) => {
    await fn() // warm-up: connection, models, indexes
    const ms: number[] = []
    for (let i = 0; i < runs; i += 1) {
      const t = performance.now()
      await fn()
      ms.push(performance.now() - t)
    }
    const sorted = [...ms].sort((a, b) => a - b)
    log(`${label.padEnd(28)} median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms   max ${sorted[sorted.length - 1].toFixed(1)} ms`)
  }
  for (const [label, sp] of Object.entries(QUERIES)) await time(`listClients ${label}`, () => listClients(ctx, parseClientQuery(sp), today))
  await time('orbitPeople', () => orbitPeople(ctx))
  await time('clientTags', () => clientTags(ctx))
  const { clientDashboard } = await import('../src/modules/clients/dashboard')
  await time('clientDashboard', () => clientDashboard(ctx, today))
  const { mongoose } = await import('../src/lib/db')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
