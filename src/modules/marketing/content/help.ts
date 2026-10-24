import type { IconName, ProductKey } from '@/lib/catalog'
import type { ManualRef } from './faq/types'

/**
 * The help centre (/help) and the "How to use" section on each product
 * page. Every link points into the user manual (content/manual); tests
 * check each chapter and topic exists. Pure.
 */

export type HelpLink = Readonly<{ label: string; guide: ManualRef }>

export type HelpCard = Readonly<{
  key: string
  title: string
  body: string
  icon: IconName
  /** Where the card goes: a manual chapter (`/manual/<slug>`) or /faq. */
  href: string
  /** Manual chapter whose accent colour the card uses; FAQ has none. */
  chapter?: string
  links: readonly HelpLink[]
}>

export const HELP_CARDS: readonly HelpCard[] = [
  {
    key: 'start', title: 'Getting started', icon: 'House', href: '/manual/getting-started', chapter: 'getting-started',
    body: 'Sign up, invite your team, find your way around and check in for the day.',
    links: [
      { label: 'Sign up and create a workspace', guide: 'getting-started#start-signup' },
      { label: 'Invite people', guide: 'getting-started#start-invite' },
      { label: 'The screen layout', guide: 'getting-started#start-layout' },
    ],
  },
  {
    key: 'work', title: 'Work · Tasks', icon: 'SquareCheckBig', href: '/manual/work', chapter: 'work',
    body: 'Tasks, spaces, projects, meetings, posts, time tracking, whiteboards and reports.',
    links: [
      { label: 'Create and manage tasks', guide: 'work#work-tasks' },
      { label: 'Run a project', guide: 'work#work-projects' },
      { label: 'Log time and submit the week', guide: 'work#work-time' },
    ],
  },
  {
    key: 'muster', title: 'Muster · HR', icon: 'Users', href: '/manual/hr', chapter: 'hr',
    body: 'People, attendance, leave and comp-off: employee records, the attendance register and corrections.',
    links: [
      { label: 'Add or import people', guide: 'hr#muster-people-import' },
      { label: 'Mark and lock attendance', guide: 'hr#muster-attendance' },
      { label: 'Approve leave', guide: 'hr#muster-leave' },
    ],
  },
  {
    key: 'payroll', title: 'Muster · Payroll', icon: 'IndianRupee', href: '/manual/payroll', chapter: 'payroll',
    body: 'Payroll months with PF, ESI and PT, salary structures, claims, salary TDS, HR letters and reports.',
    links: [
      { label: 'Run a payroll month', guide: 'payroll#muster-payroll-run' },
      { label: 'Set up salary structures', guide: 'payroll#muster-structures' },
      { label: 'Issue an HR letter', guide: 'payroll#muster-letters' },
    ],
  },
  {
    key: 'me', title: 'My HR', icon: 'UserRound', href: '/manual/my-hr', chapter: 'my-hr',
    body: 'My HR for every employee: check-in, leave, payslips, claims, letters and tax.',
    links: [
      { label: 'Apply for leave', guide: 'my-hr#me-leave' },
      { label: 'Download payslips', guide: 'my-hr#me-payslips' },
      { label: 'Declare tax savings', guide: 'my-hr#me-tax' },
    ],
  },
  {
    key: 'orbit', title: 'Orbit · Sales', icon: 'Orbit', href: '/manual/orbit', chapter: 'orbit',
    body: 'Leads, deals, follow-ups, contacts, lead capture and pipeline reports.',
    links: [
      { label: 'Add and work a lead', guide: 'orbit#orbit-leads' },
      { label: 'Move deals through the pipeline', guide: 'orbit#orbit-deals' },
      { label: 'Follow-up sequences', guide: 'whats-new#new-sequences' },
    ],
  },
  {
    key: 'folio', title: 'Folio · Invoicing', icon: 'ReceiptIndianRupee', href: '/manual/folio', chapter: 'folio',
    body: 'GST invoices, quotes, receipts, bank import, collections, expenses and GST reports.',
    links: [
      { label: 'Create a GST invoice', guide: 'folio#folio-invoices' },
      { label: 'Record a payment', guide: 'folio#folio-receipts' },
      { label: 'Import a bank statement', guide: 'folio#folio-bank' },
    ],
  },
  {
    key: 'admin', title: 'Admin and settings', icon: 'Settings', href: '/manual/settings', chapter: 'settings',
    body: 'Members, roles, company profile, Plan & billing, alerts, automations, integrations, import, export and security.',
    links: [
      { label: 'Roles and permissions', guide: 'settings#admin-roles' },
      { label: 'Company profile and signatories', guide: 'settings#admin-company' },
      { label: 'Connect Claude or ChatGPT', guide: 'settings#admin-connected-apps' },
    ],
  },
  {
    key: 'new', title: 'What’s new in 2.0', icon: 'Sparkles', href: '/manual/whats-new', chapter: 'whats-new',
    body: 'Quick add in Hinglish, the task panel, break types, posts, Google Calendar, sequences and more.',
    links: [
      { label: 'Quick add in plain words', guide: 'whats-new#new-quick-add' },
      { label: 'Task side panel', guide: 'whats-new#new-task-panel' },
      { label: 'Everything else that is new', guide: 'whats-new#new-latest' },
    ],
  },
  {
    key: 'faq', title: 'FAQ', icon: 'ClipboardList', href: '/faq',
    body: 'Short answers on plans and GST, payroll and TDS, invoices, security, integrations and AI.',
    links: [],
  },
]

