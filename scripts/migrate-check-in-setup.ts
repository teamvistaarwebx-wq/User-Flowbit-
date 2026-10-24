/**
 * Brings two things from the old Work app (VistaarOS, database vistaarTask) into one Flowbit workspace, and
 * nothing else (decisions: .plan/migration/decisions.md item 5; rules: scripts/lib/old-check-in-setup.ts):
 *   1. work mode: people marked remote in old Work `employees` → Flowbit Employee.workMode = 'remote'
 *      (matched by work email; office or blank stays unset, which Flowbit reads as office);
 *   2. office locations: old Work `orgs.settings.officeLocations` → the workspace's attendanceGeo.offices.
 * Past check-in locations are not migrated. Old data is only read, never changed.
 *
 *   npx tsx scripts/migrate-check-in-setup.ts --db=flowbit                     # dry run: lists workspaces
 *   npx tsx scripts/migrate-check-in-setup.ts --db=flowbit --org=vistaar       # dry run for one workspace
 *   npx tsx scripts/migrate-check-in-setup.ts --db=flowbit --org=vistaar --apply   # write
 *   ... --replace-office=Bhopal     # swap a hand-made office for the old one nearest to it (old address, pin, circles)
 *
 * Old database: OLD_WORK_MONGODB_URI when set, else the same cluster as MONGODB_URI with --old-db (default
 * vistaarTask). Refuses to run without --env-file or --db (never falls back to .env.local on its own).
 * The console shows counts and masked emails; the full match list goes to .plan/migration/check-in-setup-run.md
 * (git-ignored). Safe to run again: people already remote and offices already brought over are left alone.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { argValue, describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'
import type { Document } from 'mongodb'
import { officesFromOld, type OldOfficeLocation } from './lib/old-check-in-setup'

const OUT = path.resolve(__dirname, '..', '.plan', 'migration', 'check-in-setup-run.md')

type Doc = Document

/** "a***@vistaar.in": enough to recognise someone in the console without printing their address. */
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2')
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const out = (line = '') => process.stdout.write(`${line}\n`)

