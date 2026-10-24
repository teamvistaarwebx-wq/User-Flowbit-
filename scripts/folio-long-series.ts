/**
 * Read-only: lists Folio entities whose invoice, credit-note or receipt series
 * prints numbers over 16 characters (CGST Rule 46(b), R3 H2). Folio refuses to
 * issue from such a series, so an admin must shorten it in Folio settings,
 * Series. Writes nothing. See docs/migrations/2026-10-folio-16-char-numbers.md.
 *
 *   npx tsx scripts/folio-long-series.ts --env-file=.env.setup.local
 *   npx tsx scripts/folio-long-series.ts --db=flowbit        # a database on this machine
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local).
 */
import { describeMongo, loadScriptTarget } from './lib/env-file'

async function main() {
  process.stdout.write(`${loadScriptTarget('folio-long-series')}\n`)
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'

  const mongoose = (await import('mongoose')).default
  const { seriesLengthProblems } = await import('../src/modules/folio/engine/series-rules')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  process.stdout.write(`Read-only check on ${describeMongo(uri)} / ${dbName}\n`)

  const entities = await mongoose.connection.collection('folioentities').find({}, { projection: { orgId: 1, code: 1, series: 1, isActive: 1 } }).toArray()
  let offending = 0
  for (const e of entities) {
    const problems = e.series ? seriesLengthProblems(e.series) : []
    if (!problems.length) continue
    offending += 1
    process.stdout.write(`org ${String(e.orgId)} entity ${e.code}${e.isActive === false ? ' (inactive)' : ''}: ${problems.map((p) => `${p.field} "${e.series[p.field]}"`).join(', ')}\n`)
  }
  process.stdout.write(`${offending} of ${entities.length} entities need a shorter series.\n`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
