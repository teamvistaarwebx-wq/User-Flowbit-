/**
 * Stores `subscription.accountType` on workspaces created before the field
 * existed (console spec 4.1). Reads already resolve a missing value the same
 * way (lib/account-types accountTypeOf), so this only makes the stored data
 * explicit for queries and the Console. Safe to run again.
 *
 *   npx tsx scripts/migrate-account-types.ts --env-file=.env.setup.local           # dry run: counts only
 *   npx tsx scripts/migrate-account-types.ts --env-file=.env.setup.local --apply   # write
 *   npx tsx scripts/migrate-account-types.ts --db=flowbit                          # a database on this machine
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local).
 *
 * Internal and Test are never guessed: set them in the Console (the seed marks
 * the `vistaar` demo workspace as Test).
 */
import { describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'

async function main() {
  process.stdout.write(`${loadScriptTarget('migrate-account-types')}\n`)
  const apply = hasFlag('apply')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'

  const mongoose = (await import('mongoose')).default
  const { accountTypeOf } = await import('../src/lib/account-types')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  const orgs = mongoose.connection.collection('orgs')
  process.stdout.write(`${apply ? 'Writing' : 'Dry run on'} ${describeMongo(uri)} / ${dbName}\n`)

  const missing = await orgs.find({ 'subscription.accountType': { $exists: false } }, { projection: { slug: 1, 'subscription.plan': 1 } }).toArray()
  const counts: Record<string, number> = {}
  for (const org of missing) {
    const type = accountTypeOf(org.subscription as { plan?: string } | undefined)
    counts[type] = (counts[type] ?? 0) + 1
    if (apply) await orgs.updateOne({ _id: org._id, 'subscription.accountType': { $exists: false } }, { $set: { 'subscription.accountType': type } })
  }
  process.stdout.write(`${missing.length} workspaces without an account type: ${JSON.stringify(counts)}${apply ? ' (stored)' : ' (nothing written; pass --apply)'}\n`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
