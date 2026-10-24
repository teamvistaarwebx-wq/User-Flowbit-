/**
 * Seeds the local `flowbit` database with the demo workspace "Vistaar WebX".
 *
 *   npm run db:seed              # refuses if the demo org already exists
 *   npm run db:seed -- --reset   # drops the flowbit database first
 *
 * Demo data is for local development only: the seed refuses a database that
 * is not on this machine (Atlas), NODE_ENV=production, Vercel or a public
 * APP_URL, unless --force-demo is passed.
 *
 * Writes every login to seed-logins.local.md (git-ignored; seed-logins.<db>.local.md for any
 * database other than `flowbit`, so a second seed never overwrites the main file); never prints passwords.
 * Then runs src/modules/<module>/seed.ts for each product that has one (work, muster,
 * orbit, folio), then the core areas (settings, subscription, marketing) if present.
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Types } from 'mongoose'
import { EXTRA_PEOPLE, emailFor, loginsFilePath, loginsMarkdown, OWNER_EMAIL, OWNER_ROLE_LABEL, ROLE_PEOPLE, type SeedLogin } from './lib/seed-logins'

const ROOT = path.resolve(__dirname, '..')
const PRODUCTS = ['work', 'muster', 'orbit', 'folio'] as const
/** Non-product modules seeded after the products, each only when its seed.ts exists. */
const CORE_MODULES = ['settings', 'subscription', 'marketing'] as const
const ATTENDANCE_DAYS = 30

try {
  process.loadEnvFile(path.join(ROOT, '.env.local'))
} catch {
  // Fall back to the process environment (CI or an exported shell).
}

const log = (message: string) => process.stdout.write(`${message}\n`)

/** Deterministic PRNG so every reset produces the same demo data. */
function prng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = prng(20261001)
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1))

const strongPassword = () => `Fb-${randomBytes(12).toString('base64url')}-${between(10, 99)}`

const CLIENTS = [
  { name: 'Sharma Organics Pvt Ltd', state: 'MP', city: 'Indore', sector: 'D2C', email: 'accounts@sharmaorganics.in', gstin: '23AAKCS1234F1Z5', status: 'active' },
  { name: 'Nimbus Fintech LLP', state: 'KA', city: 'Bengaluru', sector: 'Fintech', email: 'finance@nimbusfin.in', gstin: '29AAOFN5678K1Z2', status: 'active' },
  { name: 'Coastal Spices Exports', state: 'KL', city: 'Kochi', sector: 'Exports', email: 'hello@coastalspices.in', gstin: '32AAHFC4321M1Z9', status: 'active' },
  { name: 'Urban Threads Retail', state: 'MH', city: 'Mumbai', sector: 'Fashion', email: 'ap@urbanthreads.in', gstin: '27AACCU8765Q1Z3', status: 'active' },
  { name: 'Greenleaf Schools Trust', state: 'MP', city: 'Bhopal', sector: 'Education', email: 'admin@greenleafschools.org', status: 'active' },
  { name: 'Himalaya Treks & Tours', state: 'UK', city: 'Dehradun', sector: 'Travel', email: 'bookings@himalayatreks.in', status: 'lead' },
  { name: 'Patel Auto Components', state: 'GJ', city: 'Rajkot', sector: 'Manufacturing', email: 'purchase@patelauto.in', gstin: '24AAFCP2468H1Z7', status: 'active' },
  { name: 'Dr. Ritu Saxena Clinic', state: 'DL', city: 'New Delhi', sector: 'Healthcare', email: 'ritu@saxenaclinic.in', status: 'inactive', kind: 'individual' },
] as const

