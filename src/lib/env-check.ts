import { estimatedBits, isLocalMongoUri, isLocalUrl, isStrongSecret, resolveAppUrl } from '@/lib/env'
import { SITE_DOMAIN } from '@/lib/company'
import { parseEncryptionKey } from '@/lib/secret-box'
import { missingS3Vars } from '@/lib/storage/config'
import { parseMaxUploadMb, VERCEL_MAX_UPLOAD_MB } from '@/lib/upload-limit'

export { estimatedBits }

/**
 * Startup checks for a deployed server (Vercel, or any production server
 * with a public APP_URL). Pure: takes the environment, returns one clear
 * sentence per problem. `npm run start` on this machine (APP_URL local, not
 * on Vercel) is not "deployed", so local production builds keep working.
 */

type Env = Record<string, string | undefined>

const MIN_CRON_SECRET_LENGTH = 16
/**
 * MAIL_FROM's default domain (env.ts: no-reply@useflowbit.com). A deployment
 * that never set MAIL_FROM sends from it, and Resend refuses every message
 * unless the owner has verified that exact domain.
 */
const DEFAULT_MAIL_DOMAIN = `@${SITE_DOMAIN}`

/** True on Vercel, or in production with a public APP_URL. */
export function isDeployed(env: Env): boolean {
  if (env.NODE_ENV !== 'production') return false
  const url = resolveAppUrl(env)
  return env.VERCEL === '1' || (Boolean(url) && !isLocalUrl(url))
}

export function productionEnvProblems(env: Env): string[] {
  const problems: string[] = []
  const uri = env.MONGODB_URI?.trim() ?? ''
  if (!uri) problems.push('MONGODB_URI is not set. Paste the MongoDB Atlas connection string (mongodb+srv://…/?retryWrites=true&w=majority).')
  else if (isLocalMongoUri(uri)) problems.push('MONGODB_URI points at this machine (localhost). Use the MongoDB Atlas connection string.')

  if (!isStrongSecret(env.APP_SECRET ?? '')) problems.push('APP_SECRET is missing or too weak. Generate one with: openssl rand -base64 48')

  const url = resolveAppUrl(env)
  if (!url) problems.push('APP_URL is not set. Set it to the public address, e.g. https://app.yourdomain.in')
  else if (isLocalUrl(url)) problems.push(`APP_URL is ${url}, a local address. Set it to the public address, e.g. https://app.yourdomain.in`)
  else if (!url.startsWith('https://')) problems.push(`APP_URL ${url} must start with https://`)

  const driver = (env.STORAGE_DRIVER ?? '').trim().toLowerCase() || 'local'
  if (driver === 's3') {
    const missing = missingS3Vars(env)
    if (missing.length) problems.push(`STORAGE_DRIVER=s3 needs ${missing.join(', ')}.`)
    if (env.S3_REGION?.trim().toLowerCase() === 'auto' && !env.S3_ENDPOINT?.trim()) problems.push('S3_REGION=auto (Cloudflare R2) needs S3_ENDPOINT: https://<account-id>.r2.cloudflarestorage.com')
  } else if (env.VERCEL === '1') {
    problems.push('STORAGE_DRIVER must be s3 on Vercel: its disk is temporary, so uploaded files would disappear. Set STORAGE_DRIVER=s3 and the S3_* variables.')
  }

  const encryptionKey = env.APP_ENCRYPTION_KEY?.trim() ?? ''
  if (!encryptionKey) problems.push('APP_ENCRYPTION_KEY is not set. Console staff cannot sign in (two-factor needs it), and Google, Slack, webhooks, e-invoicing and workspace Razorpay keys cannot be saved. Generate one with: openssl rand -base64 32')
  else if (!parseEncryptionKey(encryptionKey)) problems.push('APP_ENCRYPTION_KEY is not a 32-byte key. Generate one with: openssl rand -base64 32 (64 hex characters also work).')

  if ((env.CRON_SECRET ?? '').length < MIN_CRON_SECRET_LENGTH) problems.push('CRON_SECRET is missing or shorter than 16 characters. Generate one with: openssl rand -hex 32')

  if (env.VERCEL === '1' && parseMaxUploadMb(env.MAX_UPLOAD_MB, true) > VERCEL_MAX_UPLOAD_MB) {
    problems.push(`MAX_UPLOAD_MB is ${env.MAX_UPLOAD_MB}; Vercel refuses request bodies over about 4.5 MB. Set it to ${VERCEL_MAX_UPLOAD_MB} or less (or leave it unset).`)
  }
  return problems
}

/**
 * Settings a deployed server can run without, but where something important
 * silently fails: with no RESEND_API_KEY nothing is emailed (invites,
 * password resets, payslips, invoices), and a MAIL_FROM on an unverified
 * domain (or still on the default domain) makes Resend refuse every message.
 */
export function productionEnvWarnings(env: Env): string[] {
  const warnings: string[] = []
  if (!env.RESEND_API_KEY?.trim()) warnings.push('RESEND_API_KEY is not set, so nothing is emailed: invites, password resets, payslips and invoices only reach Settings → Messages log.')
  else if (!env.RESEND_WEBHOOK_SECRET?.trim()) warnings.push('RESEND_WEBHOOK_SECRET is not set, so delivered, bounced and spam ticks from Resend are refused (add the webhook at /api/webhooks/resend in Resend).')
  const from = env.MAIL_FROM?.trim() ?? ''
  if (!from || from.toLowerCase().includes(DEFAULT_MAIL_DOMAIN)) warnings.push('MAIL_FROM is not set to your own verified domain (e.g. Flowbit <no-reply@mail.yourdomain.in>), so Resend will refuse every message.')
  return warnings
}

/** Throws one readable error listing every problem, when deployed. */
export function assertProductionEnv(env: Env = process.env): void {
  if (!isDeployed(env)) return
  for (const warning of productionEnvWarnings(env)) console.error(`[env] ${warning}`)
  const problems = productionEnvProblems(env)
  if (problems.length) throw new Error(`Flowbit cannot start: fix these environment variables (Vercel → Settings → Environment Variables), then redeploy.\n- ${problems.join('\n- ')}`)
}
