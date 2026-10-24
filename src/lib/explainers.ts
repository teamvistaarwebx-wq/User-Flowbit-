/**
 * Short in-app explainers for the concepts a new user trips over (audit A,
 * "concepts a new user needs explained"). Rendered by <InfoTip concept> as a
 * "?" popover, usually next to a page title. Pure data, safe on the client.
 *
 * Keep each body to two or three short sentences. Every link must open a
 * catalog page (explainers.test.ts checks this).
 */

export const CONCEPT_KEYS = [
  'login-vs-employee',
  'company-sources',
  'modules-vs-plan',
  'work-structure',
  'teams-vs-departments',
  'manager-role',
  'clients-leads-contacts',
  'folio-documents',
  'attendance-vs-time',
  'alerts-digests-briefs',
  'automation-engines',
  'month-lock',
  'brand-colours',
  'support-access',
  'search-and-arc',
  'claims-vs-expenses',
  'free-vs-trial',
] as const
export type ConceptKey = (typeof CONCEPT_KEYS)[number]

export type ExplainerLink = Readonly<{ label: string; href: string }>
export type Explainer = Readonly<{ title: string; body: readonly string[]; links?: readonly ExplainerLink[] }>

export const EXPLAINERS: Readonly<Record<ConceptKey, Explainer>> = {
  'login-vs-employee': {
    title: 'Logins and employee records',
    body: [
      'A member is a login: someone who can sign in (Settings → Members). An employee is an HR record with salary, leave and attendance (Muster → People).',
      'One person can have both. Link them on the employee page (Access card) so their login opens My HR. Seats count both logins and on-payroll employees; Plan & billing shows the counts your plan uses.',
    ],
    links: [
      { label: 'Members', href: '/app/settings/members' },
      { label: 'People', href: '/app/hr/people' },
      { label: 'Plan & billing', href: '/app/settings/subscription' },
    ],
  },
  'company-sources': {
    title: 'Workspace, company and firms',
    body: [
      'The workspace is your Flowbit account. The company profile holds your legal name, GSTIN, PAN, address, logo and signatories, and every PDF reads them from there.',
      'A Folio firm is a business you invoice from. It uses the company profile unless you override a field for that firm.',
    ],
    links: [
      { label: 'Company profile', href: '/app/settings/company' },
      { label: 'Folio firms', href: '/app/folio/settings' },
    ],
  },
  'modules-vs-plan': {
    title: 'Modules and your plan',
    body: [
      'Your plan decides which products you pay for. Modules switch a paid product on or off for everyone, for example while you set it up.',
      'Switching a module off hides it and keeps its data; it does not change the bill. To change what you pay, use Plan & billing.',
    ],
    links: [
      { label: 'Modules', href: '/app/settings/modules' },
      { label: 'Plan & billing', href: '/app/settings/subscription' },
    ],
  },
  'work-structure': {
    title: 'Spaces, lists and projects',
    body: [
      'Spaces are where ongoing work lives, usually one per team or area, and hold lists of tasks. Projects are deliverables with dates, owners and a client.',
      'Both are optional and a task can sit in either or both. Teams are groups of people and can be attached to projects.',
    ],
    links: [
      { label: 'Spaces', href: '/app/work/spaces' },
      { label: 'Projects', href: '/app/work/projects' },
      { label: 'Teams', href: '/app/work/teams' },
    ],
  },
  'teams-vs-departments': {
    title: 'Teams and departments',
    body: [
      'Departments are the HR org chart, set in Muster → HR settings. Employee records, payroll and HR reports group by department.',
      'Teams are Work groups for tasks, projects and posts. A person can be in several teams. Posts can target either.',
    ],
    links: [
      { label: 'Teams', href: '/app/work/teams' },
      { label: 'HR settings', href: '/app/hr/settings' },
    ],
  },
  'manager-role': {
    title: 'Manager role and reporting manager',
    body: [
      'The Manager role is a set of permissions. A reporting manager is the person set on an employee record.',
      'Leave, corrections and comp-off go to the reporting manager first (when their login may approve them), then to HR. Timesheets go to the direct manager. In Orbit, reviewers are the people who may close and reassign deals.',
    ],
    links: [
      { label: 'Roles', href: '/app/settings/roles' },
      { label: 'Approvals', href: '/app/approvals' },
    ],
  },
  'clients-leads-contacts': {
    title: 'Clients, leads and contacts',
    body: [
      'A client is a company you work for or bill, shared by Work, Orbit and Folio. A prospect is a client you have not won yet.',
      'An Orbit lead is a sales opportunity that may become a client. Contacts are the people at a client or lead; portal contacts are the ones who can sign in to your client portal.',
    ],
    links: [
      { label: 'Clients', href: '/app/clients' },
      { label: 'Leads', href: '/app/orbit/leads' },
    ],
  },
  'folio-documents': {
    title: 'Folio documents',
    body: [
      'A quote is an offer; a proforma is a request to pay before the tax invoice. A receipt records money received; money not yet set against an invoice stays as advance.',
      'Recurring creates the same invoice every period; a billing plan bills milestones. A credit note reduces an issued invoice, void cancels one issued by mistake, and a write-off closes a balance you will not collect.',
    ],
    links: [
      { label: 'Invoices', href: '/app/folio/invoices' },
      { label: 'Recurring', href: '/app/folio/recurring' },
    ],
  },
  'attendance-vs-time': {
    title: 'Attendance and time',
    body: [
      'Attendance is when you were at work: check-in to check-out. Effective time leaves out breaks; payable time is what salary counts.',
      'Time tracking is what you worked on: logged hours per task, some of them billable to a client. The two are kept separately and need not match.',
    ],
    links: [
      { label: 'My attendance', href: '/app/me/attendance' },
      { label: 'Time', href: '/app/work/time' },
    ],
  },
  'alerts-digests-briefs': {
    title: 'Alerts, digests and briefs',
    body: [
      'An alert is one event, sent as it happens. A digest batches your alerts into one message instead of many.',
      'A brief is a summary at a time you choose: what is due, what waits on you, what came in. Workspace alerts set the defaults; My alerts are your own choices.',
    ],
    links: [
      { label: 'My alerts', href: '/app/settings/profile/notifications' },
      { label: 'Briefs', href: '/app/settings/profile/briefs' },
      { label: 'Workspace alerts', href: '/app/settings/notifications' },
    ],
  },
  'automation-engines': {
    title: 'Automations, reminders and sequences',
    body: [
      'Automations are workspace rules: when something happens, notify, post or create a task. Folio payment reminders chase unpaid invoices. Orbit sequences run follow-up steps for one lead.',
      'Each is edited in its own place; the links below go to the other two.',
    ],
    links: [
      { label: 'Automations', href: '/app/settings/automations' },
      { label: 'Folio reminders', href: '/app/folio/settings?tab=reminders' },
      { label: 'Orbit sequences', href: '/app/orbit/sequences' },
    ],
  },
  'month-lock': {
    title: 'Locking a month',
    body: [
      'Locking a month freezes its attendance so payroll uses fixed numbers. Pending leave and corrections for that month must be decided first.',
      'Payroll then moves through its steps in order: attendance locked, claims closed, generated, HR reviewed, finance approved, locked, salary released and payslips published. Reopening a step needs the right permission.',
    ],
    links: [
      { label: 'Attendance', href: '/app/hr/attendance' },
      { label: 'Payroll', href: '/app/hr/payroll' },
    ],
  },
  'brand-colours': {
    title: 'Brand colours',
    body: [
      'Brand colours restyle the app for everyone in this workspace. They are part of the Suite plan and work during a trial.',
      'PDFs such as invoices and payslips keep their standard colours and show your logo from the company profile.',
    ],
    links: [{ label: 'Company profile', href: '/app/settings/company' }],
  },
  'support-access': {
    title: 'Support access',
    body: [
      'The Flowbit team can see your workspace only after the owner approves a request, and only for the time shown on it.',
      'Read-only access ends on its own; import access lasts 7 days. Requests and grants are recorded in the audit log.',
    ],
    links: [
      { label: 'Support access', href: '/app/settings/support' },
      { label: 'Audit log', href: '/app/settings/audit' },
    ],
  },
  'search-and-arc': {
    title: 'Search and Arc',
    body: [
      'Search (⌘K) finds pages and records across every product you can open: tasks, projects, clients, people, invoices, leads and deals.',
      'Arc is the Work assistant: ask it a question and it answers from your tasks, projects, posts and meetings. Connected apps let Claude or ChatGPT work in Flowbit on your behalf.',
    ],
    links: [
      { label: 'Arc', href: '/app/arc' },
      { label: 'Connected apps', href: '/app/settings/integrations/ai' },
    ],
  },
  'claims-vs-expenses': {
    title: 'Claims and expenses',
    body: [
      'A claim is money an employee spent for work and wants back. Approved claims are paid with salary in Muster payroll.',
      'A Folio expense is money the business paid a vendor, for profit and loss and GST input credit. Claims do not appear in Folio expenses.',
    ],
    links: [
      { label: 'Claims', href: '/app/hr/claims' },
      { label: 'Expenses', href: '/app/folio/expenses' },
    ],
  },
  'free-vs-trial': {
    title: 'Free and trial',
    body: [
      'Up to 5 people: free for 6 months · bigger teams: 15-day full trial. Both include every product and need no card.',
      'Free has no paid add-ons. When the free months or the trial end, choose a plan here to keep working; your data stays.',
    ],
    links: [{ label: 'Plan & billing', href: '/app/settings/subscription' }],
  },
}
