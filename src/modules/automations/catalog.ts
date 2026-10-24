import type { ProductKey } from '@/lib/catalog'
import type { OffsetUnit, RecipientType, SourceKey } from './types'

/**
 * Everything a rule can start from (pure, client-safe): events and time
 * sources, what each one offers to the wording ({{variables}}) and to
 * conditions, who it can reach, which product it needs and which
 * notification group its alerts land in. Recipes, the editor, the custom
 * rule builder and the validator all read this one table.
 */

export type TriggerDef = Readonly<{
  label: string
  /** For date sources: what the offset counts from ("its due date"). */
  field?: string
  /** For sources: what one record is ("an unpaid invoice"). */
  noun?: string
  product: ProductKey
  variables: readonly string[]
  /** Values only conditions test (amounts in paise, statuses). */
  conditionFields?: readonly string[]
  /** Who an action can address for records of this trigger. */
  recipients: readonly RecipientType[]
  /** The notification group key ('<area>.<event>') of alerts it raises. */
  alertEvent: string
  /** Date sources: the units an offset may use. Absent: not usable as a date trigger. */
  units?: readonly OffsetUnit[]
  /** Usable as a schedule (daily / weekly / monthly at a time). */
  schedulable?: boolean
}>

const CLIENT = ['client_name', 'business_name']
const INVOICE = [...CLIENT, 'invoice_number', 'invoice_total', 'balance_due', 'due_date', 'document_link']
const QUOTE = [...CLIENT, 'quote_number', 'quote_total', 'valid_until', 'document_link']
const PAYMENT = [...CLIENT, 'amount', 'invoice_number', 'balance_due', 'receipt_number', 'receipt_link', 'payment_date']
const LEAD = ['lead_name', 'company_name', 'lead_source', 'lead_phone', 'lead_email', 'assignee_name', 'business_name']
const DEAL = ['deal_title', 'deal_value', 'owner_name', 'stage_name', 'days_idle', 'business_name']
const EMPLOYEE = ['employee_name', 'business_name']
const ADMINS: readonly RecipientType[] = ['owner', 'hr']

