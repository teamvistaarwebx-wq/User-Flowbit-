/**
 * WhatsApp A templates (console spec 10): the registry kept in
 * ConsoleSettings and the rendering of one send into Interakt's template
 * fields. Pure and client-safe.
 *
 * Templates are created and approved in Interakt/Meta by the owner (Interakt
 * has no public template API); docs/WHATSAPP-TEMPLATES.md holds the text.
 * The registry maps each Flowbit message to the approved template's name,
 * language and the order of its body variables.
 */

export const WA_CATEGORIES = ['utility', 'authentication', 'marketing', 'service'] as const
export type WaCategory = (typeof WA_CATEGORIES)[number]

export const WA_TEMPLATE_KEYS = ['bill_with_pdf', 'payment_link', 'renewal_reminder', 'due_reminder', 'payment_received', 'otp'] as const
export type WaTemplateKey = (typeof WA_TEMPLATE_KEYS)[number]

/** What a template carries besides its body: a PDF header, a URL button with a dynamic suffix, or a copy-code button (OTP). */
export type WaTemplateShape = Readonly<{ category: WaCategory; header: 'none' | 'document'; button: 'none' | 'url' | 'copy_code'; variables: readonly string[]; label: string }>

/** Fixed by the code: the category, header, button and which variables a template may use. */
export const WA_TEMPLATE_SHAPES: Readonly<Record<WaTemplateKey, WaTemplateShape>> = {
  bill_with_pdf: { label: 'Bill with PDF', category: 'utility', header: 'document', button: 'url', variables: ['name', 'number', 'amount', 'dueDate'] },
  payment_link: { label: 'Payment link', category: 'utility', header: 'none', button: 'url', variables: ['name', 'number', 'amount'] },
  renewal_reminder: { label: 'Renewal reminder', category: 'utility', header: 'none', button: 'url', variables: ['name', 'workspace', 'date', 'amount'] },
  due_reminder: { label: 'Due reminder', category: 'utility', header: 'none', button: 'url', variables: ['name', 'number', 'amount', 'dueDate'] },
  payment_received: { label: 'Payment received', category: 'utility', header: 'document', button: 'none', variables: ['name', 'amount', 'number'] },
  otp: { label: 'Login / verification code', category: 'authentication', header: 'none', button: 'copy_code', variables: ['code'] },
}

export type WaTemplateDef = Readonly<{ name: string; language: string; params: readonly string[] }>
export type WaTemplateRegistry = Readonly<Record<WaTemplateKey, WaTemplateDef>>

/** Default names: what docs/WHATSAPP-TEMPLATES.md tells the owner to create. */
export const DEFAULT_WA_TEMPLATES: WaTemplateRegistry = {
  bill_with_pdf: { name: 'flowbit_bill_pdf', language: 'en', params: ['name', 'number', 'amount', 'dueDate'] },
  payment_link: { name: 'flowbit_payment_link', language: 'en', params: ['name', 'number', 'amount'] },
  renewal_reminder: { name: 'flowbit_renewal_reminder', language: 'en', params: ['name', 'workspace', 'date', 'amount'] },
  due_reminder: { name: 'flowbit_due_reminder', language: 'en', params: ['name', 'number', 'amount', 'dueDate'] },
  payment_received: { name: 'flowbit_payment_received', language: 'en', params: ['name', 'amount', 'number'] },
  otp: { name: 'flowbit_otp', language: 'en', params: ['code'] },
}

/** Interakt Growth cost per message, rupees ex-GST (V2-PLAN §7, checked 7 Oct 2026). Console data: rates change. */
export type WaRates = Readonly<Record<WaCategory, number>>
export const DEFAULT_WA_RATES: WaRates = { marketing: 0.958, utility: 0.15, authentication: 0.128, service: 0.128 }

/** Paise one message costs (fractional paise kept: ₹0.128 → 12.8). */
export const messageCostPaise = (category: WaCategory, rates: WaRates): number => Math.round(rates[category] * 100 * 1000) / 1000

/** Stored registry merged over the defaults; a bad name, language or variable list falls back. */
export function mergeWaTemplates(stored: unknown): WaTemplateRegistry {
  const source = (stored && typeof stored === 'object' ? stored : {}) as Record<string, Partial<WaTemplateDef> | undefined>
  const entries = WA_TEMPLATE_KEYS.map((key): [WaTemplateKey, WaTemplateDef] => {
    const got = source[key]
    const base = DEFAULT_WA_TEMPLATES[key]
    const allowed = WA_TEMPLATE_SHAPES[key].variables
    const params = Array.isArray(got?.params) && got.params.length > 0 && got.params.every((p) => typeof p === 'string' && allowed.includes(p)) ? got.params : base.params
    return [key, {
      name: typeof got?.name === 'string' && /^[a-z0-9_]{1,512}$/.test(got.name) ? got.name : base.name,
      language: typeof got?.language === 'string' && /^[a-z]{2}(_[A-Z]{2})?$/.test(got.language) ? got.language : base.language,
      params: [...params],
    }]
  })
  return Object.fromEntries(entries) as Record<WaTemplateKey, WaTemplateDef>
}

export function mergeWaRates(stored: unknown): WaRates {
  const source = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  return Object.fromEntries(WA_CATEGORIES.map((c) => {
    const v = source[c]
    return [c, typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100 ? v : DEFAULT_WA_RATES[c]]
  })) as Record<WaCategory, number>
}

