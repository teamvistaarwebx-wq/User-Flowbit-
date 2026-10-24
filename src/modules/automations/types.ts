/**
 * Automation rules (notifications-v2 §3.1): "when X happens, send Y to Z
 * through channel C after delay D if condition K". Shared by the engine, the
 * recipes, the model and the editor. Pure.
 */

export const TRIGGER_TYPES = ['event', 'date', 'schedule'] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

/** Where date and schedule triggers find their records (modules/automations/sources). */
export const SOURCE_KEYS = [
  'invoice_due', 'quote_sent', 'quote_valid_until', 'task_due', 'approval_requested', 'meeting_start', 'clients_with_dues',
  'lead_created', 'deal_stage_idle',
  'attendance_unmarked', 'checkout_missing', 'employee_birthday', 'employee_anniversary', 'employee_joining', 'onboarding_incomplete', 'probation_end', 'document_expiry',
  'compliance_due',
] as const
export type SourceKey = (typeof SOURCE_KEYS)[number]

export const OFFSET_UNITS = ['minutes', 'hours', 'days'] as const
export type OffsetUnit = (typeof OFFSET_UNITS)[number]

export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export type Trigger = Readonly<{
  type: TriggerType
  /** event: 'payment.received', 'quote.accepted', … */
  event?: string
  /** date and schedule: where the records come from. */
  source?: SourceKey
  /** date: run this long after (+) or before (−) the record's date. */
  offset?: number
  unit?: OffsetUnit
  /** schedule */
  frequency?: Frequency
  /** weekly: 0–6 (Sunday 0); monthly: 1–28. */
  day?: number
  /** schedule: IST 'HH:MM'. */
  time?: string
}>

export const CONDITION_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty'] as const
export type ConditionOp = (typeof CONDITION_OPS)[number]

export type Condition = Readonly<{ field: string; op: ConditionOp; value?: string | number | null }>

export const ACTION_TYPES = ['message', 'task', 'notify', 'post'] as const
export type ActionType = (typeof ACTION_TYPES)[number]
/** Steps the custom rule builder offers; 'post' (a feed post) comes only with the People recipes. */
export const CUSTOM_ACTION_TYPES = ['message', 'task', 'notify'] as const satisfies readonly ActionType[]
/** What a 'post' step publishes in Work → Posts. */
export const POST_ACTION_TYPES = ['celebration', 'welcome'] as const

/** message: the client, the lead or the employee (email or WhatsApp). notify / task: people in the workspace. */
export const RECIPIENTS = ['client', 'lead', 'employee', 'owner', 'assignee', 'manager', 'attendees', 'approver', 'escalation', 'hr', 'sales_manager', 'accountant', 'team'] as const

/** Recipients outside the workspace's logins: a `message` action writes to them. */
export const CONTACT_RECIPIENTS = ['client', 'lead', 'employee'] as const satisfies readonly RecipientType[]
export type RecipientType = (typeof RECIPIENTS)[number]

export const MESSAGE_CHANNELS = ['email', 'whatsapp'] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export type AutomationAction = Readonly<{
  type: ActionType
  recipient: RecipientType
  /** message only. WhatsApp falls back to email until WhatsApp is connected. */
  channel?: MessageChannel
  /** message: email subject. notify / task: the title. */
  subject?: string
  body: string
  /** task: due this many days after the run. */
  dueInDays?: number
  /** post: the feed post type. */
  postType?: (typeof POST_ACTION_TYPES)[number]
}>

/** The editable part of a rule; recipes ship these as defaults. */
export type RuleSpec = Readonly<{
  trigger: Trigger
  conditions: readonly Condition[]
  actions: readonly AutomationAction[]
  delayMinutes: number
  businessHoursOnly: boolean
  /** Most messages one client contact gets from automations in a day; 0 = no cap. */
  dailyCapPerContact: number
}>

/** Values a template can use ({{client_name}}) and conditions can test. */
export type Vars = Readonly<Record<string, string | number | null | undefined>>

/** Who a run is about: the client and the workspace people per recipient type (User ids). */
export type RunRefs = Readonly<{
  clientId?: string
  /** Links a created follow-up to the invoice. */
  invoiceId?: string
  /** A lead (message the lead). */
  leadId?: string
  /** An employee (message or alert the employee, even before they have a login). */
  employeeId?: string
  /** Where an alert opens in the app. */
  href?: string
  users?: Readonly<Partial<Record<RecipientType, readonly string[]>>>
}>

/** One record a trigger fired for. `occurrence` separates repeats on one record (each payment, each month). */
export type RunSubject = Readonly<{ entity: string; entityId: string; occurrence?: string; vars: Vars; refs: RunRefs; at?: Date }>
