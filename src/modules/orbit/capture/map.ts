import { normalizePhone } from '@/modules/whatsapp/phone'
import { isWebUrl, normaliseUrl } from '../normalize'

/**
 * Turning what arrives from outside into a Lead (pure): a website form, a
 * generic JSON webhook (Zapier, Make, Pabbly), Meta lead ads (`field_data`)
 * and JustDial's lead push. Unknown fields go into the notes; nothing from
 * outside chooses the owner, the stage or any id.
 */

export const CAPTURE_SOURCES = {
  website_form: { label: 'Website form', warm: true },
  webhook: { label: 'Lead webhook', warm: true },
  meta_lead_ads: { label: 'Meta lead ads', warm: true },
  justdial: { label: 'JustDial', warm: true },
  indiamart: { label: 'IndiaMART', warm: true },
  whatsapp: { label: 'WhatsApp', warm: true },
  whatsapp_ad: { label: 'WhatsApp ad', warm: true },
} as const
export type CaptureSource = keyof typeof CAPTURE_SOURCES

export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>

export type LeadDraft = Readonly<{
  companyName: string
  contactName: string
  email: string
  phone: string
  website: string
  notes: string
  source: CaptureSource
  tags: readonly string[]
  utm: Utm
  /** The sender's own id for the enquiry (IndiaMART UNIQUE_QUERY_ID, JustDial leadid, Meta leadgen id): a repeat is the same lead. */
  externalId: string | null
}>

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** First non-empty value among these keys, matched case-insensitively and ignoring spaces, dashes and underscores. */
function pick(body: Obj, keys: readonly string[], max = 200): string {
  const flat = new Map(Object.entries(body).map(([k, v]) => [k.toLowerCase().replace(/[\s_-]+/g, ''), v]))
  for (const key of keys) {
    const value = text(flat.get(key.toLowerCase().replace(/[\s_-]+/g, '')), max)
    if (value) return value
  }
  return ''
}

const NAME_KEYS = ['name', 'full_name', 'fullname', 'contact_name', 'your_name', 'first_name', 'sender_name']
const COMPANY_KEYS = ['company', 'company_name', 'business', 'business_name', 'organisation', 'organization', 'firm', 'sender_company']
const EMAIL_KEYS = ['email', 'email_address', 'work_email', 'sender_email', 'mail']
const PHONE_KEYS = ['phone', 'phone_number', 'mobile', 'mobile_number', 'whatsapp', 'contact_number', 'sender_mobile', 'tel']
const MESSAGE_KEYS = ['message', 'comments', 'comment', 'enquiry', 'inquiry', 'requirement', 'details', 'query', 'notes', 'description']
const WEBSITE_KEYS = ['website', 'url', 'site']
const KNOWN = new Set([...NAME_KEYS, ...COMPANY_KEYS, ...EMAIL_KEYS, ...PHONE_KEYS, ...MESSAGE_KEYS, ...WEBSITE_KEYS, 'last_name', 'tags', 'tag', 'redirect', 'company_website', 'form_key'].map((k) => k.replace(/[\s_-]+/g, '')))

function utmOf(body: Obj): Utm {
  const nested = obj(body.utm)
  return Object.fromEntries(UTM_KEYS.map((k) => [k, text(body[`utm_${k}`] ?? nested[k], 120)]).filter(([, v]) => v)) as Utm
}

const tagsOf = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value.map((v) => text(v, 40)) : text(value, 300).split(',')
  return [...new Set(raw.map((t) => t.trim().toLowerCase()).filter((t) => /^[\p{L}\p{N} _-]{1,40}$/u.test(t)))].slice(0, 10)
}

/** Fields nobody mapped, as "Key: value" lines for the notes. */
function extras(body: Obj): string[] {
  return Object.entries(body)
    .filter(([k, v]) => !KNOWN.has(k.toLowerCase().replace(/[\s_-]+/g, '')) && !k.toLowerCase().startsWith('utm') && (typeof v === 'string' || typeof v === 'number') && text(v))
    .slice(0, 15)
    .map(([k, v]) => `${text(k, 40)}: ${text(v, 300)}`)
}