// ---------------------------------------------------------------------------
// One send: values → the template name + flat params stored on the Message
// ---------------------------------------------------------------------------

/** Keys of Message.params for a WhatsApp template send (decoded by the Interakt provider). No dots: MongoDB field names. */
export const WA_PARAM = { language: '_lang', category: '_category', headerUrl: 'header_url', headerFile: 'header_fileName', button: 'button_0', quickReply: 'qr_' } as const
const bodyKey = (index: number) => `body_${index + 1}`

/** The params that carry a one-time code (masked on the stored message once sent). */
export const otpParamKeys = (): string[] => [bodyKey(0), WA_PARAM.button]

/**
 * `payloads`: what each quick-reply button sends back to the webhook, in the
 * template's button order (an Approve / Reject action link, a quote to
 * accept). Missing payloads are simply not sent; the button then echoes its
 * own text and the webhook answers "open Flowbit".
 */
export type WaExtras = Readonly<{ headerUrl?: string; fileName?: string; buttonValue?: string; payloads?: readonly string[] }>
export type RenderedWa = Readonly<{ template: string; params: Readonly<Record<string, string>>; category: WaCategory }>

/** The template name and params for `key`; throws when a variable or a required header/button value is missing. */
export function renderWaTemplate(key: WaTemplateKey, registry: WaTemplateRegistry, values: Readonly<Record<string, string>>, extras: WaExtras = {}): RenderedWa {
  return renderWithShape(key, registry[key], WA_TEMPLATE_SHAPES[key], values, extras)
}

/**
 * Quick-reply payloads as flat params keyed by the button's index in the
 * template ('qr_1', 'qr_2'): the URL button, when there is one, comes first.
 */
function quickReplyParams(shape: Pick<WaTemplateShape, 'button'> & Readonly<{ quickReplies?: readonly string[] }>, payloads: readonly string[] | undefined): Record<string, string> {
  const count = shape.quickReplies?.length ?? 0
  if (!count || !payloads?.length) return {}
  const first = shape.button === 'none' ? 0 : 1
  return Object.fromEntries(payloads.slice(0, count).map((payload, i) => [`${WA_PARAM.quickReply}${first + i}`, payload.slice(0, 256)]))
}

/** WhatsApp variables may not hold new lines, tabs or more than 4 spaces in a row (Meta refuses the send). */
export const cleanWaValue = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim()

/** Renders any template from its definition and shape (WhatsApp A's registry and the workspace templates of WhatsApp B). */
export function renderWithShape(key: string, def: WaTemplateDef, shape: Pick<WaTemplateShape, 'category' | 'header' | 'button'> & Readonly<{ quickReplies?: readonly string[] }>, values: Readonly<Record<string, string>>, extras: WaExtras = {}): RenderedWa {
  const missing = def.params.filter((p) => !values[p]?.trim())
  if (shape.header === 'document' && (!extras.headerUrl || !extras.fileName)) missing.push('header document')
  if (shape.button !== 'none' && !extras.buttonValue) missing.push('button value')
  if (missing.length) throw new Error(`WhatsApp template ${key} is missing: ${missing.join(', ')}`)
  const params: Record<string, string> = {
    [WA_PARAM.language]: def.language,
    [WA_PARAM.category]: shape.category,
    ...Object.fromEntries(def.params.map((p, i) => [bodyKey(i), cleanWaValue(values[p])])),
    ...(shape.header === 'document' ? { [WA_PARAM.headerUrl]: extras.headerUrl!, [WA_PARAM.headerFile]: extras.fileName! } : {}),
    ...(shape.button !== 'none' ? { [WA_PARAM.button]: extras.buttonValue! } : {}),
    ...quickReplyParams(shape, extras.payloads),
  }
  return { template: def.name, params, category: shape.category }
}

export type DecodedWa = Readonly<{ language: string; category: WaCategory; bodyValues: string[]; headerUrl?: string; fileName?: string; buttonValue?: string; quickReplies?: Readonly<Record<string, string>> }>

/** Reads the flat params back (the provider side). */
export function decodeWaParams(params: Readonly<Record<string, string>> | undefined): DecodedWa {
  const p = params ?? {}
  const bodyValues: string[] = []
  for (let i = 0; p[bodyKey(i)] !== undefined; i += 1) bodyValues.push(p[bodyKey(i)])
  const category = (WA_CATEGORIES as readonly string[]).includes(p[WA_PARAM.category] ?? '') ? (p[WA_PARAM.category] as WaCategory) : 'utility'
  const quickReplies = Object.fromEntries(Object.entries(p).filter(([k]) => /^qr_\d+$/.test(k)).map(([k, v]) => [k.slice(WA_PARAM.quickReply.length), v]))
  return {
    language: p[WA_PARAM.language] || 'en',
    category,
    bodyValues,
    ...(p[WA_PARAM.headerUrl] ? { headerUrl: p[WA_PARAM.headerUrl], fileName: p[WA_PARAM.headerFile] || 'document.pdf' } : {}),
    ...(p[WA_PARAM.button] ? { buttonValue: p[WA_PARAM.button] } : {}),
    ...(Object.keys(quickReplies).length ? { quickReplies } : {}),
  }
}
