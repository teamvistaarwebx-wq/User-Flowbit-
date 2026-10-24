/**
 * Prepares a production database (MongoDB Atlas) once, from a laptop:
 * creates every collection's indexes (TTL ones included) and sets up the
 * first owner with a one-time "choose your password" link, and the same
 * person as the first Console Admin (own Console password link, TOTP on first
 * sign-in). Never sets or prints a password. Safe to run again.
 *
 *   npm run setup:prod -- --env-file=.env.setup.local
 *   FIRST_OWNER_EMAIL=you@company.in npm run setup:prod -- --env-file=.env.setup.local
 *
 * Use a name Next.js never loads (.env.setup.local, git-ignored): a
 * .env.production.local would make local builds use the production database.
 * When moving local data, restore it into Atlas first (docs/DEPLOY-VERCEL.md
 * (f) step 6): this then promotes the restored owner instead of creating a new
 * one. Production servers do not build indexes themselves (lib/db), so run
 * this again after a deploy that adds a model or an index.
 *
 * Reads only the env file given (or the shell), never .env.local, so it
 * cannot touch the local database by mistake. Needs MONGODB_URI, MONGODB_DB,
 * APP_URL and APP_SECRET; RESEND_API_KEY and MAIL_FROM to email the link.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { argValue, describeMongo, hasFlag, loadEnv } from './lib/env-file'
import { SITE_DOMAIN } from '../src/lib/company'

const MODELS_DIR = path.resolve(__dirname, '..', 'src', 'models')
const LINK_HOURS = 24
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const log = (line = '') => process.stdout.write(`${line}\n`)

function modelFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return modelFiles(full)
    return entry.name.endsWith('.ts') && entry.name !== 'index.ts' && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

/** Indexes replaced by a different definition under a new name (createIndexes never drops). */
const LEGACY_INDEXES: Array<{ model: string; index: string }> = [
  // 9 Oct: a custom domain claims its host only once verified (partial unique index kind_domain_verified).
  { model: 'CustomDomain', index: 'kind_1_domain_1' },
]

async function dropLegacyIndexes(mongoose: typeof import('mongoose')) {
  for (const { model, index } of LEGACY_INDEXES) {
    const collection = mongoose.model(model).collection
    const exists = await collection.indexExists(index).catch(() => false)
    if (!exists) continue
    await collection.dropIndex(index)
    log(`Dropped the old index ${model}.${index}.`)
  }
}

async function createIndexes() {
  const { mongoose } = await import('../src/lib/db')
  for (const file of modelFiles(MODELS_DIR)) await import(pathToFileURL(file).href)
  const names = mongoose.modelNames().sort()
  await dropLegacyIndexes(mongoose)
  for (const name of names) await mongoose.model(name).createIndexes()
  log(`Indexes ready for ${names.length} collections.`)
}

const nameFromEmail = (email: string) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Owner'

async function emailLink(to: string, link: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const { Resend } = await import('resend')
  const from = process.env.MAIL_FROM || `Flowbit <no-reply@${SITE_DOMAIN}>`
  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject: 'Choose your Flowbit password',
    text: `Your Flowbit owner account is ready. Choose your password here (the link works once, for ${LINK_HOURS} hours):\n\n${link}\n`,
  })
  if (error) log(`Could not email the link (${error.message}).`)
  return !error
}

/** Creates (or promotes) the first owner and issues a one-time password link. */
async function setUpOwner(email: string) {
  const { User } = await import('../src/models/User')
  const { PasswordReset } = await import('../src/models/PasswordReset')
  const { hashToken, randomToken } = await import('../src/lib/auth/tokens')
  const { appUrl } = await import('../src/lib/env')

  const { Staff } = await import('../src/models/console/Staff')
  const { createStaff } = await import('../src/modules/console/staff-provision')

  const name = process.env.FIRST_OWNER_NAME?.trim() || nameFromEmail(email)
  const existing = await User.findOne({ email }).lean()
  const user = existing ?? (await User.create({ email, name })).toObject()
  log(existing ? `${email} already has an account.` : `Created the owner account ${email} (no password yet).`)
  // The founder is also the first Console Admin, with a Console password of their own and 2FA.
  if (!(await Staff.exists({ email }))) {
    const staff = await createStaff({ email, name, role: 'admin', isFounder: true, userId: String(user._id) })
    log(`Created the Console Admin ${email}. Choose the Console password here (works once, 48 hours; do not share): ${staff.setupLink}`)
  }

  if (existing?.passwordHash && !hasFlag('new-link')) {
    log(`Sign in at ${appUrl('/login')} with your existing password (or run again with --new-link).`)
    return
  }
  const token = randomToken()
  await PasswordReset.create({ userId: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_HOURS * 3_600_000) })
  const link = appUrl(`/reset-password/${token}`)
  const emailed = await emailLink(email, link)
  if (emailed) log(`Emailed a one-time "choose your password" link to ${email} (valid ${LINK_HOURS} hours).`)
  if (!emailed || hasFlag('print-link')) {
    log(`One-time link (valid ${LINK_HOURS} hours, works once; do not share it):`)
    log(`  ${link}`)
  }
  log(`After choosing the password you land on "Create your workspace". The Console is a separate sign-in with its own link above.`)
}

function printSignupHelp(appUrlBase: string) {
  log('No FIRST_OWNER_EMAIL given. Two ways for the owner to start:')
  log(`  1. Run again with FIRST_OWNER_EMAIL=you@company.in to get a one-time password link (recommended; also makes you the first Console Admin).`)
  log(`  2. Or sign up at ${appUrlBase}/signup, then add Console staff with scripts/migrate-staff.ts (PLATFORM_ADMIN_EMAILS) --apply.`)
}

async function main() {
  const loaded = loadEnv(null)
  const uri = process.env.MONGODB_URI?.trim()
  if (!uri) throw new Error('MONGODB_URI is not set. Pass --env-file=.env.setup.local (see docs/DEPLOY-VERCEL.md).')
  const { isLocalMongoUri } = await import('../src/lib/env')
  if (isLocalMongoUri(uri) && !hasFlag('allow-local')) throw new Error('MONGODB_URI points at this machine. setup:prod is for the production database (Atlas). Pass --allow-local to run it against a local database anyway.')

  const { productionEnvProblems } = await import('../src/lib/env-check')
  const { serverEnv } = await import('../src/lib/env')
  const env = serverEnv()
  log(`Env: ${loaded ?? 'shell only'}`)
  log(`Database: ${describeMongo(uri)} / ${env.MONGODB_DB}`)
  log(`App URL: ${env.APP_URL}`)
  const problems = productionEnvProblems({ ...process.env, NODE_ENV: 'production', VERCEL: '1' }).filter((p) => !p.startsWith('STORAGE_DRIVER') && !p.startsWith('CRON_SECRET'))
  problems.forEach((p) => log(`Warning: ${p}`))

  const { dbConnect, dbDisconnect } = await import('../src/lib/db')
  await dbConnect()
  try {
    await createIndexes()
    const email = (argValue('owner-email') ?? process.env.FIRST_OWNER_EMAIL ?? '').trim().toLowerCase()
    if (email && !EMAIL.test(email)) throw new Error(`FIRST_OWNER_EMAIL "${email}" is not an email address.`)
    if (email) await setUpOwner(email)
    else printSignupHelp(env.APP_URL.replace(/\/$/, ''))
  } finally {
    await dbDisconnect()
  }
  log('Done.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