/** A captured website becomes an http(s) link or is dropped: it is rendered as a link on the lead (R3 L-23a). */
function webUrlOrBlank(raw: string): string {
  const url = normaliseUrl(raw)
  return url && isWebUrl(url) ? url : ''
}

/** A draft from flat fields, or null when there is no way to reach the person (no email and no phone). */
export function draftFromFields(body: Obj, source: CaptureSource, opts: { externalId?: string | null; extraTags?: readonly string[] } = {}): LeadDraft | null {
  const first = pick(body, NAME_KEYS, 120)
  const last = pick(body, ['last_name', 'surname'], 80)
  const contactName = [first, last && !first.includes(last) ? last : ''].filter(Boolean).join(' ').slice(0, 120)
  const emailRaw = pick(body, EMAIL_KEYS, 200).toLowerCase()
  const email = EMAIL.test(emailRaw) ? emailRaw : ''
  const phone = normalizePhone(pick(body, PHONE_KEYS, 30)) ?? ''
  if (!email && !phone) return null
  const company = pick(body, COMPANY_KEYS, 120)
  const message = pick(body, MESSAGE_KEYS, 2000)
  const notes = [message, ...extras(body)].filter(Boolean).join('\n').slice(0, 4000)
  return {
    companyName: (company || contactName || email || phone).slice(0, 120),
    contactName,
    email,
    phone,
    website: webUrlOrBlank(pick(body, WEBSITE_KEYS, 200)),
    notes,
    source,
    tags: [...new Set([...tagsOf(body.tags ?? body.tag), ...tagsOf([...(opts.extraTags ?? [])])])].slice(0, 10),
    utm: utmOf(body),
    externalId: opts.externalId ? opts.externalId.slice(0, 120) : null,
  }
}

/** Meta lead ads: `field_data: [{ name, values: [...] }]` (as Zapier, Make and Meta's own webhook pass it on). */
function flattenFieldData(body: Obj): Obj | null {
  const fields = Array.isArray(body.field_data) ? body.field_data : null
  if (!fields) return null
  const flat: Obj = {}
  for (const f of fields) {
    const row = obj(f)
    const name = text(row.name, 60)
    const value = Array.isArray(row.values) ? text(row.values[0], 500) : text(row.value, 500)
    if (name && value) flat[name] = value
  }
  return flat
}

/** JustDial's lead push names its fields leadid, prefix, name, mobile, email, category, city, area. */
const isJustDial = (body: Obj): boolean => 'leadid' in body && ('mobile' in body || 'category' in body)

/**
 * A generic webhook body as a lead: Meta lead ads, JustDial, or any flat JSON
 * (Zapier-style). A wrapper `{ data: {...} }` or `{ lead: {...} }` is opened.
 */
export function draftFromWebhook(raw: unknown): LeadDraft | null {
  const root = obj(raw)
  const body = Object.keys(obj(root.lead)).length ? obj(root.lead) : Object.keys(obj(root.data)).length && !root.field_data ? obj(root.data) : root
  const meta = flattenFieldData(body)
  if (meta) return draftFromFields({ ...meta, utm: body.utm }, 'meta_lead_ads', { externalId: text(body.leadgen_id ?? body.id, 120) || null, extraTags: [text(body.campaign_name ?? body.ad_name, 40)].filter(Boolean) })
  if (isJustDial(body)) {
    const extra = [text(body.category, 80) && `Category: ${text(body.category, 80)}`, [text(body.area, 80), text(body.city, 80)].filter(Boolean).join(', ')].filter(Boolean).join('\n')
    return draftFromFields({ name: [text(body.prefix, 10), text(body.name, 100)].filter(Boolean).join(' '), mobile: body.mobile ?? body.phone, email: body.email, company: body.company, message: extra }, 'justdial', { externalId: text(body.leadid, 120) || null })
  }
  return draftFromFields(body, 'webhook', { externalId: text(body.external_id ?? body.lead_id, 120) || null })
}
