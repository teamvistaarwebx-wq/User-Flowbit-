/**
 * Runs Folio's daily job once: automatic overdue reminders and auto-generated
 * retainer drafts for every workspace (POST /api/folio/cron).
 *
 *   npm run cron:folio
 *
 * Schedule it daily, e.g. crontab `30 3 * * * cd /srv/flowbit && npm run cron:folio`
 * (09:00 IST). The bearer token is HMAC-SHA256(APP_SECRET, 'folio:cron'), the same
 * value modules/folio/collections/system.ts checks; it is never printed.
 */
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const envFile = path.join(ROOT, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

async function main() {
  const secret = process.env.APP_SECRET
  if (!secret) throw new Error('APP_SECRET is not set (.env.local or the environment).')
  const appUrl = (process.env.APP_URL ?? 'http://127.0.0.1:4100').replace(/\/$/, '')
  const token = createHmac('sha256', secret).update('folio:cron').digest('hex')
  const res = await fetch(`${appUrl}/api/folio/cron`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
  const body = await res.text()
  if (!res.ok) throw new Error(`Folio cron failed with ${res.status}: ${body.slice(0, 500)}`)
  console.info(`Folio cron done: ${body.slice(0, 500)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