export type HowToTask = Readonly<{ title: string; body: string; guide: ManualRef }>

export type ProductHowTo = Readonly<{
  /** The manual chapter for "Full guide". */
  chapter: string
  tasks: readonly HowToTask[]
}>

/** "How to use <product>": the key tasks, each linking to its manual topic. */
export const PRODUCT_HOW_TO: Record<ProductKey, ProductHowTo> = {
  work: {
    chapter: 'work',
    tasks: [
      { title: 'Add a task in plain words', body: 'Type “kal 5 baje @vikram #design banner p2” and press Enter.', guide: 'whats-new#new-quick-add' },
      { title: 'Plan in spaces and projects', body: 'A space per team, a project per goal, with milestones and health.', guide: 'work#work-projects' },
      { title: 'Move work across the board', body: 'Drag cards from To do to Done; open one in the side panel.', guide: 'work#work-tasks' },
      { title: 'Turn meeting notes into tasks', body: 'Write action items with an owner and date, then Create task.', guide: 'work#work-meetings' },
      { title: 'Log time and submit the week', body: 'Run a timer or type hours; your manager approves.', guide: 'work#work-time' },
      { title: 'Read the Friday reports', body: 'Throughput, overdue work and time by project, as CSV.', guide: 'work#work-reports' },
    ],
  },
  muster: {
    chapter: 'hr',
    tasks: [
      { title: 'Import your people', body: 'Upload a CSV; every row is checked before saving.', guide: 'hr#muster-people-import' },
      { title: 'Mark and lock attendance', body: 'Daily view, month register, biometric import and corrections.', guide: 'hr#muster-attendance' },
      { title: 'Approve leave', body: 'Manager first, then HR, from Flowbit or the email.', guide: 'hr#muster-leave' },
      { title: 'Run payroll', body: 'Eight stages from locked attendance to published payslips.', guide: 'payroll#muster-payroll-run' },
      { title: 'Work out salary TDS', body: 'Declarations, proofs, the monthly worksheet and Form 130.', guide: 'payroll#muster-tax' },
      { title: 'Issue an HR letter', body: '20 templates with references, signatures and PDF.', guide: 'payroll#muster-letters' },
    ],
  },
  orbit: {
    chapter: 'orbit',
    tasks: [
      { title: 'Add or import leads', body: 'By hand, from a CSV, your website form or a webhook.', guide: 'orbit#orbit-leads' },
      { title: 'Log activity and follow up', body: 'Calls, emails and meetings, with the next step scheduled.', guide: 'orbit#orbit-activities' },
      { title: 'Run a follow-up sequence', body: 'Up to five steps of emails, calls and reminders.', guide: 'whats-new#new-sequences' },
      { title: 'Win deals on the board', body: 'Drag through stages; won deals become quotes and invoices.', guide: 'orbit#orbit-deals' },
      { title: 'Read the conversion reports', body: 'Cold vs warm, sources, owners and reasons.', guide: 'orbit#orbit-reports' },
    ],
  },
  folio: {
    chapter: 'folio',
    tasks: [
      { title: 'Set up your firms', body: 'GSTIN, number series, bank details, signatory and terms.', guide: 'folio#folio-settings' },
      { title: 'Create and send a GST invoice', body: 'CGST, SGST or IGST worked out for you.', guide: 'folio#folio-invoices' },
      { title: 'Record a payment', body: 'Allocate it across open invoices; the rest is an advance.', guide: 'folio#folio-receipts' },
      { title: 'Match your bank statement', body: 'Import it and confirm which invoice each deposit pays.', guide: 'folio#folio-bank' },
      { title: 'Chase what is overdue', body: 'Collections, ledgers and automatic reminders.', guide: 'folio#folio-collections' },
      { title: 'Hand GST reports to your CA', body: 'GSTR-1 tables, registers and a Tally export.', guide: 'folio#folio-reports' },
    ],
  },
}
