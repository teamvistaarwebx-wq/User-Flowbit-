/** Outbound webhook events (Zapier-friendly names). Pure, client-safe. */

export const WEBHOOK_EVENTS = ['task.created', 'task.completed', 'lead.created', 'deal.won', 'invoice.issued', 'invoice.paid'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export const WEBHOOK_EVENT_LABEL: Readonly<Record<WebhookEvent, string>> = {
  'task.created': 'A task is created',
  'task.completed': 'A task is completed',
  'lead.created': 'A lead is added',
  'deal.won': 'A deal is won',
  'invoice.issued': 'An invoice is issued',
  'invoice.paid': 'An invoice is paid in full',
}

export const isWebhookEvent = (value: unknown): value is WebhookEvent => typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value)

/** Automation events (modules/automations) that are also webhook events, and the data each carries. */
export function webhookFromAutomation(key: string, subject: { entityId: string; vars?: Record<string, unknown>; refs?: { href?: string } }): { event: WebhookEvent; data: Record<string, unknown> } | null {
  const v = subject.vars ?? {}
  const base = { id: subject.entityId, path: subject.refs?.href ?? null }
  if (key === 'lead.created') return { event: 'lead.created', data: { ...base, company: v.company_name ?? null, contact: v.lead_name ?? null, email: v.lead_email ?? null, phone: v.lead_phone ?? null, source: v.lead_source ?? null } }
  if (key === 'deal.won') return { event: 'deal.won', data: { ...base, title: v.deal_title ?? null, value: v.deal_value ?? null, owner: v.owner_name ?? null } }
  if (key === 'invoice.issued') return { event: 'invoice.issued', data: { ...base, number: v.invoice_number ?? null, client: v.client_name ?? null, total: v.invoice_total ?? null, due_date: v.due_date ?? null, link: v.document_link ?? null } }
  if (key === 'payment.received' && v.balance_due_paise === 0) return { event: 'invoice.paid', data: { ...base, number: v.invoice_number ?? null, client: v.client_name ?? null, total: v.invoice_total ?? null, last_payment: v.amount ?? null, paid_on: v.payment_date ?? null } }
  return null
}
