/**
 * Copies stored files from the local disk (STORAGE_DIR) into the S3-compatible
 * bucket (S3_* variables), keeping every StoredFile.path as the object key, so
 * nothing in the database changes. Safe to run again: objects already in the
 * bucket are skipped unless --overwrite. Dry run by default, like the other
 * migrate scripts: nothing is uploaded without --apply.
 *
 *   npm run storage:migrate -- --env-file=.env.setup.local           # dry run: list what would be copied
 *   npm run storage:migrate -- --env-file=.env.setup.local --apply   # copy
 *   --db=<name> instead of --env-file                                 # a database on this machine
 *
 * Refuses to run without --env-file or --db (never falls back to .env.local).
 *
 * Needs MONGODB_URI and MONGODB_DB (the database whose StoredFile rows to copy),
 * STORAGE_DIR (where the files are now) and S3_REGION, S3_BUCKET,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (+ S3_ENDPOINT for R2).
 * Then set STORAGE_DRIVER=s3 on the server.
 */
import { argValue, describeMongo, hasFlag, loadScriptTarget } from './lib/env-file'

const BATCH = 4

type Counts = { copied: number; skipped: number; missing: number; failed: number }

async function main() {
  const targetLine = loadScriptTarget('storage:migrate')
  const dryRun = !hasFlag('apply')
  const overwrite = hasFlag('overwrite')
  const orgFilter = argValue('org')
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set.')
  const dbName = process.env.MONGODB_DB || 'flowbit'

  const mongoose = (await import('mongoose')).default
  const { localDriver } = await import('../src/lib/storage/local')
  const { s3Driver } = await import('../src/lib/storage/s3')
  const { s3ConfigFrom } = await import('../src/lib/storage/config')
  const { StoredFile } = await import('../src/models/StoredFile')

  const env = (k: string) => process.env[k] ?? ''
  const config = s3ConfigFrom({
    STORAGE_DRIVER: 's3', STORAGE_DIR: env('STORAGE_DIR') || './storage', S3_ENDPOINT: env('S3_ENDPOINT'), S3_REGION: env('S3_REGION'), S3_BUCKET: env('S3_BUCKET'),
    S3_ACCESS_KEY_ID: env('S3_ACCESS_KEY_ID'), S3_SECRET_ACCESS_KEY: env('S3_SECRET_ACCESS_KEY'), S3_FORCE_PATH_STYLE: env('S3_FORCE_PATH_STYLE'),
  })
  const source = localDriver(env('STORAGE_DIR') || './storage')
  const target = s3Driver(config)

  console.info(targetLine)
  console.info(`Database: ${describeMongo(uri)} / ${dbName}`)
  console.info(`From: ${env('STORAGE_DIR') || './storage'}  To: bucket ${config.bucket}${config.endpoint ? ` at ${config.endpoint}` : ` (${config.region})`}${dryRun ? '  [dry run: pass --apply to copy]' : ''}`)

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  const filter = orgFilter ? { orgId: new mongoose.Types.ObjectId(orgFilter) } : {}
  const total = await StoredFile.countDocuments(filter)
  console.info(`${total} stored file record(s) to check.`)

  const counts: Counts = { copied: 0, skipped: 0, missing: 0, failed: 0 }
  const copyOne = async (file: { _id: unknown; path: string; mime: string }) => {
    try {
      if (!overwrite && (await target.exists(file.path))) {
        counts.skipped += 1
        return
      }
      const data = await source.get(file.path)
      if (!data) {
        counts.missing += 1
        console.warn(`  missing on disk: ${file.path} (StoredFile ${String(file._id)})`)
        return
      }
      if (!dryRun) await target.put(file.path, data, file.mime)
      counts.copied += 1
    } catch (error) {
      counts.failed += 1
      console.error(`  failed: ${file.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let batch: Promise<void>[] = []
  for await (const file of StoredFile.find(filter, { path: 1, mime: 1 }).lean().cursor()) {
    batch.push(copyOne(file))
    if (batch.length >= BATCH) {
      await Promise.all(batch)
      batch = []
    }
  }
  await Promise.all(batch)
  await mongoose.disconnect()

  console.info(`${dryRun ? 'Would copy' : 'Copied'} ${counts.copied}, already in the bucket ${counts.skipped}, missing on disk ${counts.missing}, failed ${counts.failed}.`)
  if (counts.failed) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
