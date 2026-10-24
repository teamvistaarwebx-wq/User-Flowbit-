/**
 * Turns the old platform admins into Console staff (console spec 7.1).
 * Founder-only by default (V2-REVIEW C6): only --founder becomes an Admin.
 * Dry run by default: prints the plan and changes nothing.
 *
 * Only for a database restored from v1 (users still carry isPlatformAdmin).
 * On a fresh database, setup:prod already made the founder the Console Admin.
 *
 *   npx tsx scripts/migrate-staff.ts --env-file=.env.setup.local --founder=you@company.in          # dry run
 *   npx tsx scripts/migrate-staff.ts --env-file=.env.setup.local --founder=you@company.in --apply  # create the founder Admin, drop User.isPlatformAdmin
 *   --all                                                     # also every other isPlatformAdmin user and PLATFORM_ADMIN_EMAILS address
 *   --db=<name> instead of --env-file                         # a database on this machine
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local).
 *
 * No product password is carried over. The founder (the person running this)
 * gets their one-time setup link printed here (valid 48 hours). Anyone else
 * created with --all gets no link here: an Admin sends their links from
 * Console → Staff → "Send setup links" (emailed, one-time, 48 hours). Everyone
 * enrols their own authenticator on first sign-in.
 */
import { describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'

const log = (...args: unknown[]) => process.stdout.write(`[migrate-staff] ${args.join(' ')}\n`)
const option = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]?.trim().toLowerCase() ?? null

async function main() {
  log(loadScriptTarget('migrate-staff'))
  const apply = hasFlag('apply')
  const founder = option('founder')
  const includeOthers = hasFlag('all')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'
  const mongoose = (await import('mongoose')).default
  const { Staff } = await import('../src/models/console/Staff')
  const { planStaffMigration } = await import('../src/modules/console/staff-migration')
  const { createStaff } = await import('../src/modules/console/staff-provision')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  // isPlatformAdmin is no longer in the User schema: read the raw collection.
  const users = mongoose.connection.collection('users')
  const toAdmin = (u: Record<string, unknown>) => ({ userId: String(u._id), email: String(u.email), name: String(u.name ?? '') })
  const listed = (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  const [admins, listedUsers, staff] = await Promise.all([
    users.find({ isPlatformAdmin: true }).toArray(),
    users.find({ email: { $in: [...listed, ...(founder ? [founder] : [])] } }).toArray(),
    Staff.find({}, { email: 1 }).lean(),
  ])
  const plan = planStaffMigration({
    platformAdmins: admins.map(toAdmin),
    usersByEmail: new Map(listedUsers.map((u) => [String(u.email), toAdmin(u)])),
    listedEmails: listed,
    existingStaffEmails: new Set(staff.map((s) => s.email)),
    founder,
    includeOthers,
  })
  log(`${apply ? 'APPLY' : 'DRY RUN'} on ${describeMongo(uri)} / ${dbName}`)
  if (!founder) log('No --founder=<email> given: nobody is created. Pass the founder\'s email (and --all to add the other admins).')
  for (const c of plan.create) log(`create Admin ${c.email} (${c.name}) from ${c.source}${c.isFounder ? '; founder; setup link printed below' : '; no password carried over, send the setup link from Console → Staff'}`)
  for (const s of plan.skip) log(`skip ${s.email}: ${s.reason}`)
  if (!plan.create.length) log('Nothing to create.')
  if (!apply) {
    log('Dry run only. Run again with --apply to make these changes.')
    await mongoose.disconnect()
    return
  }
  for (const c of plan.create) {
    // Never a product password (V2-REVIEW C6): every Admin chooses a Console password through a setup link.
    const created = await createStaff({ email: c.email, name: c.name, role: 'admin', passwordHash: null, userId: c.userId, isFounder: c.isFounder })
    if (c.isFounder && created.setupLink) log(`your setup link (works once, 48 hours; do not share): ${created.setupLink}`)
  }
  const others = plan.create.filter((c) => !c.isFounder).length
  if (others) log(`${others} other Admin(s) created without a password. Sign in, then use Console → Staff → "Send setup links".`)
  const result = await users.updateMany({ isPlatformAdmin: { $exists: true } }, { $unset: { isPlatformAdmin: '' } })
  log(`Created ${plan.create.length} staff; removed isPlatformAdmin from ${result.modifiedCount} users.`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error('[migrate-staff] failed', error)
  process.exit(1)
})