async function main() {
  out(loadScriptTarget('migrate-check-in-setup'))
  const apply = hasFlag('apply')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'
  const oldUri = process.env.OLD_WORK_MONGODB_URI || uri
  const oldDbName = argValue('old-db')?.trim() || 'vistaarTask'

  const mongoose = (await import('mongoose')).default
  const { cleanOffices, haversineMetres, MAX_OFFICES } = await import('../src/lib/geo')
  const { workModeIn } = await import('../src/modules/muster/import/employees')
  const target = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 15_000 }).asPromise()
  const source = await mongoose.createConnection(oldUri, { dbName: oldDbName, serverSelectionTimeoutMS: 15_000 }).asPromise()
  out(`${apply ? 'WRITING to' : 'Dry run (nothing is written) on'} ${describeMongo(uri)} / ${dbName}`)
  out(`Reading old Work data from ${describeMongo(oldUri)} / ${oldDbName}${process.env.OLD_WORK_MONGODB_URI ? ' (OLD_WORK_MONGODB_URI)' : ' (same cluster)'}`)
  out()

  // --- Which Flowbit workspace -------------------------------------------------------------------------------
  const orgs = target.collection('orgs')
  const slug = argValue('org')?.trim()
  if (!slug) {
    const all = await orgs.find({ deletedAt: null }, { projection: { slug: 1, name: 1 } }).toArray()
    out('Workspaces in this database (pass one with --org=<slug>):')
    for (const o of all) out(`  ${str(o.slug)}  ·  ${str(o.name)}  ·  ${await target.collection('employees').countDocuments({ orgId: o._id, deletedAt: null })} employee records`)
    await Promise.all([target.close(), source.close()])
    return
  }
  const org = await orgs.findOne({ slug, deletedAt: null })
  if (!org) throw new Error(`No workspace with slug "${slug}" in ${dbName}.`)
  out(`Workspace: ${str(org.name)} (${slug})`)

  // --- Old Work data -----------------------------------------------------------------------------------------
  const [oldOrgs, oldEmployees, oldUsers] = await Promise.all([
    source.collection('orgs').find({}).toArray(),
    source.collection('employees').find({}).toArray(),
    source.collection('users').find({}, { projection: { email: 1, name: 1, isActive: 1 } }).toArray(),
  ])
  if (!oldEmployees.length && !oldOrgs.length) throw new Error(`${oldDbName} has no employees or orgs: is this the old Work database?`)
  const userById = new Map(oldUsers.map((u) => [String(u._id), u]))

  // --- Flowbit employees, matched by work email, else by their linked login's email --------------------------
  const employees = await target.collection('employees').find({ orgId: org._id, deletedAt: null }, { projection: { fullName: 1, code: 1, workEmailLower: 1, workMode: 1, status: 1, memberId: 1 } }).toArray()
  const byWorkEmail = new Map(employees.map((e) => [lower(e.workEmailLower), e]))
  const members = await target.collection('members').find({ orgId: org._id, employeeId: { $ne: null } }, { projection: { userId: 1, employeeId: 1 } }).toArray()
  const loginUsers = await target.collection('users').find({ _id: { $in: members.map((m) => m.userId) } }, { projection: { email: 1 } }).toArray()
  const loginEmail = new Map(loginUsers.map((u) => [String(u._id), lower(u.email)]))
  const employeeById = new Map(employees.map((e) => [String(e._id), e]))
  const byLoginEmail = new Map(members.flatMap((m) => {
    const email = loginEmail.get(String(m.userId))
    const employee = employeeById.get(String(m.employeeId))
    return email && employee ? [[email, employee] as const] : []
  }))

  type Row = { name: string; email: string; oldMode: string; oldStatus: string; match: string; flowbit: Doc | null }
  const rows: Row[] = oldEmployees.map((e) => {
    const user = userById.get(String(e.userId))
    const email = lower(user?.email)
    const flowbit = (email && (byWorkEmail.get(email) ?? byLoginEmail.get(email))) || null
    return {
      name: str(user?.name) || '(no Work login)',
      email,
      oldMode: str(e.workMode) || '(blank)',
      oldStatus: str(e.status) || '(none)',
      match: !email ? 'no Work login email' : flowbit ? (byWorkEmail.has(email) ? 'work email' : 'login email') : 'no Flowbit employee',
      flowbit,
    }
  })
  const matched = rows.filter((r) => r.flowbit)
  const matchedIds = new Set(matched.map((r) => String(r.flowbit!._id)))
  const flowbitOnly = employees.filter((e) => !matchedIds.has(String(e._id)))
  const isRemote = (r: Row) => workModeIn(r.oldMode === '(blank)' ? '' : r.oldMode) === 'remote'
  const unknownModes = rows.filter((r) => r.oldMode !== '(blank)' && workModeIn(r.oldMode) === null)
  const toRemote = matched.filter((r) => isRemote(r) && r.flowbit!.workMode !== 'remote')
  const alreadyRemote = matched.filter((r) => isRemote(r) && r.flowbit!.workMode === 'remote')
  const remoteUnmatched = rows.filter((r) => isRemote(r) && !r.flowbit)
  const flowbitRemoteOldOffice = matched.filter((r) => !isRemote(r) && r.flowbit!.workMode === 'remote')
  const modeCounts = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.oldMode.toLowerCase()]: (acc[r.oldMode.toLowerCase()] ?? 0) + 1 }), {})

  out()
  out('1. WORK MODE')
  out(`   Old Work employees: ${rows.length}  (work mode: ${Object.entries(modeCounts).map(([k, n]) => `${k} ${n}`).join(', ')})`)
  out(`   Flowbit employees in ${slug}: ${employees.length}`)
  out(`   Matched: ${matched.length}  (by work email ${matched.filter((r) => r.match === 'work email').length}, by login email ${matched.filter((r) => r.match === 'login email').length})`)
  out(`   Old, not found in Flowbit: ${rows.length - matched.length}${rows.length - matched.length ? `  → ${rows.filter((r) => !r.flowbit).map((r) => (r.email ? mask(r.email) : r.name)).join(', ')}` : ''}`)
  out(`   In Flowbit, not in old Work: ${flowbitOnly.length}`)
  out(`   Remote in old Work: ${rows.filter(isRemote).length}  → will be set remote: ${toRemote.length}, already remote: ${alreadyRemote.length}, cannot match: ${remoteUnmatched.length}`)
  if (unknownModes.length) out(`   Unknown work modes (left as office): ${unknownModes.map((r) => `"${r.oldMode}"`).join(', ')}`)
  if (flowbitRemoteOldOffice.length) out(`   Remote in Flowbit but office in old Work (left as they are): ${flowbitRemoteOldOffice.length}`)

  // --- Offices -----------------------------------------------------------------------------------------------
  const oldLocations = oldOrgs.flatMap((o) => ((o.settings as { officeLocations?: OldOfficeLocation[] } | undefined)?.officeLocations ?? []))
  const { offices: oldOffices, report: officeReport } = officesFromOld(oldLocations)
  const current = cleanOffices((org.attendanceGeo as { offices?: [] } | undefined)?.offices ?? [])
  // --replace-office=<name or id>: a Flowbit office set up by hand for the same building is swapped for the old
  // office nearest to it (old address, pin and circles), in its place in the list.
  const replaceKey = argValue('replace-office')?.trim().toLowerCase()
  const replaced = replaceKey ? current.find((c) => c.id.toLowerCase() === replaceKey || c.name.toLowerCase() === replaceKey) : undefined
  if (replaceKey && !replaced) out(`   ! No Flowbit office named "${replaceKey}" to replace (already replaced?): nothing replaced.`)
  const replacement = replaced && oldOffices.length ? oldOffices.reduce((a, b) => (haversineMetres(replaced, b) < haversineMetres(replaced, a) ? b : a)) : undefined
  const others = current.filter((c) => c !== replaced)
  const plan = oldOffices.map((o) => {
    if (o === replacement && !others.some((c) => c.id === o.id)) return { office: o, add: false, action: `replaces "${replaced!.name}" (${Math.round(haversineMetres(replaced!, o))} m apart)` }
    const sameId = others.find((c) => c.id === o.id)
    const sameName = others.find((c) => c.name.toLowerCase() === o.name.toLowerCase())
    const near = others.find((c) => haversineMetres(c, o) <= 50)
    const action = sameId ? 'already brought over (same id): left alone' : sameName ? `an office named "${sameName.name}" exists: left alone` : near ? `"${near.name}" is within 50 m: left alone` : 'will be added'
    return { office: o, add: !sameId && !sameName && !near, action }
  })
  const swap = plan.some((p) => p.office === replacement && p.action.startsWith('replaces')) ? replacement : undefined
  const adding = plan.filter((p) => p.add).map((p) => p.office)
  const room = MAX_OFFICES - current.length
  out()
  out('2. OFFICE LOCATIONS')
  out(`   Old Work offices: ${oldLocations.length} (usable ${oldOffices.length})   ·   Flowbit offices now: ${current.length}`)
  for (const c of current) {
    const nearest = oldOffices.length ? Math.min(...oldOffices.map((o) => haversineMetres(c, o))) : null
    out(`   = In Flowbit: ${c.name}: ${c.address ?? 'no address'} · ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)} · phone ${c.radiusM} m, laptop ${c.laptopRadiusM} m · ${c.active ? 'active' : 'paused'}${nearest === null ? '' : ` · ${nearest >= 1000 ? `${(nearest / 1000).toFixed(1)} km` : `${Math.round(nearest)} m`} from the old office`}`)
  }
  for (const p of plan) out(`   - ${p.office.name}: ${p.office.address ?? 'no address'} · ${p.office.lat.toFixed(6)}, ${p.office.lng.toFixed(6)} · phone ${p.office.radiusM} m, laptop ${p.office.laptopRadiusM} m · ${p.office.active ? 'active' : 'paused'} → ${p.action}`)
  for (const line of officeReport) out(`   ! ${line}`)
  if (adding.length > room) out(`   ! Only ${room} more offices fit (limit ${MAX_OFFICES}); the rest are skipped.`)
  const mode = str((org.attendanceGeo as { mode?: string } | undefined)?.mode) || 'off'
  out(`   Flowbit "Ask for location" is ${mode}${mode === 'off' ? ': offices have no effect until HR sets Optional or Required' : ''}.`)

  // --- Full report (git-ignored) -----------------------------------------------------------------------------
  mkdirSync(path.dirname(OUT), { recursive: true })
  const table = (list: Row[]) => list.map((r) => `| ${r.name} | ${r.email || '—'} | ${r.oldMode} | ${r.oldStatus} | ${r.match} | ${r.flowbit ? `${str(r.flowbit.fullName)} (${str(r.flowbit.code)}), ${str(r.flowbit.workMode) || 'office'}` : '—'} |`).join('\n')
  writeFileSync(
    OUT,
    [
      `# Check-in setup migration: ${apply ? 'applied' : 'dry run'} ${new Date().toISOString()}`,
      `Flowbit ${dbName} / ${slug} ← old ${oldDbName}. Contains names and emails: keep it out of git (.plan is ignored).`,
      '',
      '## Work mode: every old Work employee',
      '| Old name | Email | Old work mode | Old status | Matched by | Flowbit employee, current mode |',
      '|---|---|---|---|---|---|',
      table(rows),
      '',
      `## Will be set remote (${toRemote.length})`,
      toRemote.map((r) => `- ${str(r.flowbit!.fullName)} (${str(r.flowbit!.code)})`).join('\n') || '- none',
      '',
      `## Flowbit employees not in old Work (${flowbitOnly.length}), left as they are`,
      flowbitOnly.map((e) => `- ${str(e.fullName)} (${str(e.code)}), ${lower(e.workEmailLower)}, ${str(e.workMode) || 'office'}`).join('\n') || '- none',
      '',
      '## Offices',
      plan.map((p) => `- ${p.office.name} → ${p.action}`).join('\n') || '- none in old Work',
      ...officeReport.map((l) => `- ! ${l}`),
      '',
    ].join('\n'),
  )
  out()
  out(`Full list with names: ${path.relative(process.cwd(), OUT)}`)

  // --- Write -------------------------------------------------------------------------------------------------
  if (!apply) {
    out('Nothing written. Check the list, then run again with --apply.')
  } else {
    const ids = toRemote.map((r) => r.flowbit!._id)
    const set = ids.length ? await target.collection('employees').updateMany({ _id: { $in: ids }, orgId: org._id, workMode: { $ne: 'remote' } }, { $set: { workMode: 'remote', updatedAt: new Date() } }) : { modifiedCount: 0 }
    const added = adding.slice(0, Math.max(0, room))
    const next = [...current.map((c) => (swap && c === replaced ? swap : c)), ...added]
    if (added.length || swap) await target.collection('orgs').updateOne({ _id: org._id }, { $set: { 'attendanceGeo.offices': next } })
    out(`Written: ${set.modifiedCount} employees set remote, ${swap ? `"${replaced!.name}" replaced by "${swap.name}", ` : ''}${added.length} offices added.`)
    out(`Offices now: ${next.map((o) => o.name).join(', ') || 'none'}`)
  }
  await Promise.all([target.close(), source.close()])
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
