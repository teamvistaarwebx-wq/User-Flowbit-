import { EVENT_TRIGGERS, SOURCE_TRIGGERS } from './catalog'
import type { AutomationAction, Condition, RuleSpec, SourceKey, Trigger, Vars } from './types'

/**
 * Ready recipes (notifications-v2 §3.2: Money, Team, Sales, People and
 * Business compliance). Each workspace gets one rule per recipe the first
 * time Settings → Automations opens (or an event fires); the owner can
 * switch it, reword it and retime it. English defaults; Hindi wording (a
 * draft for review) is in ./recipes-hi.
 */

export const RECIPE_AREAS = ['money', 'team', 'sales', 'people', 'compliance'] as const
export type RecipeArea = (typeof RECIPE_AREAS)[number]

export type Recipe = Readonly<{
  key: string
  area: RecipeArea
  name: string
  description: string
  defaultEnabled: boolean
  spec: RuleSpec
  /** Variables the wording may use (chips in the editor). */
  variables: readonly string[]
  /** Values for the live preview and "Test on me". */
  sample: Vars
  /** Runs elsewhere and is only switched from here: the Folio reminder schedule keeps its own engine. */
  bridge?: 'folio_reminders'
}>

const CLIENT_VARS = ['client_name', 'business_name'] as const
const INVOICE_VARS = [...CLIENT_VARS, 'invoice_number', 'invoice_total', 'balance_due', 'due_date', 'document_link'] as const
const PAYMENT_VARS = [...CLIENT_VARS, 'amount', 'invoice_number', 'balance_due', 'receipt_number', 'receipt_link', 'payment_date'] as const
const QUOTE_VARS = [...CLIENT_VARS, 'quote_number', 'quote_total', 'valid_until', 'document_link'] as const

const SAMPLE: Vars = {
  client_name: 'Ravi Kumar',
  business_name: 'Your business',
  invoice_number: 'INV/2026-27/0042',
  invoice_total: '₹1,18,000.00',
  amount: '₹50,000.00',
  balance_due: '₹68,000.00',
  balance_due_paise: 6800000,
  due_date: '20 Oct 2026',
  days_overdue: 31,
  document_link: 'https://app.flowbit.in/d/sample',
  receipt_number: 'RCT/2026-27/0013',
  receipt_link: 'https://app.flowbit.in/d/sample-receipt',
  payment_date: '8 Oct 2026',
  quote_number: 'QT/2026-27/0007',
  quote_total: '₹2,40,000.00',
  quote_status: 'sent',
  valid_until: '15 Oct 2026',
  accepted_by: 'Ravi Kumar',
  comment: 'Please start next week.',
  utr: '412345678901',
  total_due: '₹1,86,000.00',
  statement_link: 'https://app.flowbit.in/d/sample-statement',
  task_title: 'Homepage redesign',
  days_late: 3,
  assignee_name: 'Asha',
  project_name: 'Website',
  employee_name: 'Asha Verma',
  request_summary: 'Casual leave, 12–13 Oct',
  hours_pending: 26,
  meeting_title: 'Weekly review',
  meeting_time: '3:00 pm',
  lead_name: 'Neha Shah',
  company_name: 'Shah Interiors',
  lead_source: 'Website form',
  lead_phone: '+91 98765 43210',
  lead_email: 'neha@shahinteriors.in',
  utm_campaign: 'diwali',
  contacted: 'no',
  lead_stage: 'new',
  deal_title: 'Website revamp',
  deal_value: '₹3,50,000.00',
  owner_name: 'Ravi',
  stage_name: 'Proposal sent',
  days_idle: 7,
  manager_name: 'Ravi Kumar',
  join_date: '12 Oct 2026',
  years: 3,
  checklist_percent: 60,
  missing_items: 'PAN card, Signed offer letter',
  probation_end: '31 Oct 2026',
  document_type: 'Passport',
  expires_on: '7 Nov 2026',
  checked_in_at: '9:42 am',
  month: 'September 2026',
  item_label: 'GSTR-3B',
  period: 'Sep 2026',
  note: 'Verify the date before you rely on it.',
}