export const EVENT_TRIGGERS: Readonly<Record<string, TriggerDef>> = {
  'payment.received': { label: 'A payment is received or a receipt recorded', product: 'folio', variables: PAYMENT, conditionFields: ['balance_due_paise', 'amount_paise'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation' },
  'invoice.issued': { label: 'An invoice is issued', product: 'folio', variables: INVOICE, conditionFields: ['balance_due_paise'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation' },
  'quote.accepted': { label: 'A client accepts a quote online', product: 'folio', variables: [...QUOTE, 'accepted_by', 'comment'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation' },
  'payment.utr_shared': { label: 'A client shares a UTR on the invoice page', product: 'folio', variables: [...INVOICE, 'utr', 'amount'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation' },
  'invoice.recurring_generated': { label: 'Retainer drafts are created', product: 'folio', variables: ['business_name', 'draft_count', 'month'], recipients: ['owner', 'accountant'], alertEvent: 'folio.automation' },
  'lead.created': { label: 'A new lead arrives (form, webhook, IndiaMART, WhatsApp)', product: 'orbit', variables: [...LEAD, 'utm_campaign'], recipients: ['lead', 'assignee', 'owner', 'sales_manager'], alertEvent: 'orbit.lead_assigned' },
  'deal.won': { label: 'A deal is won', product: 'orbit', variables: DEAL, recipients: ['owner', 'assignee', 'sales_manager', 'team'], alertEvent: 'orbit.deal_won' },
  'payslip.published': { label: 'A payslip is published', product: 'muster', variables: [...EMPLOYEE, 'month'], recipients: ['employee', 'hr'], alertEvent: 'payroll.payslip_published' },
}

export const SOURCE_TRIGGERS: Readonly<Record<SourceKey, TriggerDef>> = {
  invoice_due: { label: 'Invoice due date', noun: 'an unpaid invoice', field: 'its due date', product: 'folio', variables: [...INVOICE, 'days_overdue'], conditionFields: ['balance_due_paise'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation', units: ['days'] },
  quote_sent: { label: 'Quote sent', noun: 'a sent quote', field: 'the day it was sent', product: 'folio', variables: QUOTE, conditionFields: ['quote_status'], recipients: ['client', 'owner'], alertEvent: 'folio.automation', units: ['hours', 'days'] },
  quote_valid_until: { label: 'Quote expiry', noun: 'an open quote', field: 'its expiry', product: 'folio', variables: QUOTE, conditionFields: ['quote_status'], recipients: ['client', 'owner'], alertEvent: 'folio.automation', units: ['days'] },
  clients_with_dues: { label: 'Clients who owe money', noun: 'each client who owes money', product: 'folio', variables: [...CLIENT, 'total_due', 'statement_link'], recipients: ['client', 'owner', 'accountant'], alertEvent: 'folio.automation', schedulable: true },
  task_due: { label: 'Task due date', noun: 'an open task', field: 'its due date', product: 'work', variables: ['task_title', 'days_late', 'assignee_name', 'project_name'], recipients: ['manager', 'owner'], alertEvent: 'task.overdue', units: ['days'] },
  approval_requested: { label: 'Leave request waiting', noun: 'a pending leave request', field: 'the time it was asked', product: 'muster', variables: ['employee_name', 'request_summary', 'hours_pending'], recipients: ['approver', 'escalation', 'hr'], alertEvent: 'leave.requested', units: ['hours', 'days'] },
  meeting_start: { label: 'Meeting start', noun: 'a meeting', field: 'its start', product: 'work', variables: ['meeting_title', 'meeting_time'], recipients: ['attendees'], alertEvent: 'meeting.reminder', units: ['minutes', 'hours'] },
  lead_created: { label: 'New lead not contacted', noun: 'a new lead nobody has contacted', field: 'the time it arrived', product: 'orbit', variables: LEAD, conditionFields: ['lead_stage', 'contacted'], recipients: ['assignee', 'sales_manager', 'owner'], alertEvent: 'orbit.lead_nudge', units: ['minutes', 'hours'] },
  deal_stage_idle: { label: 'Deal idle in a stage', noun: 'an open deal with no change', field: 'its last stage change', product: 'orbit', variables: DEAL, conditionFields: ['days_idle'], recipients: ['assignee', 'sales_manager', 'owner'], alertEvent: 'orbit.deal_idle', units: ['days'] },
  attendance_unmarked: { label: 'Attendance not marked today', noun: 'each employee who has not checked in', product: 'muster', variables: EMPLOYEE, recipients: ['employee', 'manager', 'hr'], alertEvent: 'attendance.nudge', schedulable: true },
  checkout_missing: { label: 'Checked in but not out', noun: 'each employee still checked in', product: 'muster', variables: [...EMPLOYEE, 'checked_in_at'], recipients: ['employee', 'manager'], alertEvent: 'attendance.nudge', schedulable: true },
  employee_birthday: { label: 'Birthday', noun: 'an employee', field: 'their birthday', product: 'muster', variables: EMPLOYEE, recipients: ['employee', 'team', ...ADMINS], alertEvent: 'greetings.birthday', units: ['days'] },
  employee_anniversary: { label: 'Work anniversary', noun: 'an employee', field: 'their work anniversary', product: 'muster', variables: [...EMPLOYEE, 'years'], recipients: ['employee', 'team', ...ADMINS], alertEvent: 'greetings.anniversary', units: ['days'] },
  employee_joining: { label: 'Joining date', noun: 'a new joiner', field: 'their joining date', product: 'muster', variables: [...EMPLOYEE, 'join_date', 'manager_name'], recipients: ['employee', 'manager', 'hr'], alertEvent: 'people.joining', units: ['days'] },
  onboarding_incomplete: { label: 'Joining checklist incomplete', noun: 'each new joiner whose checklist is not complete', product: 'muster', variables: [...EMPLOYEE, 'checklist_percent', 'missing_items'], conditionFields: ['checklist_percent'], recipients: ['employee', 'hr'], alertEvent: 'people.onboarding', schedulable: true },
  probation_end: { label: 'Probation end', noun: 'an employee on probation', field: 'the end of probation', product: 'muster', variables: [...EMPLOYEE, 'probation_end', 'manager_name'], recipients: ['hr', 'manager', 'owner'], alertEvent: 'people.probation', units: ['days'] },
  document_expiry: { label: 'Document expiry', noun: 'an ID, contract or visa on file', field: 'its expiry date', product: 'muster', variables: [...EMPLOYEE, 'document_type', 'expires_on'], recipients: ['hr', 'employee', 'owner'], alertEvent: 'people.document_expiry', units: ['days'] },
  compliance_due: { label: 'Statutory due date', noun: 'a statutory due date', field: 'its due date', product: 'folio', variables: ['item_label', 'period', 'due_date', 'business_name', 'note'], recipients: ['owner', 'accountant'], alertEvent: 'compliance.due', units: ['days'] },
}

/** Recipients a message (not an alert) can go to. */
export const isContactRecipient = (r: RecipientType): boolean => r === 'client' || r === 'lead' || r === 'employee'

export type TriggerLike = Readonly<{ type: string; event?: string; source?: SourceKey }>

export function triggerDef(trigger: TriggerLike): TriggerDef | null {
  if (trigger.type === 'event') return (trigger.event && EVENT_TRIGGERS[trigger.event]) || null
  return (trigger.source && SOURCE_TRIGGERS[trigger.source]) || null
}