async function main() {
  const reset = process.argv.includes('--reset')
  const { dbConnect, dbDisconnect, mongoose } = await import('../src/lib/db')
  const { isLocalMongoUri, isLocalUrl, serverEnv } = await import('../src/lib/env')
  // A second local demo database (for example a v2 preview) needs an explicit opt-in naming it.
  const seedDb = serverEnv().MONGODB_DB
  const allowedDbs = new Set(['flowbit', process.env.SEED_ALLOW_DB].filter(Boolean))
  if (!allowedDbs.has(seedDb)) throw new Error(`Refusing to seed database "${seedDb}". Set MONGODB_DB=flowbit, or SEED_ALLOW_DB=${seedDb} to allow it.`)
  const production = !isLocalMongoUri(serverEnv().MONGODB_URI) || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || !isLocalUrl(serverEnv().APP_URL)
  if (production && !process.argv.includes('--force-demo')) {
    throw new Error('Refusing to seed: this looks like a production database (not on this machine, or production settings). Demo data and --reset are for local development. Pass --force-demo only if you really mean it.')
  }

  const conn = await dbConnect()
  if (conn.connection.db?.databaseName !== seedDb) throw new Error('Connected to the wrong database; aborting.')

  // Models are imported only after the drop: importing them starts index builds.
  if (reset) {
    await conn.connection.db.dropDatabase()
    log('Dropped database "flowbit".')
  } else if (await conn.connection.db.collection('orgs').findOne({ slug: 'vistaar' })) {
    log('The demo workspace already exists. Run `npm run db:seed -- --reset` to start over.')
    await dbDisconnect()
    return
  }

  const models = await import('../src/models')
  const { Org, User, Member, Client, AttendanceDay } = models
  await Promise.all(Object.values(models).map((m) => m.init()))

  const { hashPassword } = await import('../src/lib/auth/password')
  const { createWorkspace } = await import('../src/lib/workspace')
  const { scoped } = await import('../src/lib/db/scoped')
  const { BUILTIN_ROLE_KEYS } = await import('../src/lib/permissions')
  const { computeDay, DEFAULT_OFFICE_HOURS } = await import('../src/lib/attendance-core')
  const { addDays, istInstant, todayIST, weekday } = await import('../src/lib/dates')

  const logins: SeedLogin[] = []
  const createUser = async (name: string, email: string, role: string) => {
    const password = strongPassword()
    const passwordHash = await hashPassword(password)
    const user = await User.create({ name, email, passwordHash })
    logins.push({ role, name, email, password })
    return { ...user.toObject(), passwordHash }
  }

  // Owner + workspace (15-day trial of every product; marked Test below).
  const owner = await createUser(ROLE_PEOPLE.owner.name, OWNER_EMAIL, OWNER_ROLE_LABEL)
  const { Staff } = await import('../src/models/console/Staff')
  await Staff.create({ email: OWNER_EMAIL, name: ROLE_PEOPLE.owner.name, role: 'admin', isFounder: true, passwordHash: owner.passwordHash, userId: owner._id })
  const { org, member: ownerMember } = await createWorkspace(owner._id, { name: 'Vistaar WebX', slug: 'vistaar', teamSize: '11-50', mode: 'project' })
  await Org.updateOne(
    { _id: org._id },
    // The demo workspace is Test / Demo (console spec 4.1): never billed, left out of platform metrics.
    { $set: { address: { line1: '2nd Floor, Sapphire Tower', line2: 'Vijay Nagar', city: 'Indore', state: 'MP', pincode: '452010', country: 'India' }, gstin: '23ABCFV1234K1Z6', state: 'MP', 'subscription.accountType': 'test' } },
  )
  await Member.updateOne({ _id: ownerMember._id }, { $set: { title: ROLE_PEOPLE.owner.title, department: ROLE_PEOPLE.owner.department } })
  log(`Workspace "${org.name}" (${org.slug}) for ${OWNER_EMAIL}`)

  const users = { owner } as unknown as Record<(typeof BUILTIN_ROLE_KEYS)[number], { _id: Types.ObjectId; name: string; email: string }>
  const members = { owner: { ...ownerMember, title: ROLE_PEOPLE.owner.title, department: ROLE_PEOPLE.owner.department } } as Record<string, { _id: Types.ObjectId; orgId: Types.ObjectId; userId: Types.ObjectId; role: string; title?: string | null; department?: string | null }>
  const manager = { id: null as Types.ObjectId | null }

  for (const role of BUILTIN_ROLE_KEYS.filter((r) => r !== 'owner')) {
    const person = ROLE_PEOPLE[role]
    const user = await createUser(person.name, person.email, role)
    const member = (await Member.create({ orgId: org._id, userId: user._id, role, status: 'active', title: person.title, department: person.department, managerId: role === 'member' ? manager.id ?? undefined : ownerMember._id, joinedAt: new Date(Date.now() - between(60, 700) * 86_400_000) })).toObject()
    if (role === 'manager') manager.id = member._id
    users[role] = user
    members[role] = member
  }

  const allMembers = [...Object.values(members)]
  for (const person of EXTRA_PEOPLE) {
    const user = await createUser(person.name, emailFor(person.name), 'member (demo)')
    const member = (await Member.create({ orgId: org._id, userId: user._id, role: 'member', status: 'active', title: person.title, department: person.department, managerId: manager.id ?? undefined, joinedAt: new Date(Date.now() - between(30, 900) * 86_400_000) })).toObject()
    allMembers.push(member)
  }
  log(`Members: ${allMembers.length} (one per built-in role plus ${EXTRA_PEOPLE.length} demo people)`)

  const db = <M extends Parameters<typeof scoped>[0]>(model: M) => scoped(model, org._id)

  // Core clients.
  await db(Client).insertMany(
    CLIENTS.map((c, i) => ({
      name: c.name,
      kind: 'kind' in c ? c.kind : 'company',
      email: c.email,
      phone: `+91 9${String(800000000 + i * 7919).slice(0, 9)}`,
      gstin: 'gstin' in c ? c.gstin : undefined,
      state: c.state,
      billingAddress: { line1: `${between(10, 400)}, Business Park`, city: c.city, state: c.state, pincode: String(between(110001, 682999)), country: 'India' },
      contacts: [{ name: ['Amit', 'Sunita', 'Farhan', 'Lakshmi', 'Gaurav', 'Deepa', 'Harsh', 'Ritu'][i], email: c.email, phone: `+91 98${between(10000000, 99999999)}`, role: 'Accounts', primary: true }],
      ownerId: members.sales._id,
      tags: [c.sector],
      sector: c.sector,
      source: ['Referral', 'Website', 'LinkedIn', 'Event'][i % 4],
      status: c.status,
    })),
  )
  log(`Clients: ${CLIENTS.length}`)

  // Attendance for the last 30 days (Sundays off).
  const today = todayIST()
  const days = Array.from({ length: ATTENDANCE_DAYS }, (_, i) => addDays(today, -(ATTENDANCE_DAYS - i)))
  const rows = allMembers.flatMap((m) =>
    days.map((date) => {
      if (weekday(date) === 0) return { memberId: m._id, date, status: 'weekoff' as const, punches: [], workedMinutes: 0, breakMinutes: 0 }
      const roll = rand()
      if (roll < 0.05) return { memberId: m._id, date, status: 'absent' as const, punches: [], workedMinutes: 0, breakMinutes: 0 }
      if (roll < 0.08) return { memberId: m._id, date, status: 'leave' as const, punches: [], workedMinutes: 0, breakMinutes: 0 }
      const late = roll > 0.88
      const half = roll > 0.08 && roll < 0.11
      const t = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const inAt = late ? t(10, between(20, 59)) : t(9, between(40, 59))
      const punches = [
        { type: 'in' as const, at: istInstant(date, inAt), source: 'web' as const },
        ...(half ? [] : [{ type: 'break_start' as const, at: istInstant(date, t(13, between(0, 15))), source: 'web' as const }, { type: 'break_end' as const, at: istInstant(date, t(13, between(40, 55))), source: 'web' as const }]),
        { type: 'out' as const, at: istInstant(date, half ? t(14, between(0, 20)) : t(19, between(0, 40))), source: 'web' as const },
      ]
      const r = computeDay({ punches }, DEFAULT_OFFICE_HOURS)
      return { memberId: m._id, date, status: r.status, punches, workedMinutes: r.workedMinutes, breakMinutes: r.breakMinutes, firstIn: r.firstIn ?? undefined, lastOut: r.lastOut ?? undefined }
    }),
  )
  await db(AttendanceDay).insertMany(rows)
  log(`Attendance days: ${rows.length}`)

  const loginsFile = await writeLogins(seedDb, logins)
  log(`Logins written to ${path.relative(ROOT, loginsFile)} (passwords are not printed).`)

  const seedCtx = { orgId: org._id, org: { _id: org._id, name: org.name, slug: org.slug, officeHours: org.officeHours, workWeek: org.workWeek }, users, members, allMembers, db, log: (m: string) => log(`  ${m}`) }
  for (const name of [...PRODUCTS, ...CORE_MODULES]) {
    const file = path.join(ROOT, 'src', 'modules', name, 'seed.ts')
    if (!existsSync(file)) {
      log(`Skipped ${name}: no src/modules/${name}/seed.ts yet.`)
      continue
    }
    const mod = (await import(pathToFileURL(file).href)) as { seed?: (ctx: typeof seedCtx) => Promise<void> }
    if (typeof mod?.seed !== 'function') {
      log(`Skipped ${name}: seed.ts has no exported seed().`)
      continue
    }
    log(`Seeding ${name}…`)
    await mod.seed(seedCtx)
  }

  await mongoose.disconnect()
  log('Done.')
}

async function writeLogins(db: string, logins: readonly SeedLogin[]): Promise<string> {
  const file = loginsFilePath(ROOT, db)
  const generated = `Generated ${new Date().toISOString()} by \`npm run db:seed -- --reset\` (database \`${db}\`).`
  await writeFile(file, loginsMarkdown(logins, { generated, appUrl: process.env.APP_URL }), { mode: 0o600 })
  await chmod(file, 0o600)
  return file
}

main().catch(async (error) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
})