const event = (key: string): Trigger => ({ type: 'event', event: key })
const date = (source: Trigger['source'], offset: number, unit: Trigger['unit'] = 'days'): Trigger => ({ type: 'date', source, offset, unit })
const spec = (trigger: Trigger, actions: AutomationAction[], conditions: Condition[] = [], extra: Partial<RuleSpec> = {}): RuleSpec => ({
  trigger,
  conditions,
  actions,
  delayMinutes: 0,
  businessHoursOnly: false,
  dailyCapPerContact: 3,
  ...extra,
})

const SIGN_OFF = '\n\nThanks,\n{{business_name}}'

/** The wording variables a trigger offers (catalog.ts), for the editor's chips and typo check. */
const vars = (trigger: string | { source: SourceKey }): string[] => [...(typeof trigger === 'string' ? (EVENT_TRIGGERS[trigger]?.variables ?? []) : SOURCE_TRIGGERS[trigger.source].variables)]

/**
 * Recipe names that changed after workspaces had already saved a copy (seed.ts never rewrites a saved rule).
 * A saved name still equal to the old default shows as the new one (audit A5: the wish recipes send an alert,
 * not a post).
 */
export const RENAMED_RECIPE_NAMES: Readonly<Record<string, string>> = {
  'Birthday → wish + team post': 'Birthday → wish + team alert',
  'Work anniversary → wish + team post': 'Work anniversary → wish + team alert',
  'Deal won → team post + owner alert': 'Deal won → team alert + owner alert',
}

/** A saved rule's name as the app shows it: an untouched old recipe name reads as the current one. */
export const displayRuleName = (name: string): string => RENAMED_RECIPE_NAMES[name] ?? name

