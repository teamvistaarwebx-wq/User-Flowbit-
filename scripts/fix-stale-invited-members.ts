/**
 * Removes stale "invited" member rows: pending rows whose placeholder account no longer exists, for a person who
 * has since joined the same workspace through another row (the duplicate invite acceptance used to make, fixed in
 * lib/auth/invites claimInvitedRow). The joined row is kept; an employee link on the stale row moves to it when it
 * has none, and invites naming the stale row are pointed at it. Pending rows of people who never joined are only
 * reported: accepting their invite now takes the row over.
 *
 *   npx tsx scripts/fix-stale-invited-members.ts --db=flowbit                    # dry run: what would change
 *   npx tsx scripts/fix-stale-invited-members.ts --db=flowbit --apply            # write
 *   npx tsx scripts/fix-stale-invited-members.ts --env-file=.env.setup.local     # another database
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local on its own). Safe to run again.
 */
import type { Document } from 'mongodb'
import { describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'

const out = (line = '') => process.stdout.write(`${line}\n`)
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1***$2')

async function main() {
  out(loadScriptTarget('fix-stale-invited-members'))
  const apply = hasFlag('apply')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'
  const mongoose = (await import('mongoose')).default
  const conn = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 15_000 }).asPromise()
  out(`${apply ? 'WRITING to' : 'Dry run (nothing is written) on'} ${describeMongo(uri)} / ${dbName}`)
  const members = conn.collection<Document>('members')
  const users = conn.collection<Document>('users')
  const invites = conn.collection<Document>('invites')
  const employees = conn.collection<Document>('employees')
  const orgs = conn.collection<Document>('orgs')

  const pending = await members.find({ status: 'invited' }, { projection: { orgId: 1, userId: 1, employeeId: 1 } }).toArray()
  const present = new Set((await users.find({ _id: { $in: pending.map((m) => m.userId) } }, { projection: { _id: 1 } }).toArray()).map((u) => String(u._id)))
  const stale = pending.filter((m) => !present.has(String(m.userId)))
  out(`Pending member rows: ${pending.length}; pointing to an account that no longer exists: ${stale.length}`)

  let fixed = 0
  for (const row of stale) {
    const org = await orgs.findOne({ _id: row.orgId }, { projection: { slug: 1 } })
    const invite = await invites.findOne({ memberId: row._id }, { sort: { createdAt: -1 }, projection: { email: 1, acceptedAt: 1 } })
    const email = typeof invite?.email === 'string' ? invite.email : ''
    const where = `${org?.slug ?? String(row.orgId)} · ${email ? mask(email) : 'no invite email'} · row ${String(row._id)}`
    const account = email ? await users.findOne({ email }, { projection: { _id: 1 } }) : null
    const joined = account ? await members.findOne({ orgId: row.orgId, userId: account._id }, { projection: { status: 1, employeeId: 1 } }) : null
    if (!joined) {
      out(`  - ${where}: the person has not joined; left as it is (accepting the invite now takes this row over).`)
      continue
    }
    const moveLink = Boolean(row.employeeId && !joined.employeeId)
    out(`  - ${where}: joined as row ${String(joined._id)} (${String(joined.status)}) → delete the stale row${moveLink ? ', move its employee link' : ''}, point its invites at the joined row.`)
    if (!apply) continue
    if (moveLink) {
      await members.updateOne({ _id: joined._id }, { $set: { employeeId: row.employeeId } })
      await employees.updateOne({ _id: row.employeeId, memberId: row._id }, { $set: { memberId: joined._id } })
    }
    await invites.updateMany({ memberId: row._id }, { $set: { memberId: joined._id } })
    await members.deleteOne({ _id: row._id, status: 'invited' })
    fixed += 1
  }
  out(apply ? `Written: ${fixed} stale rows removed.` : 'Nothing written. Run again with --apply to fix the rows marked "delete".')
  await conn.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
