/**
 * Rewrites pre-v2.1 post categories to the new post types: 'discussion' and
 * 'idea' become 'question'. Reads already map them the same way
 * (modules/work/posts/post-types postTypeOf), so this only makes the stored
 * data match the type filters exactly. Safe to run again.
 *
 *   npx tsx scripts/migrate-post-types.ts --env-file=.env.setup.local           # dry run: counts only
 *   npx tsx scripts/migrate-post-types.ts --env-file=.env.setup.local --apply   # write
 *   npx tsx scripts/migrate-post-types.ts --db=flowbit                          # a database on this machine
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local).
 */
import { describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'

async function main() {
  process.stdout.write(`${loadScriptTarget('migrate-post-types')}\n`)
  const apply = hasFlag('apply')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'

  const mongoose = (await import('mongoose')).default
  const { LEGACY_POST_TYPES, postTypeOf } = await import('../src/modules/work/posts/post-types')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  const posts = mongoose.connection.collection('posts')
  process.stdout.write(`${apply ? 'Writing' : 'Dry run on'} ${describeMongo(uri)} / ${dbName}\n`)

  for (const legacy of LEGACY_POST_TYPES) {
    const filter = { category: legacy }
    const count = await posts.countDocuments(filter)
    if (apply && count) await posts.updateMany(filter, { $set: { category: postTypeOf(legacy) } })
    process.stdout.write(`${legacy} -> ${postTypeOf(legacy)}: ${count} post(s)${apply ? ' (rewritten)' : ''}\n`)
  }
  if (!apply) process.stdout.write('Nothing written; pass --apply.\n')
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
