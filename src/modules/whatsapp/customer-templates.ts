import { renderWithShape, WA_CATEGORIES, type RenderedWa, type WaCategory, type WaExtras, type WaTemplateDef } from './templates'

/**
 * WhatsApp B templates: the Flowbit template pack a workspace creates in its
 * own Interakt account (docs/WHATSAPP-TEMPLATES-CUSTOMER.md has the text to
 * paste) and its per-workspace mapping (name, language, category, the order
 * of the body variables). Pure and client-safe.
 *
 * URL buttons are `https://<Flowbit host>/{{1}}`: the suffix is a path such
 * as `d/<token>` (a public document link) or `app/work/tasks/<id>`.
 */

export const CUSTOMER_TEMPLATE_KEYS = [
  'invoice_share',
  'quote_share',
  'credit_note_share',
  'receipt_thanks',
  'reminder_before',
  'reminder_due',
  'reminder_overdue',
  'statement',
  'task_alert',
  'task_due',
  'approval_pending',
  'morning_brief',
  'meeting_reminder',
  'leave_decision',
  'payslip_ready',
  'contact_followup',
  'greeting',
] as const
export type CustomerTemplateKey = (typeof CUSTOMER_TEMPLATE_KEYS)[number]

export type CustomerTemplateShape = Readonly<{
  label: string
  group: 'money' | 'team' | 'sales'
  category: WaCategory
  header: 'none' | 'document'
  button: 'none' | 'url'
  /** The button's label in the pack ("View invoice"). */
  buttonLabel?: string
  /** Quick-reply buttons after the URL button, in order; each press sends its payload back to the webhook (§2.5). */
  quickReplies?: readonly string[]
  /** Variables in the pack's order ({{1}}, {{2}}…). */
  variables: readonly string[]
  /** The pack's English body, for the preview in send dialogs. */
  body: string
}>