export const RECIPES: readonly Recipe[] = [
  {
    key: 'payment_thank_you',
    area: 'money',
    name: 'Payment received → thank-you',
    description: 'When an invoice is paid in full (online or a receipt you record), thank the client with the amount and the receipt link.',
    defaultEnabled: true,
    variables: PAYMENT_VARS,
    sample: { ...SAMPLE, balance_due: '₹0.00', balance_due_paise: 0 },
    spec: spec(
      event('payment.received'),
      [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Thank you for your payment of {{amount}}', body: 'Hi {{client_name}},\n\nWe have received {{amount}} against invoice {{invoice_number}} on {{payment_date}}. Nothing more is due on it.\n\nYour receipt {{receipt_number}}: {{receipt_link}}' + SIGN_OFF }],
      [{ field: 'balance_due_paise', op: 'eq', value: 0 }],
    ),
  },
  {
    key: 'part_payment_ack',
    area: 'money',
    name: 'Part payment → acknowledgement',
    description: 'When a payment leaves a balance on the invoice, confirm it and say what is still due.',
    defaultEnabled: true,
    variables: PAYMENT_VARS,
    sample: SAMPLE,
    spec: spec(
      event('payment.received'),
      [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Payment of {{amount}} received for {{invoice_number}}', body: 'Hi {{client_name}},\n\nThank you. We have received {{amount}} against invoice {{invoice_number}}. {{balance_due}} is still due on it.\n\nYour receipt {{receipt_number}}: {{receipt_link}}' + SIGN_OFF }],
      [{ field: 'balance_due_paise', op: 'gt', value: 0 }],
    ),
  },
  {
    key: 'invoice_send',
    area: 'money',
    name: 'Invoice issued → send to client',
    description: 'Email every newly issued invoice to the client with its link (WhatsApp later, with email as the fallback).',
    defaultEnabled: false,
    variables: INVOICE_VARS,
    sample: SAMPLE,
    spec: spec(event('invoice.issued'), [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Invoice {{invoice_number}} from {{business_name}}', body: 'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{invoice_total}} is ready, due on {{due_date}}.\n\nView, download or pay: {{document_link}}' + SIGN_OFF }]),
  },
  {
    key: 'payment_reminders',
    area: 'money',
    name: 'Payment reminders',
    description: 'The reminder schedule in Folio settings (3 days before, on the due date, then 7, 15 and 30 days after). It stops by itself once an invoice is paid.',
    defaultEnabled: true,
    variables: [],
    sample: SAMPLE,
    bridge: 'folio_reminders',
    spec: spec(date('invoice_due', 0), []),
  },
  {
    key: 'overdue_30_alert',
    area: 'money',
    name: 'Overdue over 30 days → owner alert + call task',
    description: 'Alert the owner and add a call follow-up when an invoice is 30 days past due.',
    defaultEnabled: true,
    variables: [...INVOICE_VARS, 'days_overdue'],
    sample: SAMPLE,
    spec: spec(
      date('invoice_due', 30),
      [
        { type: 'notify', recipient: 'owner', subject: '{{invoice_number}} is {{days_overdue}} days overdue', body: '{{client_name}} still owes {{balance_due}}. A call follow-up has been added.' },
        { type: 'task', recipient: 'owner', subject: 'Call {{client_name}} about {{invoice_number}} ({{balance_due}} overdue)', body: 'Overdue by {{days_overdue}} days.', dueInDays: 0 },
      ],
      [{ field: 'balance_due_paise', op: 'gt', value: 0 }],
    ),
  },
  {
    key: 'quote_follow_up',
    area: 'money',
    name: 'Quote not accepted in 3 days → follow-up',
    description: 'Nudge the client when a sent quote has had no answer for 3 days.',
    defaultEnabled: true,
    variables: QUOTE_VARS,
    sample: SAMPLE,
    spec: spec(
      date('quote_sent', 3),
      [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Following up on quote {{quote_number}}', body: 'Hi {{client_name}},\n\nJust checking in on our quote {{quote_number}} for {{quote_total}}. You can accept it online in a click: {{document_link}}\n\nHappy to answer any questions.' + SIGN_OFF }],
      [{ field: 'quote_status', op: 'eq', value: 'sent' }],
      { businessHoursOnly: true },
    ),
  },
  {
    key: 'quote_expiring',
    area: 'money',
    name: 'Quote expiring in 2 days → reminder',
    description: 'Remind the client two days before an open quote expires.',
    defaultEnabled: true,
    variables: QUOTE_VARS,
    sample: SAMPLE,
    spec: spec(
      date('quote_valid_until', -2),
      [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Quote {{quote_number}} is valid until {{valid_until}}', body: 'Hi {{client_name}},\n\nA reminder that our quote {{quote_number}} for {{quote_total}} is valid until {{valid_until}}. Accept it online: {{document_link}}' + SIGN_OFF }],
      [{ field: 'quote_status', op: 'eq', value: 'sent' }],
      { businessHoursOnly: true },
    ),
  },
  {
    key: 'quote_accepted',
    area: 'money',
    name: 'Quote accepted → owner + convert task',
    description: 'When a client accepts a quote online, tell the owner and add a task to turn it into an invoice.',
    defaultEnabled: true,
    variables: [...QUOTE_VARS, 'accepted_by', 'comment'],
    sample: SAMPLE,
    spec: spec(event('quote.accepted'), [
      { type: 'notify', recipient: 'owner', subject: '{{client_name}} accepted quote {{quote_number}}', body: 'Accepted by {{accepted_by}} for {{quote_total}}. {{comment}}' },
      { type: 'task', recipient: 'owner', subject: 'Convert quote {{quote_number}} to an invoice', body: 'Accepted by {{accepted_by}}. {{comment}}', dueInDays: 1 },
    ]),
  },
  {
    key: 'recurring_generated',
    area: 'money',
    name: 'Recurring invoice drafted → review',
    description: 'When retainer drafts are created, tell the owner to review and issue them.',
    defaultEnabled: false,
    variables: ['business_name', 'draft_count', 'month'],
    sample: { ...SAMPLE, draft_count: 4, month: 'October 2026' },
    spec: spec(event('invoice.recurring_generated'), [{ type: 'notify', recipient: 'owner', subject: '{{draft_count}} retainer drafts for {{month}} are ready', body: 'Review them and issue to send.' }]),
  },
  {
    key: 'monthly_statement',
    area: 'money',
    name: 'Monthly statement on the 1st',
    description: 'On the 1st of each month, email every client who owes money a link to their statement.',
    defaultEnabled: false,
    variables: [...CLIENT_VARS, 'total_due', 'statement_link'],
    sample: SAMPLE,
    spec: spec(
      { type: 'schedule', source: 'clients_with_dues', frequency: 'monthly', day: 1, time: '10:00' },
      [{ type: 'message', recipient: 'client', channel: 'email', subject: 'Your statement from {{business_name}}', body: 'Hi {{client_name}},\n\n{{total_due}} is due on your account today. Your statement, invoice by invoice: {{statement_link}}' + SIGN_OFF }],
    ),
  },
  {
    key: 'utr_shared',
    area: 'money',
    name: 'Client shares a UTR → verify task',
    description: 'When a client says they paid and shares the UTR on the invoice page, alert the owner and add a task to check the bank.',
    defaultEnabled: true,
    variables: [...INVOICE_VARS, 'utr', 'amount'],
    sample: SAMPLE,
    spec: spec(event('payment.utr_shared'), [
      { type: 'notify', recipient: 'owner', subject: '{{client_name}} says {{invoice_number}} is paid', body: 'UTR {{utr}} for {{balance_due}} due. Check the bank and record the receipt.' },
      { type: 'task', recipient: 'owner', subject: 'Verify payment for {{invoice_number}} (UTR {{utr}})', body: '{{client_name}} shared UTR {{utr}} on the invoice page.', dueInDays: 0 },
    ]),
  },
  {
    key: 'task_overdue_escalation',
    area: 'team',
    name: 'Task overdue 3 days → manager',
    description: 'Also tell the project lead when a task is 3 days overdue.',
    defaultEnabled: false,
    variables: ['task_title', 'days_late', 'assignee_name', 'project_name'],
    sample: SAMPLE,
    spec: spec(date('task_due', 3), [{ type: 'notify', recipient: 'manager', subject: "'{{task_title}}' is {{days_late}} days overdue", body: 'Assigned to {{assignee_name}} in {{project_name}}.' }]),
  },
  {
    key: 'approval_reminder',
    area: 'team',
    name: 'Leave pending 24 hours → reminder',
    description: 'Remind the approver when a leave request has waited a day at its current stage. Timesheets, claims and corrections are not chased yet.',
    defaultEnabled: true,
    variables: ['employee_name', 'request_summary', 'hours_pending'],
    sample: SAMPLE,
    spec: spec(date('approval_requested', 24, 'hours'), [{ type: 'notify', recipient: 'approver', subject: "{{employee_name}}'s leave is waiting on you", body: '{{request_summary}}. Pending for {{hours_pending}} hours.' }]),
  },
  {
    key: 'approval_escalation',
    area: 'team',
    name: 'Leave pending 48 hours → escalate',
    description: 'Tell the escalation approvers (management) when a leave request has waited two days at its current stage.',
    defaultEnabled: true,
    variables: ['employee_name', 'request_summary', 'hours_pending'],
    sample: { ...SAMPLE, hours_pending: 49 },
    spec: spec(date('approval_requested', 48, 'hours'), [{ type: 'notify', recipient: 'escalation', subject: "{{employee_name}}'s leave has waited {{hours_pending}} hours", body: '{{request_summary}}. The approver has not acted yet.' }]),
  },
  {
    key: 'meeting_reminder',
    area: 'team',
    name: 'Meeting in 15 minutes → attendees',
    description: 'Remind everyone invited 15 minutes before a meeting starts.',
    defaultEnabled: true,
    variables: ['meeting_title', 'meeting_time'],
    sample: SAMPLE,
    spec: spec(date('meeting_start', -15, 'minutes'), [{ type: 'notify', recipient: 'attendees', subject: '{{meeting_title}} starts at {{meeting_time}}', body: 'Starting in 15 minutes.' }]),
  },
  // Sales (Orbit)
  {
    key: 'new_lead',
    area: 'sales',
    name: 'New lead → alert the assignee + welcome the lead',
    description: 'When a lead arrives (website form, webhook, IndiaMART, WhatsApp), alert whoever it was assigned to and send the lead a short welcome. While this is off, the assignee still gets the built-in alert.',
    defaultEnabled: false,
    variables: vars('lead.created'),
    sample: SAMPLE,
    spec: spec(event('lead.created'), [
      { type: 'notify', recipient: 'assignee', subject: 'New lead from {{lead_source}}: {{company_name}}', body: '{{lead_name}} · {{lead_phone}} · {{lead_email}}' },
      { type: 'message', recipient: 'lead', channel: 'email', subject: 'Thanks for getting in touch with {{business_name}}', body: 'Hi {{lead_name}},\n\nThank you for your enquiry. {{assignee_name}} from our team will get back to you shortly.' + SIGN_OFF },
    ]),
  },
  {
    key: 'lead_not_contacted_2h',
    area: 'sales',
    name: 'Lead not contacted in 2 hours → nudge',
    description: 'Remind the assignee when a new lead has had no contact for 2 hours.',
    defaultEnabled: false,
    variables: vars({ source: 'lead_created' }),
    sample: SAMPLE,
    spec: spec(date('lead_created', 2, 'hours'), [{ type: 'notify', recipient: 'assignee', subject: '{{lead_name}} ({{company_name}}) is waiting for a call', body: 'Came in from {{lead_source}} 2 hours ago and has not been contacted. {{lead_phone}}' }], [{ field: 'contacted', op: 'eq', value: 'no' }]),
  },
  {
    key: 'lead_not_contacted_24h',
    area: 'sales',
    name: 'Lead not contacted in 24 hours → sales manager',
    description: 'Escalate to the sales managers when a new lead is still uncontacted after a day.',
    defaultEnabled: false,
    variables: vars({ source: 'lead_created' }),
    sample: SAMPLE,
    spec: spec(date('lead_created', 24, 'hours'), [{ type: 'notify', recipient: 'sales_manager', subject: '{{company_name}} has waited 24 hours for a first call', body: 'Assigned to {{assignee_name}}; from {{lead_source}}.' }], [{ field: 'contacted', op: 'eq', value: 'no' }]),
  },
  {
    key: 'deal_idle_7d',
    area: 'sales',
    name: 'Deal idle for 7 days → nudge',
    description: 'Nudge the deal owner when an open deal has not moved stage in 7 days.',
    defaultEnabled: false,
    variables: vars({ source: 'deal_stage_idle' }),
    sample: SAMPLE,
    spec: spec(date('deal_stage_idle', 7), [{ type: 'notify', recipient: 'assignee', subject: "'{{deal_title}}' has sat in {{stage_name}} for {{days_idle}} days", body: '{{deal_value}}. Plan the next step or update the stage.' }]),
  },
  {
    key: 'deal_won',
    area: 'sales',
    name: 'Deal won → team alert + owner alert',
    description: 'Send the whole team and the workspace owners an alert (a notification, not a feed post) when a deal is won.',
    defaultEnabled: false,
    variables: vars('deal.won'),
    sample: SAMPLE,
    spec: spec(event('deal.won'), [
      { type: 'notify', recipient: 'team', subject: '{{owner_name}} won {{deal_title}}', body: '{{deal_value}}. Well done!' },
      { type: 'notify', recipient: 'owner', subject: 'Deal won: {{deal_title}} ({{deal_value}})', body: 'Closed by {{owner_name}}.' },
    ]),
  },
  // People (Muster)
  {
    key: 'attendance_nudge',
    area: 'people',
    name: 'Attendance not marked by 10:30 → nudge',
    description: 'On working days, remind people with a login who have not checked in by 10:30 (not on leave or a holiday).',
    defaultEnabled: false,
    variables: vars({ source: 'attendance_unmarked' }),
    sample: SAMPLE,
    spec: spec({ type: 'schedule', source: 'attendance_unmarked', frequency: 'daily', time: '10:30' }, [{ type: 'notify', recipient: 'employee', subject: 'You have not checked in today', body: 'Check in from Flowbit (or the WhatsApp bot), or ask for a correction if you are working elsewhere.' }]),
  },
  {
    key: 'checkout_nudge',
    area: 'people',
    name: 'Forgot to check out → evening nudge',
    description: 'At 19:30, remind people who checked in today but have not checked out.',
    defaultEnabled: false,
    variables: vars({ source: 'checkout_missing' }),
    sample: SAMPLE,
    spec: spec({ type: 'schedule', source: 'checkout_missing', frequency: 'daily', time: '19:30' }, [{ type: 'notify', recipient: 'employee', subject: 'Did you forget to check out?', body: 'You checked in at {{checked_in_at}}. Check out so your hours count.' }]),
  },
  {
    key: 'birthday_wish',
    area: 'people',
    name: 'Birthday → wish + team alert',
    description: 'Wish the employee on their birthday and send the team an alert (a notification, not a feed post). In-app and email by default; WhatsApp only for people who turn it on for "Birthdays and anniversaries" themselves (Meta counts greetings as marketing). The feed post is a separate recipe, Birthday → Celebration post in the feed, which is on by default.',
    defaultEnabled: false,
    variables: vars({ source: 'employee_birthday' }),
    sample: SAMPLE,
    spec: spec(date('employee_birthday', 0), [
      { type: 'notify', recipient: 'employee', subject: 'Happy birthday, {{employee_name}}!', body: 'Everyone at {{business_name}} wishes you a wonderful year ahead.' },
      { type: 'notify', recipient: 'team', subject: "It's {{employee_name}}'s birthday today", body: 'Send them your wishes!' },
    ]),
  },
  {
    key: 'anniversary_wish',
    area: 'people',
    name: 'Work anniversary → wish + team alert',
    description: 'Wish the employee on their work anniversary and send the team an alert (a notification, not a feed post). In-app and email by default; WhatsApp only with the person\'s own opt-in. The feed post is a separate recipe, Work anniversary → Celebration post in the feed.',
    defaultEnabled: false,
    variables: vars({ source: 'employee_anniversary' }),
    sample: SAMPLE,
    spec: spec(date('employee_anniversary', 0), [
      { type: 'notify', recipient: 'employee', subject: 'Happy {{years}}-year work anniversary, {{employee_name}}!', body: 'Thank you for everything you do at {{business_name}}.' },
      { type: 'notify', recipient: 'team', subject: '{{employee_name}} completes {{years}} years today', body: 'Say congratulations!' },
    ]),
  },
  {
    key: 'birthday_post',
    area: 'people',
    name: 'Birthday → Celebration post in the feed',
    description: 'On the day, post a Celebration in Work → Posts so the team can react and reply. The post shows the name only, never the date of birth or age.',
    defaultEnabled: true,
    variables: vars({ source: 'employee_birthday' }),
    sample: SAMPLE,
    spec: spec(date('employee_birthday', 0), [{ type: 'post', postType: 'celebration', recipient: 'team', subject: 'Happy birthday, {{employee_name}}! 🎂', body: 'Wishing {{employee_name}} a wonderful year ahead. Drop your wishes below!' }]),
  },
  {
    key: 'anniversary_post',
    area: 'people',
    name: 'Work anniversary → Celebration post in the feed',
    description: 'On the day, post a Celebration in Work → Posts for each work anniversary.',
    defaultEnabled: true,
    variables: vars({ source: 'employee_anniversary' }),
    sample: SAMPLE,
    spec: spec(date('employee_anniversary', 0), [{ type: 'post', postType: 'celebration', recipient: 'team', subject: '{{employee_name}} completes {{years}} years with us 🎉', body: 'Thank you, {{employee_name}}, for {{years}} years at {{business_name}}. Say congratulations below!' }]),
  },
  {
    key: 'welcome_post',
    area: 'people',
    name: 'New joiner → Welcome post in the feed',
    description: 'On their first day, post a Welcome in Work → Posts so the team can say hello.',
    defaultEnabled: true,
    variables: vars({ source: 'employee_joining' }),
    sample: SAMPLE,
    spec: spec(date('employee_joining', 0), [{ type: 'post', postType: 'welcome', recipient: 'employee', subject: 'Please welcome {{employee_name}} 👋', body: '{{employee_name}} joins {{business_name}} today. Say hello and help them settle in!' }]),
  },
  {
    key: 'new_joiner_welcome',
    area: 'people',
    name: 'New joiner → welcome before Day 1',
    description: 'The day before someone joins, email them a welcome (to their personal email if there is one) and tell their manager.',
    defaultEnabled: false,
    variables: vars({ source: 'employee_joining' }),
    sample: SAMPLE,
    spec: spec(date('employee_joining', -1), [
      { type: 'message', recipient: 'employee', channel: 'email', subject: 'Welcome to {{business_name}}, {{employee_name}}!', body: 'Hi {{employee_name}},\n\nWe are glad you are joining us on {{join_date}}. {{manager_name}} will meet you on your first day.\n\nPlease keep your PAN, bank details and joining documents handy.' + SIGN_OFF },
      { type: 'notify', recipient: 'manager', subject: '{{employee_name}} joins tomorrow', body: 'Joining on {{join_date}}. Plan their first day.' },
    ]),
  },
  {
    key: 'onboarding_docs_reminder',
    area: 'people',
    name: 'Joining documents incomplete → weekly reminder',
    description: 'Every Monday, remind new joiners whose mandatory documents are not all on file, until they are.',
    defaultEnabled: false,
    variables: vars({ source: 'onboarding_incomplete' }),
    sample: SAMPLE,
    spec: spec(
      { type: 'schedule', source: 'onboarding_incomplete', frequency: 'weekly', day: 1, time: '10:00' },
      [{ type: 'message', recipient: 'employee', channel: 'email', subject: 'A few joining documents are still missing', body: 'Hi {{employee_name}},\n\nYour joining checklist is {{checklist_percent}}% complete. Still needed: {{missing_items}}. Upload them in Flowbit under My profile, or send them to HR.' + SIGN_OFF }],
      [{ field: 'checklist_percent', op: 'lt', value: 100 }],
    ),
  },
  {
    key: 'probation_ending',
    area: 'people',
    name: 'Probation ending in 15 days → HR and manager',
    description: 'Fifteen days before a probation end date on record, tell HR and the manager so the confirmation is decided in time.',
    defaultEnabled: true,
    variables: vars({ source: 'probation_end' }),
    sample: SAMPLE,
    spec: spec(date('probation_end', -15), [
      { type: 'notify', recipient: 'hr', subject: "{{employee_name}}'s probation ends on {{probation_end}}", body: 'Confirm, extend or end it. Manager: {{manager_name}}.' },
      { type: 'notify', recipient: 'manager', subject: "{{employee_name}}'s probation ends on {{probation_end}}", body: 'Share your review with HR.' },
    ]),
  },
  {
    key: 'document_expiring',
    area: 'people',
    name: 'ID, contract or visa expiring in 30 days → HR',
    description: 'Thirty days before a document on file expires (set an expiry date when you upload it), tell HR.',
    defaultEnabled: true,
    variables: vars({ source: 'document_expiry' }),
    sample: SAMPLE,
    spec: spec(date('document_expiry', -30), [{ type: 'notify', recipient: 'hr', subject: "{{employee_name}}'s {{document_type}} expires on {{expires_on}}", body: 'Ask for a renewed copy and upload it to their record.' }]),
  },
  {
    key: 'payslip_ready_note',
    area: 'people',
    name: 'Payslip published → "your payslip is ready" note',
    description: 'A short note that the payslip is ready, on the channels each person chose. Never an amount: on WhatsApp it is the "payslip ready" template; the payslip itself goes by email as before.',
    defaultEnabled: false,
    variables: vars('payslip.published'),
    sample: SAMPLE,
    spec: spec(event('payslip.published'), [{ type: 'notify', recipient: 'employee', subject: 'Your {{month}} payslip is ready', body: 'It is in your email and in Flowbit under My payslips.' }]),
  },
  // Business compliance
  {
    key: 'compliance_reminder',
    area: 'compliance',
    name: 'Statutory due date in 3 days → owner and accounts',
    description: 'GSTR-1, GSTR-3B, TDS, PF/ESI, professional tax and advance tax from your compliance calendar (Settings → Compliance calendar). Verify each date: the government extends them often.',
    defaultEnabled: false,
    variables: vars({ source: 'compliance_due' }),
    sample: SAMPLE,
    // Accounts = everyone with Folio settings, which includes the owners.
    spec: spec(date('compliance_due', -3), [{ type: 'notify', recipient: 'accountant', subject: '{{item_label}} for {{period}} is due on {{due_date}}', body: '{{note}}' }]),
  },
]

/** Sample values for previews and "Test on me" of the workspace's own rules. */
export const SAMPLE_VALUES: Vars = SAMPLE

const BY_KEY = new Map(RECIPES.map((r) => [r.key, r]))
export const recipeByKey = (key: string | null | undefined): Recipe | undefined => (key ? BY_KEY.get(key) : undefined)
