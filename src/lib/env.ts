import { z } from 'zod'
import { parseEncryptionKey } from './secret-box'
import { COMPANY_LEGAL_NAME, SITE_DOMAIN, SUPPORT_EMAIL_DEFAULT } from './company'

/** Bits of estimated randomness a signing secret needs (APP_SECRET). */
export const MIN_SECRET_BITS = 128

/**
 * Shannon entropy of the string's own characters, in bits (a cautious
 * stand-in for randomness). `openssl rand -hex 32` scores about 225-250 and
 * `openssl rand -base64 48` about 330; a repeated pattern scores far less.
 */
export function estimatedBits(value: string): number {
  if (!value) return 0
  const counts = new Map<string, number>()
  for (const c of value) counts.set(c, (counts.get(c) ?? 0) + 1)
  let perChar = 0
  for (const n of counts.values()) {
    const p = n / value.length
    perChar -= p * Math.log2(p)
  }
  return perChar * value.length
}

/** The same rule the startup check (env-check) applies: long enough, not the .env.example placeholder, random enough. */
export const isStrongSecret = (value: string): boolean => value.length >= 32 && !/change-me/i.test(value) && estimatedBits(value) >= MIN_SECRET_BITS

/**
 * APP_URL, or on Vercel when it is unset, the project's production address
 * (VERCEL_PROJECT_PRODUCTION_URL, a system variable present at build and run
 * time), so the very first deployment works before APP_URL can be known.
 */
export function resolveAppUrl(env: Record<string, string | undefined>): string {
  const explicit = env.APP_URL?.trim()
  if (explicit) return explicit
  const vercelHost = env.VERCEL === '1' ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : ''
  return vercelHost ? `https://${vercelHost}` : ''
}

/**
 * Server environment, validated once on first use. Optional integrations are
 * blank strings when unset; use the `is*Configured()` helpers to branch.
 */