export const CUSTOMER_TEMPLATE_SHAPES: Readonly<Record<CustomerTemplateKey, CustomerTemplateShape>> = {
  invoice_share: { label: 'Invoice', group: 'money', category: 'utility', header: 'document', button: 'url', buttonLabel: 'View invoice', quickReplies: ["I've paid"], variables: ['name', 'business', 'number', 'amount', 'dueDate'], body: 'Hi {{name}}, {{business}} has sent you invoice {{number}} for {{amount}}, due on {{dueDate}}. The PDF is attached. Tap View invoice to see it online or pay.' },
  quote_share: { label: 'Quote or proforma', group: 'money', category: 'utility', header: 'document', button: 'url', buttonLabel: 'View quote', quickReplies: ['Accept'], variables: ['name', 'business', 'number', 'amount', 'validUntil'], body: 'Hi {{name}}, {{business}} has sent you {{number}} for {{amount}}, valid until {{validUntil}}. The PDF is attached. Tap View quote to see it or accept it online.' },
  credit_note_share: { label: 'Credit note', group: 'money', category: 'utility', header: 'document', button: 'url', buttonLabel: 'View credit note', variables: ['name', 'business', 'number', 'amount'], body: 'Hi {{name}}, {{business}} has issued credit note {{number}} for {{amount}}. The PDF is attached.' },
  receipt_thanks: { label: 'Receipt and thank-you', group: 'money', category: 'utility', header: 'document', button: 'url', buttonLabel: 'View receipt', variables: ['name', 'business', 'amount', 'number'], body: 'Hi {{name}}, thank you. {{business}} has received {{amount}} against {{number}}. Your receipt is attached.' },
  reminder_before: { label: 'Reminder before the due date', group: 'money', category: 'utility', header: 'none', button: 'url', buttonLabel: 'View and pay', quickReplies: ["I've paid"], variables: ['name', 'business', 'number', 'amount', 'dueDate'], body: 'Hi {{name}}, a reminder from {{business}}: invoice {{number}} for {{amount}} is due on {{dueDate}}.' },
  reminder_due: { label: 'Reminder on the due date', group: 'money', category: 'utility', header: 'none', button: 'url', buttonLabel: 'View and pay', quickReplies: ["I've paid"], variables: ['name', 'business', 'number', 'amount'], body: 'Hi {{name}}, a reminder from {{business}}: invoice {{number}} for {{amount}} is due today.' },
  reminder_overdue: { label: 'Overdue reminder', group: 'money', category: 'utility', header: 'none', button: 'url', buttonLabel: 'View and pay', quickReplies: ["I've paid"], variables: ['name', 'business', 'number', 'amount', 'days'], body: 'Hi {{name}}, a reminder from {{business}}: invoice {{number}} for {{amount}} is {{days}} days overdue. Please pay, or reply if something is holding it up.' },
  statement: { label: 'Statement of account', group: 'money', category: 'utility', header: 'document', button: 'url', buttonLabel: 'View statement', variables: ['name', 'business', 'date', 'amount'], body: 'Hi {{name}}, your statement from {{business}} as on {{date}} is attached. {{amount}} is due.' },
  task_alert: { label: 'Task and team update', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open in Flowbit', variables: ['name', 'update'], body: 'Hi {{name}}, {{update}}' },
  task_due: { label: 'Task due (Mark done / Snooze)', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open task', quickReplies: ['Mark done', 'Snooze 1 day'], variables: ['name', 'task'], body: 'Hi {{name}}, {{task}}' },
  approval_pending: { label: 'Approval waiting', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Review', quickReplies: ['Approve', 'Reject'], variables: ['name', 'item'], body: 'Hi {{name}}, waiting for your approval: {{item}}' },
  morning_brief: { label: 'Morning brief (short)', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open brief', variables: ['name', 'summary'], body: 'Good morning {{name}}. Today: {{summary}}' },
  meeting_reminder: { label: 'Meeting reminder', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open meeting', variables: ['name', 'meeting'], body: 'Hi {{name}}, reminder: {{meeting}}' },
  leave_decision: { label: 'Leave decision', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open request', variables: ['name', 'decision'], body: 'Hi {{name}}, {{decision}}' },
  payslip_ready: { label: 'Payslip ready (no amounts)', group: 'team', category: 'utility', header: 'none', button: 'url', buttonLabel: 'Open payslips', variables: ['name', 'business'], body: 'Hi {{name}}, your payslip from {{business}} is ready. Open Flowbit to see it; it is also in your email.' },
  greeting: { label: 'Birthday or anniversary wish (marketing)', group: 'team', category: 'marketing', header: 'none', button: 'none', variables: ['name', 'wish'], body: 'Hi {{name}}, {{wish}}' },
  contact_followup: { label: 'Hello / follow-up (sales)', group: 'sales', category: 'marketing', header: 'none', button: 'none', variables: ['name', 'sender', 'business'], body: 'Hello {{name}}, this is {{sender}} from {{business}}. Following up on your enquiry: reply here and we will take it from there.' },
}

export type CustomerTemplateDef = WaTemplateDef & Readonly<{ category: WaCategory }>
export type CustomerTemplateRegistry = Readonly<Record<CustomerTemplateKey, CustomerTemplateDef>>

/** The pack's names ('fb_invoice_share'): what the docs tell the workspace to create. */
export const DEFAULT_CUSTOMER_TEMPLATES: CustomerTemplateRegistry = Object.fromEntries(
  CUSTOMER_TEMPLATE_KEYS.map((k) => [k, { name: `fb_${k}`, language: 'en', category: CUSTOMER_TEMPLATE_SHAPES[k].category, params: [...CUSTOMER_TEMPLATE_SHAPES[k].variables] }]),
) as unknown as Record<CustomerTemplateKey, CustomerTemplateDef>

export const isCustomerTemplateKey = (value: unknown): value is CustomerTemplateKey => typeof value === 'string' && (CUSTOMER_TEMPLATE_KEYS as readonly string[]).includes(value)

const NAME = /^[a-z0-9_]{1,512}$/
const LANGUAGE = /^[a-z]{2}(_[A-Z]{2})?$/

/** One stored mapping row checked against its shape; null when it cannot be used. */
export function cleanTemplateDef(key: CustomerTemplateKey, raw: unknown): CustomerTemplateDef | null {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof CustomerTemplateDef, unknown>>
  const allowed = CUSTOMER_TEMPLATE_SHAPES[key].variables
  const params = Array.isArray(row.params) ? row.params : []
  if (typeof row.name !== 'string' || !NAME.test(row.name)) return null
  if (typeof row.language !== 'string' || !LANGUAGE.test(row.language)) return null
  if (!params.length || !params.every((p) => typeof p === 'string' && allowed.includes(p))) return null
  const category = (WA_CATEGORIES as readonly string[]).includes(String(row.category)) ? (row.category as WaCategory) : CUSTOMER_TEMPLATE_SHAPES[key].category
  return { name: row.name, language: row.language, category, params: params as string[] }
}

/** A workspace's stored mapping over the pack defaults; a bad row falls back to the default. */
export function mergeCustomerTemplates(stored: unknown): CustomerTemplateRegistry {
  const source = (Array.isArray(stored) ? Object.fromEntries(stored.map((r) => [(r as { key?: string })?.key, r])) : stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  return Object.fromEntries(CUSTOMER_TEMPLATE_KEYS.map((k) => [k, cleanTemplateDef(k, source[k]) ?? DEFAULT_CUSTOMER_TEMPLATES[k]])) as Record<CustomerTemplateKey, CustomerTemplateDef>
}

/** The template name and flat Message params for one send; throws when a value, the PDF or the button suffix is missing. */
export function renderCustomerTemplate(key: CustomerTemplateKey, registry: CustomerTemplateRegistry, values: Readonly<Record<string, string>>, extras: WaExtras = {}): RenderedWa {
  const def = registry[key]
  const shape = CUSTOMER_TEMPLATE_SHAPES[key]
  return renderWithShape(key, def, { ...shape, category: def.category }, values, extras)
}

/** The pack's text with the values filled in (send dialogs show it before sending). */
export function previewCustomerTemplate(key: CustomerTemplateKey, values: Readonly<Record<string, string>>): string {
  return CUSTOMER_TEMPLATE_SHAPES[key].body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name]?.trim() || `{{${name}}}`)
}

/**
 * The URL button suffix for a Flowbit URL: the path after the host, without
 * the leading slash ('https://app.x.com/d/abc.def' → 'd/abc.def'). Null for a
 * URL on another host.
 */
export function buttonSuffix(url: string, appBase: string): string | null {
  const base = appBase.replace(/\/$/, '')
  if (!url.startsWith(`${base}/`)) return null
  return url.slice(base.length + 1) || null
}

/** The reminder template for an invoice's position against its due date. */
export function reminderTemplateFor(daysOverdue: number): Extract<CustomerTemplateKey, 'reminder_before' | 'reminder_due' | 'reminder_overdue'> {
  if (daysOverdue > 0) return 'reminder_overdue'
  return daysOverdue === 0 ? 'reminder_due' : 'reminder_before'
}