const schema = z.object({
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/?replicaSet=rs0'),
  MONGODB_DB: z.string().min(1).default('flowbit'),
  // Signs cron tokens, OAuth state and claim-form sessions: refuse the .env.example placeholder and low-entropy values.
  APP_SECRET: z
    .string()
    .min(32, 'APP_SECRET must be at least 32 characters')
    .refine(isStrongSecret, 'APP_SECRET looks like a placeholder. Generate one with: openssl rand -base64 48'),
  APP_URL: z.string().url().default('http://127.0.0.1:4100'),
  /** 'local' writes uploads under STORAGE_DIR; 's3' stores them in an S3-compatible bucket (Cloudflare R2, AWS S3). */
  STORAGE_DRIVER: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() || undefined : v), z.enum(['local', 's3']).default('local')),
  STORAGE_DIR: z.string().default('./storage'),
  /** R2: https://<account-id>.r2.cloudflarestorage.com. Leave empty for AWS S3. */
  S3_ENDPOINT: z.string().default(''),
  /** 'auto' for R2, e.g. 'ap-south-1' for AWS. */
  S3_REGION: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  /** 'true' for endpoints that need https://host/bucket/key (MinIO); R2 and AWS work without it. */
  S3_FORCE_PATH_STYLE: z.string().default(''),
  /** Vercel sends it as `Authorization: Bearer <CRON_SECRET>` to /api/cron/*. */
  CRON_SECRET: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  /** Signing secret (whsec_…) of the Resend webhook at /api/webhooks/resend; without it delivery ticks are refused. */
  RESEND_WEBHOOK_SECRET: z.string().default(''),
  MAIL_FROM: z.string().default(`Flowbit <no-reply@${SITE_DOMAIN}>`),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  /**
   * Master switch for every WhatsApp surface (lib/feature-flags). Off unless 'on', 'true', '1' or 'yes';
   * when on, the Console setting Features → WhatsApp can still turn it off for the whole platform.
   */
  FEATURE_WHATSAPP: z.string().default(''),
  /** WhatsApp A (console spec 10): Interakt API key of Flowbit's messages number (bills, reminders). Unset = WhatsApp skipped, email only. */
  INTERAKT_API_KEY: z.string().default(''),
  /** Interakt API key of the separate OTP number (verification codes). */
  INTERAKT_OTP_API_KEY: z.string().default(''),
  /** Shared secret of /api/webhooks/interakt (?token=… in the URL, or an HMAC signature header). Unset = webhook refused. */
  INTERAKT_WEBHOOK_SECRET: z.string().default(''),
  /** Printed prefix of Flowbit's tax invoices (1–3 letters, default FB). A new GSTIN needs a new prefix (modules/billing/series). */
  FLOWBIT_INVOICE_PREFIX: z.string().default('FB'),
  /** Only scripts/migrate-staff.ts reads it: these emails become Console Admins (console spec 7.1). */
  PLATFORM_ADMIN_EMAILS: z.string().default(''),
  /**
   * Host that serves the Console (src/proxy.ts). Default console.useflowbit.com; locally e.g.
   * console.localhost:4100. On loopback hosts /console also works without it.
   */
  CONSOLE_HOST: z.string().default(''),
  // Flowbit as the supplier on its own subscription GST invoices (confirm GSTIN, address and SAC with the CA).
  FLOWBIT_LEGAL_NAME: z.string().default(COMPANY_LEGAL_NAME),
  FLOWBIT_GSTIN: z.string().default(''),
  FLOWBIT_PAN: z.string().default(''),
  FLOWBIT_ADDRESS: z.string().default(''),
  /** 2-letter state code of Flowbit's registration ('MP'); decides CGST+SGST vs IGST. */
  FLOWBIT_STATE: z.string().default(''),
  FLOWBIT_SAC: z.string().default('998314'),
  /**
   * SAC printed on WhatsApp wallet recharge invoices. Unset = FLOWBIT_SAC. The CA is to confirm
   * 998315 or 998319 (docs/qa/CA-QUESTIONS.md Q1); change it here, no code change needed.
   */
  FLOWBIT_WALLET_SAC: z.string().default(''),
  /** Vistaar's own workspace: every signup and demo request becomes a Lead in its Orbit. Unset = skipped. */
  FLOWBIT_HOUSE_ORG_SLUG: z.string().default(''),
  /**
   * 'true' lets /api/cron/lifecycle really delete workspaces 90 days after they were blocked
   * (modules/lifecycle/purge). Anything else: dry run, the job only logs what it would delete.
   */
  LIFECYCLE_DELETE_ENABLED: z.string().default(''),
  /**
   * 'true' lets the daily lifecycle job really delete message and processing logs older than
   * the retention period (modules/privacy/retention). Anything else: dry run, it only counts them.
   */
  RETENTION_PRUNE_ENABLED: z.string().default(''),
  /**
   * 32 random bytes (`openssl rand -base64 32`) that encrypt secrets at rest with AES-256-GCM:
   * Google and Slack tokens, webhook secrets, GSP logins, a workspace's own Razorpay and
   * Interakt keys and Console staff TOTP secrets. Required in production (lib/env-check
   * refuses to start a deployed server without it); optional for local development.
   */
  APP_ENCRYPTION_KEY: z.string().default(''),
  SUPPORT_EMAIL: z.string().default(SUPPORT_EMAIL_DEFAULT),
  /**
   * IndiaMART Lead Manager pull API (Orbit lead capture, beta). Unset = IndiaMART's documented
   * https://mapi.indiamart.com/wservce/crm/crmListing/v2/. Each workspace stores its own CRM key.
   */
  INDIAMART_API_URL: z.string().default(''),
  /** Slack app (docs/SLACK-APP-MANIFEST.yml): OAuth install per workspace, slash command, message shortcut. Unset = Slack hidden. */
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  /** Verifies every request from Slack (X-Slack-Signature). Without it /api/slack/* refuses everything. */
  SLACK_SIGNING_SECRET: z.string().default(''),
  /** Email to task: the domain whose MX points at the inbound provider, e.g. in.useflowbit.com (tasks+<slug>-<token>@<domain>). */
  INBOUND_EMAIL_DOMAIN: z.string().default(''),
  /** Signing secret of the inbound email webhook: Resend's whsec_… (Svix headers) or a shared secret for x-flowbit-signature (generic JSON). */
  INBOUND_EMAIL_SECRET: z.string().default(''),
  /** Posts: GIF search through Klipy's Tenor-compatible API (server proxy). Unset = no GIF search; image upload stays. */
  KLIPY_API_KEY: z.string().default(''),
  /**
   * HR settings → Offices: address ↔ coordinates (Google Geocoding API), called only from the server. A server key,
   * never sent to the browser; restrict it to the Geocoding API. Unset = the office editor places the pin by search
   * suggestions, the map or coordinates only.
   */
  GOOGLE_GEOCODING_API_KEY: z.string().default(''),
  /** Meetings AI: Sarvam batch speech-to-text (diarization, Hinglish code-mix). Unset = transcription off. */
  SARVAM_API_KEY: z.string().default(''),
  /** Meetings AI notetaker bot (Recall.ai): API key, region (us-west-2, us-east-1, eu-central-1, ap-northeast-1) and the webhook verification secret (whsec_…). */
  RECALL_API_KEY: z.string().default(''),
  RECALL_REGION: z.string().default('us-west-2'),
  RECALL_WEBHOOK_SECRET: z.string().default(''),
  /** Meetings retention: 1/true actually deletes recordings and transcripts past the workspace's retention; otherwise the daily job only reports (dry run). */
  MEETINGS_PURGE: z.string().default(''),
  /** Custom domains add-on: the host a workspace's portal.<their domain> CNAMEs to. Unset = portal.<site domain>. */
  PORTAL_CNAME_TARGET: z.string().default(`portal.${SITE_DOMAIN}`),
  /** 'true' adds a verified portal host to the Vercel project through the API (VERCEL_API_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID). Otherwise add it by hand. */
  VERCEL_DOMAINS_API: z.string().default(''),
  VERCEL_API_TOKEN: z.string().default(''),
  VERCEL_PROJECT_ID: z.string().default(''),
  VERCEL_TEAM_ID: z.string().default(''),
  /**
   * 'true' offers Gmail reply detection for Orbit sequences (gmail.readonly, a restricted scope that
   * needs Google's CASA assessment before public use). Off by default; the reply-to inbound address works without it.
   */
  GMAIL_REPLY_DETECTION: z.string().default(''),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | null = null

const LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])$/i

/** True for loopback hosts (localhost, 127.x, ::1, 0.0.0.0) and *.localhost. */
export function isLocalUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname
    return LOCAL_HOSTS.test(host) || host.endsWith('.localhost')
  } catch {
    return false
  }
}

/**
 * The dev "Simulate payment" checkout: only in development, never on Vercel,
 * and only while APP_URL is a local address (unset means the local default).
 */
export function simulatedPaymentsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === 'production' || env.VERCEL === '1') return false
  return isLocalUrl(env.APP_URL?.trim() || 'http://127.0.0.1:4100')
}

/** True when a MongoDB URI points only at this machine (a development database). */
export function isLocalMongoUri(uri: string): boolean {
  if (!uri.startsWith('mongodb://')) return false
  const hosts = uri.slice('mongodb://'.length).split('/')[0].split('@').pop() ?? ''
  return hosts.split(',').every((h) => /^(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(h.trim()))
}

/**
 * Why links built from APP_URL would be wrong in production (emails, invite,
 * reset and claim links, OG URLs, redirects), or null when it is fine.
 */
export function appUrlIssue(raw: string | undefined, nodeEnv: string | undefined): string | null {
  if (nodeEnv !== 'production') return null
  if (!raw?.trim()) return 'APP_URL is not set, so every link in emails and redirects points at http://127.0.0.1:4100. Set it to the public URL, e.g. https://app.flowbit.in.'
  if (isLocalUrl(raw)) return `APP_URL is ${raw}, a local address. Links in emails and redirects will not open for anyone else. Set it to the public URL.`
  if (raw.startsWith('http://')) return `APP_URL ${raw} is not https. Session cookies will not be marked Secure.`
  return null
}

export function serverEnv(): ServerEnv {
  if (cached) return cached
  const resolvedAppUrl = resolveAppUrl(process.env)
  const parsed = schema.safeParse({ ...process.env, APP_URL: resolvedAppUrl || undefined })
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${detail}`)
  }
  cached = parsed.data
  const issue = appUrlIssue(resolvedAppUrl, process.env.NODE_ENV)
  if (issue) console.warn(`[env] ${issue}`)
  return cached
}

export const isGoogleConfigured = () => Boolean(serverEnv().GOOGLE_CLIENT_ID && serverEnv().GOOGLE_CLIENT_SECRET)
export const isResendConfigured = () => Boolean(serverEnv().RESEND_API_KEY)
export const isRazorpayConfigured = () => Boolean(serverEnv().RAZORPAY_KEY_ID && serverEnv().RAZORPAY_KEY_SECRET)
export const isRazorpayWebhookConfigured = () => Boolean(serverEnv().RAZORPAY_WEBHOOK_SECRET)
/** 'live' (rzp_live_ key), 'test' (rzp_test_ key) or 'none' (no keys: simulated checkout). */
export function razorpayMode(): 'live' | 'test' | 'none' {
  if (!isRazorpayConfigured()) return 'none'
  return serverEnv().RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'live' : 'test'
}
/** The AES-256-GCM key for secrets at rest (lib/secret-box), or null when APP_ENCRYPTION_KEY is missing or not 32 bytes. */
export const encryptionKey = (): Buffer | null => parseEncryptionKey(serverEnv().APP_ENCRYPTION_KEY)
export const isAnthropicConfigured = () => Boolean(serverEnv().ANTHROPIC_API_KEY)
export const isSlackConfigured = () => Boolean(serverEnv().SLACK_CLIENT_ID && serverEnv().SLACK_CLIENT_SECRET && serverEnv().SLACK_SIGNING_SECRET)
export const isSarvamConfigured = () => Boolean(serverEnv().SARVAM_API_KEY)
export const isKlipyConfigured = () => Boolean(serverEnv().KLIPY_API_KEY)
export const isGeocodingConfigured = () => Boolean(serverEnv().GOOGLE_GEOCODING_API_KEY)
export const isRecallConfigured = () => Boolean(serverEnv().RECALL_API_KEY && serverEnv().RECALL_WEBHOOK_SECRET)
export const isInboundEmailConfigured = () => Boolean(serverEnv().INBOUND_EMAIL_DOMAIN && serverEnv().INBOUND_EMAIL_SECRET)

export function platformAdminEmails(): string[] {
  return serverEnv()
    .PLATFORM_ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Mark cookies Secure: when the public URL is https, and always on Vercel
 * (every Vercel URL is https, even when APP_URL is set wrongly).
 */
export const secureCookies = () => serverEnv().APP_URL.startsWith('https://') || process.env.VERCEL === '1'

export const appUrl = (path = '') => `${serverEnv().APP_URL.replace(/\/$/, '')}${path}`

export type FlowbitSupplier = { legalName: string; gstin: string | null; pan: string | null; address: string; stateCode2: string | null; sac: string; walletSac: string; supportEmail: string }

/** Flowbit's own details for subscription invoices. `gstin` null means "not registered" (PDFs carry a DRAFT watermark). */
export function flowbitSupplier(): FlowbitSupplier {
  const env = serverEnv()
  return {
    legalName: env.FLOWBIT_LEGAL_NAME,
    gstin: env.FLOWBIT_GSTIN.trim().toUpperCase() || null,
    pan: env.FLOWBIT_PAN.trim().toUpperCase() || null,
    address: env.FLOWBIT_ADDRESS,
    stateCode2: env.FLOWBIT_STATE.trim().toUpperCase() || null,
    sac: env.FLOWBIT_SAC,
    walletSac: env.FLOWBIT_WALLET_SAC.trim() || env.FLOWBIT_SAC,
    supportEmail: env.SUPPORT_EMAIL,
  }
}
