/**
 * The catalog: products, features, permissions, pages, rail and side-panel
 * navigation. The shell, route guards, Settings -> Modules / Roles and the
 * pricing page all derive from this file. Pure data, safe on the client.
 */

export const PRODUCT_KEYS = ['work', 'muster', 'orbit', 'folio'] as const
export type ProductKey = (typeof PRODUCT_KEYS)[number]
export type AreaKey = 'core' | ProductKey

/** Lucide icon names used by the catalog (rendered by `<Icon name>` in components/ui). */
export const ICON_NAMES = [
  'House', 'Sparkles', 'SquareCheckBig', 'LayoutGrid', 'UsersRound', 'FolderKanban', 'Building2',
  'CalendarDays', 'ChartColumn', 'UserRound', 'Orbit', 'ReceiptIndianRupee', 'UserPlus', 'Settings',
  'Bell', 'PenTool', 'Megaphone', 'Timer', 'FileText', 'Wallet', 'CalendarCheck', 'CalendarClock',
  'Fingerprint', 'ClipboardList', 'FileSignature', 'Handshake', 'Contact', 'PhoneCall', 'Target',
  'Repeat', 'FileMinus', 'BookOpen', 'Shield', 'KeyRound', 'Palette', 'Puzzle', 'ScrollText', 'Mail',
  'CreditCard', 'Plug', 'Upload', 'Landmark', 'Banknote', 'Receipt', 'Users', 'Briefcase', 'Layers',
  'Kanban', 'ChartLine', 'ChartPie', 'Activity', 'Globe', 'UserCheck', 'UserCog', 'IndianRupee', 'Zap',
  'Inbox', 'Gift', 'ShieldCheck', 'Clock', 'Scale', 'Download',
] as const
export type IconName = (typeof ICON_NAMES)[number]

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

type PermDef = { key: string; label: string; area: AreaKey }

export const PERMISSION_DEFS = [
  // core
  { key: 'org.manage', label: 'Manage workspace settings, modules and integrations', area: 'core' },
  { key: 'org.delete', label: 'Delete the workspace', area: 'core' },
  { key: 'members.manage', label: 'Invite members, change roles, disable access', area: 'core' },
  { key: 'roles.manage', label: 'Create and edit roles', area: 'core' },
  { key: 'billing.manage', label: 'Manage subscription and billing', area: 'core' },
  { key: 'audit.read', label: 'Read the audit log', area: 'core' },
  { key: 'clients.read', label: 'View clients', area: 'core' },
  { key: 'clients.write', label: 'Create and edit clients', area: 'core' },
  { key: 'clients.delete', label: 'Archive or delete clients', area: 'core' },
  // work
  { key: 'tasks.read', label: 'View tasks', area: 'work' },
  { key: 'tasks.write', label: 'Create and edit tasks', area: 'work' },
  { key: 'tasks.manage', label: "Edit or delete anyone's tasks", area: 'work' },
  { key: 'spaces.manage', label: 'Create and manage spaces and their lists', area: 'work' },
  { key: 'projects.read', label: 'View projects', area: 'work' },
  { key: 'projects.write', label: 'Create and edit projects', area: 'work' },
  { key: 'teams.manage', label: 'Create and manage teams', area: 'work' },
  { key: 'meetings.write', label: 'Schedule meetings', area: 'work' },
  { key: 'posts.write', label: 'Publish posts', area: 'work' },
  { key: 'posts.manage', label: 'Pin, edit or remove any post', area: 'work' },
  { key: 'time.write', label: 'Log time and submit timesheets', area: 'work' },
  { key: 'time.approve', label: 'Approve timesheets', area: 'work' },
  { key: 'whiteboards.write', label: 'Create and edit whiteboards', area: 'work' },
  { key: 'work.reports', label: 'View Work reports', area: 'work' },
  { key: 'arc.use', label: 'Use the Arc assistant', area: 'work' },
  // muster
  { key: 'people.read', label: 'Open the People section', area: 'muster' },
  { key: 'people.read_all', label: "See every employee's records, attendance, leave and claims", area: 'muster' },
  { key: 'people.read_team', label: 'See their reporting chain (managers)', area: 'muster' },
  { key: 'people.read_sensitive', label: 'See PAN, UAN, ESIC, Aadhaar and bank details', area: 'muster' },
  { key: 'people.write', label: 'Add and edit employees', area: 'muster' },
  { key: 'people.import', label: 'Bulk import employees from CSV', area: 'muster' },
  { key: 'people.salary', label: 'Edit salary structures and assignments', area: 'muster' },
  { key: 'attendance.read', label: 'View the attendance register', area: 'muster' },
  { key: 'attendance.manage', label: 'Mark and override attendance', area: 'muster' },
  { key: 'attendance.lock', label: 'Lock and reopen an attendance month', area: 'muster' },
  { key: 'attendance.approve', label: 'Approve attendance corrections', area: 'muster' },
  { key: 'leave.read', label: 'View leave requests and balances', area: 'muster' },
  { key: 'leave.approve', label: 'Approve leave', area: 'muster' },
  { key: 'leave.manage', label: 'Manage leave types, policies and balances', area: 'muster' },
  { key: 'approvals.escalated', label: 'Decide escalated requests (when the applicant is HR)', area: 'muster' },
  { key: 'claims.read', label: 'See every reimbursement claim', area: 'muster' },
  { key: 'claims.review', label: 'Review reimbursement claims', area: 'muster' },
  { key: 'claims.pay', label: 'Mark claims as paid', area: 'muster' },
  { key: 'claims.forms', label: 'Manage claim forms', area: 'muster' },
  { key: 'payroll.read', label: 'View salaries and payroll cycles', area: 'muster' },
  { key: 'payroll.run', label: 'Generate and review payroll', area: 'muster' },
  { key: 'payroll.approve', label: 'Approve payroll (finance)', area: 'muster' },
  { key: 'payroll.lock', label: 'Lock a payroll month', area: 'muster' },
  { key: 'payroll.unlock', label: 'Reopen a locked payroll month (audited)', area: 'muster' },
  { key: 'payroll.release', label: 'Release payroll and publish payslips', area: 'muster' },
  { key: 'letters.read', label: 'View HR letters', area: 'muster' },
  { key: 'letters.write', label: 'Issue and revoke HR letters', area: 'muster' },
  { key: 'letters.templates', label: 'Edit letter templates', area: 'muster' },
  { key: 'hr.reports', label: 'View HR and payroll reports', area: 'muster' },
  { key: 'hr.settings', label: 'Manage departments, holidays and HR policies', area: 'muster' },
  // orbit
  { key: 'orbit.read', label: 'Open Orbit; see own leads, deals and activities', area: 'orbit' },
  { key: 'orbit.view_all', label: "See everyone's leads, deals and activities", area: 'orbit' },
  { key: 'orbit.close', label: 'Close deals and leads, reopen them and reassign owners (reviewer)', area: 'orbit' },
  { key: 'leads.write', label: 'Create and edit leads', area: 'orbit' },
  { key: 'deals.write', label: 'Create and move deals', area: 'orbit' },
  { key: 'contacts.write', label: 'Create and edit contacts', area: 'orbit' },
  { key: 'activities.write', label: 'Log calls, emails, meetings and follow-ups', area: 'orbit' },
  { key: 'orbit.reports', label: 'View Orbit reports', area: 'orbit' },
  { key: 'orbit.settings', label: 'Manage stages, sources and lost reasons', area: 'orbit' },
  // folio
  { key: 'folio.read', label: 'View invoices, quotes, receipts and ledgers', area: 'folio' },
  { key: 'invoices.write', label: 'Create and edit draft invoices', area: 'folio' },
  { key: 'invoices.issue', label: 'Issue invoices and email them', area: 'folio' },
  { key: 'invoices.void', label: 'Void invoices', area: 'folio' },
  { key: 'einvoice.cancel', label: 'Cancel e-invoice IRNs on the IRP', area: 'folio' },
  { key: 'quotes.write', label: 'Create quotes and proformas', area: 'folio' },
  { key: 'receipts.write', label: 'Record and allocate receipts', area: 'folio' },
  { key: 'recurring.write', label: 'Manage recurring retainers', area: 'folio' },
  { key: 'credit_notes.write', label: 'Issue credit notes', area: 'folio' },
  { key: 'collections.write', label: 'Follow up on dues and send payment reminders', area: 'folio' },
  { key: 'expenses.read', label: 'View business expenses and their receipts', area: 'folio' },
  { key: 'expenses.write', label: 'Book, edit and delete business expenses', area: 'folio' },
  { key: 'folio.reports', label: 'View Folio reports', area: 'folio' },
  { key: 'folio.settings', label: 'Manage firms, series, tax rates and bank accounts', area: 'folio' },
] as const satisfies readonly PermDef[]

export type Permission = (typeof PERMISSION_DEFS)[number]['key']
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_DEFS.map((p) => p.key)
export const permissionsOf = (area: AreaKey): Permission[] =>
  PERMISSION_DEFS.filter((p) => p.area === area).map((p) => p.key)
export const isPermission = (value: string): value is Permission =>
  (ALL_PERMISSIONS as readonly string[]).includes(value)

// ---------------------------------------------------------------------------
// Products and features
// ---------------------------------------------------------------------------

export type FeatureDef = {
  key: string
  name: string
  description: string
  icon: IconName
  /** Muster Starter excludes features marked 'muster_business'. */
  requires?: 'muster_business'
}

export type ProductDef = {
  key: ProductKey
  name: string
  shortName: string
  tagline: string
  description: string
  /** Accent colour (hex) and its CSS variable. */
  accent: string
  accentVar: string
  icon: IconName
  home: string
  slug: string
  features: FeatureDef[]
}

/** What each product is for, shown after its name inside the app ("Muster · HR"). */
export const PRODUCT_DESCRIPTOR: Readonly<Record<ProductKey, string>> = { work: 'Tasks', muster: 'HR', orbit: 'Sales', folio: 'Invoicing' }

/** The in-app product name with its descriptor, e.g. "Muster · HR". */
export const productLabel = (product: ProductKey): string => `${PRODUCTS[product].shortName} · ${PRODUCT_DESCRIPTOR[product]}`

export const PRODUCTS: Record<ProductKey, ProductDef> = {
  work: {
    key: 'work',
    name: 'Flowbit Work',
    shortName: 'Work',
    slug: 'work',
    tagline: 'Tasks, projects and teams in one calm place.',
    description:
      'Plan projects, assign tasks, run meetings, log time and keep everyone on the same page. Arc reads your workspace and suggests the next step; you decide.',
    accent: '#C084FC',
    accentVar: '--work',
    icon: 'SquareCheckBig',
    home: '/app/work/tasks',
    features: [
      { key: 'work.tasks', name: 'Tasks', description: 'List, board and calendar views, subtasks, checklists, comments with @mentions and saved views.', icon: 'SquareCheckBig' },
      { key: 'work.spaces', name: 'Spaces', description: 'Group work into spaces and lists, each with its own members and colours.', icon: 'LayoutGrid' },
      { key: 'work.projects', name: 'Projects', description: 'Milestones, health, progress rings, files and an activity trail for every project.', icon: 'FolderKanban' },
      { key: 'work.teams', name: 'Teams', description: 'See who is on which team and how much work each person carries.', icon: 'UsersRound' },
      { key: 'work.meetings', name: 'Meetings', description: 'Agendas, attendees, notes and action items that turn into tasks.', icon: 'CalendarDays' },
      { key: 'work.posts', name: 'Posts', description: 'Announcements with pinning, read receipts, replies and reactions.', icon: 'Megaphone' },
      { key: 'work.time', name: 'Time tracking', description: 'Timers, manual entries, weekly timesheets and manager approval.', icon: 'Timer' },
      { key: 'work.whiteboards', name: 'Whiteboards', description: 'Sketch flows and ideas together; boards save with the workspace.', icon: 'PenTool' },
      { key: 'work.reports', name: 'Reports', description: 'Throughput, overdue work, time by project and project health, with CSV export.', icon: 'ChartColumn' },
      { key: 'work.arc', name: 'Arc assistant', description: 'Search everything and get suggested outlines, breakdowns and weekly updates. Nothing changes until you click Apply.', icon: 'Sparkles' },
    ],
  },
  muster: {
    key: 'muster',
    name: 'Muster',
    shortName: 'Muster',
    slug: 'muster',
    tagline: 'HR and payroll built for Indian teams.',
    description:
      'People records, attendance, leave, reimbursements, payroll with PF, ESI and PT, HR letters and employee self-service, in one place.',
    accent: '#5EEAB0',
    accentVar: '--muster',
    icon: 'UserRound',
    home: '/app/hr',
    features: [
      { key: 'muster.people', name: 'People', description: 'Employee master with documents, nominees, bank and statutory details, and CSV import.', icon: 'Users' },
      { key: 'muster.attendance', name: 'Attendance', description: 'Web check-in, a monthly register, corrections and month locking.', icon: 'Fingerprint' },
      { key: 'muster.leave', name: 'Leave', description: 'Leave types and policies, balances, approvals and a team calendar.', icon: 'CalendarCheck' },
      { key: 'muster.claims', name: 'Reimbursements', description: 'Public claim forms with work-email OTP, receipt uploads and a review queue.', icon: 'Wallet' },
      { key: 'muster.payroll', name: 'Payroll', description: 'An 8-stage payroll run with PF, ESI and PT by state, holds, adjustments and payslips.', icon: 'Banknote', requires: 'muster_business' },
      { key: 'muster.letters', name: 'HR letters', description: 'Twenty templates with numbered references, PDFs and email. Issued letters are never deleted.', icon: 'FileSignature' },
      { key: 'muster.self_service', name: 'Self-service', description: 'Employees see their attendance, leave, payslips, claims, letters and documents.', icon: 'UserCheck' },
      { key: 'muster.reports', name: 'HR reports', description: 'Employee master, attendance, leave, payroll register, PF/ESI/PT and gratuity, with CSV.', icon: 'ChartColumn' },
    ],
  },
  orbit: {
    key: 'orbit',
    name: 'Orbit',
    shortName: 'Orbit',
    slug: 'orbit',
    tagline: 'A CRM that follows up for you.',
    description:
      'Leads, deals, contacts and activities with a drag-and-drop pipeline, follow-up reminders and conversion reports. Won deals flow into Folio.',
    accent: '#60A5FA',
    accentVar: '--orbit',
    icon: 'Orbit',
    home: '/app/orbit',
    features: [
      { key: 'orbit.leads', name: 'Leads', description: 'Capture leads by source and sector, track cold and warm, convert to client and deal.', icon: 'Target' },
      { key: 'orbit.deals', name: 'Deal pipeline', description: 'Kanban by stage with values and probability; drag to move.', icon: 'Kanban' },
      { key: 'orbit.contacts', name: 'Contacts', description: 'Everyone you talk to, linked to their company and history.', icon: 'Contact' },
      { key: 'orbit.activities', name: 'Activities', description: 'Calls, emails, meetings, notes and follow-ups due today, overdue or upcoming.', icon: 'PhoneCall' },
      { key: 'orbit.reports', name: 'Pipeline reports', description: 'Conversion by source and owner, cold vs warm, and won/lost reasons.', icon: 'ChartLine' },
    ],
  },
  folio: {
    key: 'folio',
    name: 'Folio',
    shortName: 'Folio',
    slug: 'folio',
    tagline: 'Quotes, invoices and collections without the spreadsheet.',
    description:
      'Quotes, invoices, receipts, reminders, expenses and P&L in one place, with GST worked out for you, for one or many business entities.',
    accent: '#F5B85C',
    accentVar: '--folio',
    icon: 'ReceiptIndianRupee',
    home: '/app/folio',
    features: [
      { key: 'folio.invoices', name: 'GST invoices', description: 'CGST+SGST or IGST worked out from the place of supply, number series per firm and FY, PDF and email.', icon: 'FileText' },
      { key: 'folio.quotes', name: 'Quotes and proformas', description: 'Send a quote, convert it to an invoice in one click.', icon: 'ClipboardList' },
      { key: 'folio.receipts', name: 'Receipts', description: 'Record money received and allocate it across invoices; the rest stays as an advance.', icon: 'Receipt' },
      { key: 'folio.recurring', name: 'Recurring retainers', description: 'Monthly drafts created for you, ready to review and issue.', icon: 'Repeat' },
      { key: 'folio.credit_notes', name: 'Credit notes', description: 'Reduce what a client owes, with a proper paper trail.', icon: 'FileMinus' },
      { key: 'folio.ledger', name: 'Client ledgers', description: 'A running statement for every client, exportable as PDF.', icon: 'BookOpen' },
      { key: 'folio.reports', name: 'Reports', description: 'Aging buckets, GST summary for GSTR-1, collections and revenue by client and month.', icon: 'ChartPie' },
    ],
  },
}

export type FeatureKey = string
export const featureByKey = (key: FeatureKey): FeatureDef | undefined =>
  Object.values(PRODUCTS)
    .flatMap((p) => p.features)
    .find((f) => f.key === key)

// ---------------------------------------------------------------------------
// Pages (every href must exist)
// ---------------------------------------------------------------------------

export type PageArea = AreaKey | 'clients' | 'me' | 'settings'

export type PageDef = {
  /** Route pattern with [param] segments. */
  href: string
  title: string
  area: PageArea
  /** Product(s) required: the page is available when ANY of them is on. */
  products?: ProductKey[]
  perm?: Permission
  /** Opens with any of these instead of `perm` (e.g. quotes: folio.read or quotes.write). */
  anyPerm?: Permission[]
  /** Feature gate within a product (e.g. payroll needs Muster Business). */
  feature?: FeatureKey
  /** How the page shows as an ancestor in breadcrumbs, when that differs from its own title and link. */
  crumb?: Crumb
  /** The agent that builds the page. */
  owner: 'foundation' | 'marketing' | 'work-a' | 'work-b' | 'muster-a' | 'muster-b' | 'orbit' | 'folio' | 'settings'
}

const W: ProductKey[] = ['work']
const M: ProductKey[] = ['muster']
const O: ProductKey[] = ['orbit']
const F: ProductKey[] = ['folio']

export const PAGES: PageDef[] = [
  // core
  { href: '/app', title: 'Home', area: 'core', owner: 'work-a' },
  { href: '/app/notifications', title: 'Notifications', area: 'core', owner: 'settings' },
  { href: '/app/approvals', title: 'Approvals', area: 'core', owner: 'settings' },
  // Every settings page sits under it by path, but My account and the rest are not part of "General",
  // and members without org.manage can't open it: as an ancestor it reads "Settings" and links to My account.
  { href: '/app/settings', title: 'General', crumb: { label: 'Settings', href: '/app/settings/profile' }, area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/company', title: 'Company profile', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/profile', title: 'My account (login)', area: 'settings', owner: 'settings' },
  { href: '/app/settings/profile/notifications', title: 'My alerts', area: 'settings', owner: 'settings' },
  { href: '/app/settings/profile/briefs', title: 'Briefs', area: 'settings', owner: 'settings' },
  { href: '/app/settings/security', title: 'Security', area: 'settings', owner: 'settings' },
  { href: '/app/settings/appearance', title: 'Appearance', area: 'settings', owner: 'settings' },
  { href: '/app/settings/members', title: 'Members', area: 'settings', perm: 'members.manage', owner: 'settings' },
  { href: '/app/settings/roles', title: 'Roles', area: 'settings', perm: 'roles.manage', owner: 'settings' },
  { href: '/app/settings/modules', title: 'Modules', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/subscription', title: 'Plan & billing', area: 'settings', perm: 'billing.manage', owner: 'settings' },
  { href: '/app/settings/integrations', title: 'Integrations', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/integrations/razorpay', title: 'Razorpay', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/integrations/whatsapp', title: 'WhatsApp', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/integrations/google', title: 'Google', area: 'settings', owner: 'settings' },
  { href: '/app/settings/integrations/ai', title: 'Connected apps', area: 'settings', owner: 'settings' },
  { href: '/app/settings/integrations/webhooks', title: 'Webhooks', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/integrations/slack', title: 'Slack', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/billing/wallet', title: 'WhatsApp wallet', crumb: { label: 'Plan & billing', href: '/app/settings/subscription' }, area: 'settings', perm: 'billing.manage', owner: 'settings' },
  { href: '/app/whatsapp', title: 'WhatsApp inbox', area: 'core', perm: 'clients.read', owner: 'settings' },
  { href: '/app/whatsapp/[id]', title: 'WhatsApp chat', area: 'core', perm: 'clients.read', owner: 'settings' },
  { href: '/app/settings/automations', title: 'Automations', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/compliance', title: 'Compliance calendar', area: 'settings', anyPerm: ['org.manage', 'folio.settings'], owner: 'settings' },
  { href: '/app/settings/automations/new', title: 'New automation', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/automations/[id]', title: 'Automation', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/audit', title: 'Audit log', area: 'settings', perm: 'audit.read', owner: 'settings' },
  { href: '/app/settings/notifications', title: 'Workspace alerts', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/messages', title: 'Messages log', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/export', title: 'Export', area: 'settings', owner: 'settings' },
  { href: '/app/settings/import', title: 'Import', area: 'settings', owner: 'settings' },
  { href: '/app/settings/import/[kind]', title: 'Import', area: 'settings', owner: 'settings' },
  { href: '/app/settings/support', title: 'Support access', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/privacy', title: 'Privacy', area: 'settings', perm: 'org.manage', owner: 'settings' },
  { href: '/app/settings/domains', title: 'Domains', area: 'settings', perm: 'org.manage', owner: 'settings' },

  // work
  { href: '/app/arc', title: 'Arc', area: 'work', products: W, perm: 'arc.use', owner: 'work-b' },
  { href: '/app/work/tasks', title: 'Tasks', area: 'work', products: W, perm: 'tasks.read', owner: 'work-a' },
  { href: '/app/work/tasks/[id]', title: 'Task', area: 'work', products: W, perm: 'tasks.read', owner: 'work-a' },
  { href: '/app/work/spaces', title: 'Spaces', area: 'work', products: W, perm: 'tasks.read', owner: 'work-a' },
  { href: '/app/work/spaces/[id]', title: 'Space', area: 'work', products: W, perm: 'tasks.read', owner: 'work-a' },
  { href: '/app/work/projects', title: 'Projects', area: 'work', products: W, perm: 'projects.read', owner: 'work-a' },
  { href: '/app/work/projects/[id]', title: 'Project', area: 'work', products: W, perm: 'projects.read', owner: 'work-a' },
  { href: '/app/work/teams', title: 'Teams', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/teams/[id]', title: 'Team', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/meetings', title: 'Meetings', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/meetings/[id]', title: 'Meeting', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/posts', title: 'Posts', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/posts/[id]', title: 'Post', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/time', title: 'Time', area: 'work', products: W, perm: 'time.write', owner: 'work-b' },
  { href: '/app/work/time/approvals', title: 'Time approvals', area: 'work', products: W, perm: 'time.approve', owner: 'work-b' },
  { href: '/app/work/whiteboards', title: 'Whiteboards', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/whiteboards/[id]', title: 'Whiteboard', area: 'work', products: W, owner: 'work-b' },
  { href: '/app/work/reports', title: 'Work reports', area: 'work', products: W, perm: 'work.reports', owner: 'work-b' },

  // clients (shared)
  { href: '/app/clients', title: 'Clients', area: 'clients', products: ['work', 'orbit', 'folio'], perm: 'clients.read', owner: 'orbit' },
  { href: '/app/clients/new', title: 'New client', area: 'clients', products: ['work', 'orbit', 'folio'], perm: 'clients.write', owner: 'orbit' },
  { href: '/app/clients/[id]', title: 'Client', area: 'clients', products: ['work', 'orbit', 'folio'], perm: 'clients.read', owner: 'orbit' },

  // muster (HR side)
  { href: '/app/hr', title: 'Muster', area: 'muster', products: M, perm: 'people.read', owner: 'muster-a' },
  { href: '/app/hr/people', title: 'People', area: 'muster', products: M, perm: 'people.read', owner: 'muster-a' },
  { href: '/app/hr/people/new', title: 'Add employee', area: 'muster', products: M, perm: 'people.write', owner: 'muster-a' },
  { href: '/app/hr/people/[id]', title: 'Employee', area: 'muster', products: M, perm: 'people.read', owner: 'muster-a' },
  { href: '/app/hr/people/[id]/edit', title: 'Edit employee', area: 'muster', products: M, perm: 'people.write', owner: 'muster-a' },
  { href: '/app/hr/attendance', title: 'Attendance', area: 'muster', products: M, perm: 'attendance.read', owner: 'muster-a' },
  { href: '/app/hr/attendance/corrections', title: 'Corrections', area: 'muster', products: M, perm: 'attendance.approve', owner: 'muster-a' },
  { href: '/app/hr/leave', title: 'Leave', area: 'muster', products: M, perm: 'leave.read', owner: 'muster-a' },
  { href: '/app/hr/leave/calendar', title: 'Leave calendar', area: 'muster', products: M, perm: 'leave.read', owner: 'muster-a' },
  { href: '/app/hr/leave/balances', title: 'Leave balances', area: 'muster', products: M, perm: 'leave.read', owner: 'muster-a' },
  { href: '/app/hr/settings', title: 'HR settings', area: 'muster', products: M, perm: 'hr.settings', owner: 'muster-a' },
  { href: '/app/hr/claims', title: 'Claims', area: 'muster', products: M, perm: 'claims.read', owner: 'muster-b' },
  { href: '/app/hr/claims/forms', title: 'Claim forms', area: 'muster', products: M, perm: 'claims.forms', owner: 'muster-b' },
  { href: '/app/hr/claims/forms/[id]', title: 'Claim form', area: 'muster', products: M, perm: 'claims.forms', owner: 'muster-b' },
  { href: '/app/hr/payroll', title: 'Payroll', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/hr/payroll/[id]', title: 'Payroll cycle', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/hr/payroll/structures', title: 'Salary structures', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/hr/payroll/tax', title: 'Salary tax', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/hr/payroll/tax/[employeeId]', title: 'Tax worksheet', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/hr/letters', title: 'Letters', area: 'muster', products: M, perm: 'letters.read', owner: 'muster-b' },
  { href: '/app/hr/letters/new', title: 'New letter', area: 'muster', products: M, perm: 'letters.write', owner: 'muster-b' },
  { href: '/app/hr/letters/[id]', title: 'Letter', area: 'muster', products: M, perm: 'letters.read', owner: 'muster-b' },
  { href: '/app/hr/reports', title: 'HR reports', area: 'muster', products: M, perm: 'hr.reports', owner: 'muster-b' },
  { href: '/app/hr/reports/gratuity', title: 'Gratuity', area: 'muster', products: M, perm: 'payroll.read', feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/c/[slug]', title: 'Claim form', area: 'muster', products: M, owner: 'muster-b' },

  // muster self-service (any member with a linked employee)
  { href: '/app/me', title: 'My employee record', area: 'me', products: M, owner: 'muster-b' },
  { href: '/app/me/attendance', title: 'My attendance', area: 'me', products: M, owner: 'muster-b' },
  { href: '/app/me/leave', title: 'My leave', area: 'me', products: M, owner: 'muster-b' },
  { href: '/app/me/payslips', title: 'My payslips', area: 'me', products: M, feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/me/tax', title: 'My tax', area: 'me', products: M, feature: 'muster.payroll', owner: 'muster-b' },
  { href: '/app/me/claims', title: 'My claims', area: 'me', products: M, owner: 'muster-b' },
  { href: '/app/me/letters', title: 'My letters', area: 'me', products: M, owner: 'muster-b' },
  { href: '/app/me/documents', title: 'My documents', area: 'me', products: M, owner: 'muster-b' },

  // orbit
  { href: '/app/orbit', title: 'Orbit', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/leads', title: 'Leads', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/leads/new', title: 'New lead', area: 'orbit', products: O, perm: 'leads.write', owner: 'orbit' },
  { href: '/app/orbit/leads/[id]', title: 'Lead', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/deals', title: 'Deals', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/deals/[id]', title: 'Deal', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/contacts', title: 'Contacts', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/contacts/[id]', title: 'Contact', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/activities', title: 'Activities', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/reports', title: 'Orbit reports', area: 'orbit', products: O, perm: 'orbit.reports', owner: 'orbit' },
  { href: '/app/orbit/sequences', title: 'Sequences', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/sequences/new', title: 'New sequence', area: 'orbit', products: O, perm: 'leads.write', owner: 'orbit' },
  { href: '/app/orbit/sequences/[id]', title: 'Sequence', area: 'orbit', products: O, perm: 'orbit.read', owner: 'orbit' },
  { href: '/app/orbit/settings', title: 'Orbit settings', area: 'orbit', products: O, perm: 'orbit.settings', owner: 'orbit' },

  // folio
  { href: '/app/folio', title: 'Folio', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/invoices', title: 'Invoices', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/invoices/new', title: 'New invoice', area: 'folio', products: F, perm: 'invoices.write', owner: 'folio' },
  { href: '/app/folio/invoices/[id]', title: 'Invoice', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/invoices/[id]/edit', title: 'Edit invoice', area: 'folio', products: F, perm: 'invoices.write', owner: 'folio' },
  { href: '/app/folio/quotes', title: 'Quotes', area: 'folio', products: F, anyPerm: ['folio.read', 'quotes.write'], owner: 'folio' },
  { href: '/app/folio/quotes/new', title: 'New quote', area: 'folio', products: F, perm: 'quotes.write', owner: 'folio' },
  { href: '/app/folio/quotes/[id]', title: 'Quote', area: 'folio', products: F, anyPerm: ['folio.read', 'quotes.write'], owner: 'folio' },
  { href: '/app/folio/receipts', title: 'Receipts', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/receipts/new', title: 'New receipt', area: 'folio', products: F, perm: 'receipts.write', owner: 'folio' },
  { href: '/app/folio/receipts/[id]', title: 'Receipt', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/recurring', title: 'Recurring', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/recurring/plans/new', title: 'New billing plan', area: 'folio', products: F, perm: 'recurring.write', owner: 'folio' },
  { href: '/app/folio/recurring/plans/[id]', title: 'Billing plan', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/credit-notes', title: 'Credit notes', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/credit-notes/new', title: 'New credit note', area: 'folio', products: F, perm: 'credit_notes.write', owner: 'folio' },
  { href: '/app/folio/credit-notes/[id]', title: 'Credit note', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/ledger', title: 'Ledgers', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/ledger/[clientId]', title: 'Ledger', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/collections', title: 'Collections', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/bank', title: 'Bank reconciliation', area: 'folio', products: F, perm: 'receipts.write', owner: 'folio' },
  { href: '/app/folio/expenses', title: 'Expenses', area: 'folio', products: F, perm: 'expenses.read', owner: 'folio' },
  { href: '/app/folio/expenses/new', title: 'New expense', area: 'folio', products: F, perm: 'expenses.write', owner: 'folio' },
  { href: '/app/folio/expenses/[id]', title: 'Expense', area: 'folio', products: F, perm: 'expenses.read', owner: 'folio' },
  { href: '/app/folio/pnl', title: 'Profit and loss', area: 'folio', products: F, perm: 'folio.reports', owner: 'folio' },
  { href: '/app/folio/forecast', title: 'Billing forecast', area: 'folio', products: F, perm: 'folio.read', owner: 'folio' },
  { href: '/app/folio/reports', title: 'Folio reports', area: 'folio', products: F, perm: 'folio.reports', owner: 'folio' },
  { href: '/app/folio/export', title: 'Export to Tally', area: 'folio', products: F, perm: 'folio.reports', owner: 'folio' },
  { href: '/app/folio/settings', title: 'Folio settings', area: 'folio', products: F, perm: 'folio.settings', owner: 'folio' },
]

const patternToRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, '[^/]+')}/?$`)

const PAGE_MATCHERS = PAGES.map((page) => ({ page, re: patternToRegex(page.href) }))

/** The page definition for a concrete pathname ('/app/work/tasks/abc' -> Task). */
export function findPage(pathname: string): PageDef | undefined {
  const clean = pathname.split('?')[0]
  // Static segments win over [param] ones ('/app/hr/payroll/structures' before '/app/hr/payroll/[id]').
  const hits = PAGE_MATCHERS.filter(({ re }) => re.test(clean))
  hits.sort((a, b) => countParams(a.page.href) - countParams(b.page.href))
  return hits[0]?.page
}
const countParams = (href: string) => (href.match(/\[/g) ?? []).length

/** What `canOpenPage` needs to know about the viewer (a server `Ctx` or the client shell both fit). */
export type PageViewer = { has: (product: ProductKey) => boolean; hasFeature: (feature: FeatureKey) => boolean; can: (perm: Permission) => boolean }

/**
 * Whether the catalog lets this viewer open a concrete path (product, feature and permission gates).
 * Unknown paths are allowed. Use it before rendering a link to another area, so nobody is offered a
 * link that lands on /app/denied or /app/locked. Record-level visibility is still the page's job.
 */
export function canOpenPage(pathname: string, viewer: PageViewer): boolean {
  const page = findPage(pathname)
  if (!page) return true
  if (page.products && !page.products.some((p) => viewer.has(p))) return false
  if (page.feature && !viewer.hasFeature(page.feature)) return false
  return pagePermitted(page, viewer.can)
}

/** The page's permission gate: `perm`, or any one of `anyPerm`. */
export const pagePermitted = (page: PageDef, can: (perm: Permission) => boolean): boolean =>
  (!page.perm || can(page.perm)) && (!page.anyPerm?.length || page.anyPerm.some(can))

export type Crumb = { label: string; href: string }

/** Breadcrumb trail from the catalog: every matching ancestor page, then the page itself. */
/** With a viewer, parent crumbs they cannot open are left out (sales reach Quotes but not Folio itself). */
export function breadcrumbFor(pathname: string, viewer?: PageViewer): Crumb[] {
  const segments = pathname.split('?')[0].split('/').filter(Boolean)
  const crumbs: Crumb[] = []
  for (let i = 1; i <= segments.length; i += 1) {
    const href = `/${segments.slice(0, i).join('/')}`
    const page = findPage(href)
    if (!page) continue
    const crumb = page.crumb && i < segments.length ? page.crumb : { label: page.title, href }
    if (viewer && i < segments.length && !canOpenPage(crumb.href, viewer)) continue
    if (!crumbs.some((c) => c.label === crumb.label && c.href === crumb.href)) crumbs.push(crumb)
  }
  return crumbs.length ? crumbs : [{ label: 'Home', href: '/app' }]
}

// ---------------------------------------------------------------------------
// Rail (left gradient pill)
// ---------------------------------------------------------------------------

export type RailItem = {
  key: string
  label: string
  href: string
  icon: IconName
  /** Any of these products must be entitled; otherwise the item shows a lock. */
  products?: ProductKey[]
  perm?: Permission
  /** Where to go instead when the member lacks `perm` (e.g. HR -> self-service). */
  fallbackHref?: string
  /** Offer `fallbackHref` only to members with this permission (Folio -> quotes for sales). */
  fallbackPerm?: Permission
  /** Path prefixes that make this item active. */
  match: string[]
  /** The product this item opens, shown as "Muster · HR" (the label is the product name). */
  product?: ProductKey
  special?: 'arc'
}

export const RAIL_TOP: RailItem[] = [
  { key: 'home', label: 'Home', href: '/app', icon: 'House', match: ['/app$'] },
  { key: 'arc', label: 'Arc', href: '/app/arc', icon: 'Sparkles', products: W, perm: 'arc.use', match: ['/app/arc'], special: 'arc' },
  { key: 'tasks', label: 'Tasks', href: '/app/work/tasks', icon: 'SquareCheckBig', products: W, perm: 'tasks.read', match: ['/app/work/tasks'] },
  { key: 'spaces', label: 'Spaces', href: '/app/work/spaces', icon: 'LayoutGrid', products: W, perm: 'tasks.read', match: ['/app/work/spaces'] },
  { key: 'team', label: 'Teams', href: '/app/work/teams', icon: 'UsersRound', products: W, match: ['/app/work/teams'] },
  { key: 'project', label: 'Projects', href: '/app/work/projects', icon: 'FolderKanban', products: W, perm: 'projects.read', match: ['/app/work/projects'] },
  { key: 'client', label: 'Clients', href: '/app/clients', icon: 'Building2', products: ['work', 'orbit', 'folio'], perm: 'clients.read', match: ['/app/clients'] },
  { key: 'meeting', label: 'Meetings', href: '/app/work/meetings', icon: 'CalendarDays', products: W, match: ['/app/work/meetings'] },
  { key: 'reports', label: 'Work reports', href: '/app/work/reports', icon: 'ChartColumn', products: W, perm: 'work.reports', match: ['/app/work/reports'] },
  { key: 'hr', label: 'Muster', product: 'muster', href: '/app/hr', icon: 'UserRound', products: M, perm: 'people.read', fallbackHref: '/app/me', match: ['/app/hr', '/app/me'] },
  { key: 'orbit', label: 'Orbit', product: 'orbit', href: '/app/orbit', icon: 'Orbit', products: O, perm: 'orbit.read', match: ['/app/orbit'] },
  { key: 'folio', label: 'Folio', product: 'folio', href: '/app/folio', icon: 'ReceiptIndianRupee', products: F, perm: 'folio.read', fallbackHref: '/app/folio/quotes', fallbackPerm: 'quotes.write', match: ['/app/folio'] },
]

export const RAIL_BOTTOM: RailItem[] = [
  { key: 'invite', label: 'Invite', href: '/app/settings/members?invite=1', icon: 'UserPlus', perm: 'members.manage', match: [] },
  { key: 'settings', label: 'Settings', href: '/app/settings/profile', icon: 'Settings', match: ['/app/settings'] },
]

export const railItemActive = (item: RailItem, pathname: string) =>
  item.match.some((m) => (m.endsWith('$') ? pathname === m.slice(0, -1) : pathname === m || pathname.startsWith(`${m}/`)))

// ---------------------------------------------------------------------------
// Side panel (contextual sections)
// ---------------------------------------------------------------------------

export type SideLink = {
  label: string
  href: string
  icon: IconName
  perm?: Permission
  /** Shown with any one of these (the page's own `anyPerm` gate). */
  anyPerm?: Permission[]
  feature?: FeatureKey
  products?: ProductKey[]
  /** Shown only once the workspace has connected that integration. */
  requires?: 'whatsapp'
}

export type SideSection = {
  key: string
  label: string
  icon?: IconName
  links?: SideLink[]
  /** Filled at runtime by the shell from MongoDB. */
  dynamic?: 'projects' | 'teams'
  /** "+" button next to the label. */
  addHref?: string
  addPerm?: Permission
  /** Only for members with a linked employee record (self-service). */
  selfService?: boolean
  /** Hidden without this permission (the section's links open a page that needs it). */
  perm?: Permission
}

export type PanelKey = 'work' | 'muster' | 'orbit' | 'folio' | 'settings'

export const SIDE_PANELS: Record<PanelKey, SideSection[]> = {
  work: [
    { key: 'projects', label: 'Projects', icon: 'FolderKanban', dynamic: 'projects', addHref: '/app/work/projects?new=1', addPerm: 'projects.write', perm: 'projects.read' },
    { key: 'teams', label: 'Teams', icon: 'UsersRound', dynamic: 'teams', addHref: '/app/work/teams?new=1', addPerm: 'teams.manage' },
    {
      key: 'tools',
      label: 'Tools',
      icon: 'Zap',
      links: [
        { label: 'Whiteboard', href: '/app/work/whiteboards', icon: 'PenTool', products: W },
        { label: 'Posts', href: '/app/work/posts', icon: 'Megaphone', products: W },
        { label: 'Time', href: '/app/work/time', icon: 'Timer', products: W, perm: 'time.write' },
        { label: 'Time approvals', href: '/app/work/time/approvals', icon: 'ClipboardList', products: W, perm: 'time.approve' },
        { label: 'WhatsApp inbox', href: '/app/whatsapp', icon: 'Inbox', perm: 'clients.read', requires: 'whatsapp' },
      ],
    },
  ],
  muster: [
    {
      key: 'people',
      label: 'People',
      icon: 'Users',
      links: [
        { label: 'Muster', href: '/app/hr', icon: 'House', perm: 'people.read' },
        { label: 'People', href: '/app/hr/people', icon: 'Users', perm: 'people.read' },
        { label: 'Import', href: '/app/settings/import/employees?from=people', icon: 'Upload', perm: 'people.import' },
      ],
    },
    {
      key: 'time',
      label: 'Attendance & leave',
      icon: 'Clock',
      links: [
        { label: 'Attendance', href: '/app/hr/attendance', icon: 'Fingerprint', perm: 'attendance.read' },
        { label: 'Corrections', href: '/app/hr/attendance/corrections', icon: 'ClipboardList', perm: 'attendance.approve' },
        { label: 'Leave', href: '/app/hr/leave', icon: 'CalendarCheck', perm: 'leave.read' },
        { label: 'Leave calendar', href: '/app/hr/leave/calendar', icon: 'CalendarDays', perm: 'leave.read' },
        { label: 'Balances', href: '/app/hr/leave/balances', icon: 'Layers', perm: 'leave.read' },
      ],
    },
    {
      key: 'pay',
      label: 'Pay',
      icon: 'IndianRupee',
      links: [
        { label: 'Payroll', href: '/app/hr/payroll', icon: 'Banknote', perm: 'payroll.read', feature: 'muster.payroll' },
        { label: 'Structures', href: '/app/hr/payroll/structures', icon: 'Landmark', perm: 'payroll.read', feature: 'muster.payroll' },
        { label: 'Salary tax', href: '/app/hr/payroll/tax', icon: 'Receipt', perm: 'payroll.read', feature: 'muster.payroll' },
        { label: 'Claims', href: '/app/hr/claims', icon: 'Wallet', perm: 'claims.read' },
        { label: 'Claim forms', href: '/app/hr/claims/forms', icon: 'FileText', perm: 'claims.forms' },
      ],
    },
    {
      key: 'docs',
      label: 'Documents',
      icon: 'FileSignature',
      links: [{ label: 'Letters', href: '/app/hr/letters', icon: 'FileSignature', perm: 'letters.read' }],
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: 'ChartColumn',
      links: [
        { label: 'HR reports', href: '/app/hr/reports', icon: 'ChartColumn', perm: 'hr.reports' },
        { label: 'HR settings', href: '/app/hr/settings', icon: 'Settings', perm: 'hr.settings' },
      ],
    },
    {
      key: 'me',
      label: 'My HR',
      icon: 'UserCheck',
      selfService: true,
      links: [
        { label: 'My employee record', href: '/app/me', icon: 'UserRound' },
        { label: 'My attendance', href: '/app/me/attendance', icon: 'Fingerprint' },
        { label: 'My leave', href: '/app/me/leave', icon: 'CalendarCheck' },
        { label: 'My payslips', href: '/app/me/payslips', icon: 'Banknote', feature: 'muster.payroll' },
        { label: 'My tax', href: '/app/me/tax', icon: 'Receipt', feature: 'muster.payroll' },
        { label: 'My claims', href: '/app/me/claims', icon: 'Wallet' },
        { label: 'My letters', href: '/app/me/letters', icon: 'FileSignature' },
        { label: 'My documents', href: '/app/me/documents', icon: 'FileText' },
      ],
    },
  ],
  orbit: [
    {
      key: 'pipeline',
      label: 'Sales',
      icon: 'Orbit',
      links: [
        { label: 'Orbit', href: '/app/orbit', icon: 'House' },
        { label: 'Leads', href: '/app/orbit/leads', icon: 'Target' },
        { label: 'Deals', href: '/app/orbit/deals', icon: 'Kanban' },
        { label: 'Contacts', href: '/app/orbit/contacts', icon: 'Contact' },
        { label: 'Activities', href: '/app/orbit/activities', icon: 'PhoneCall' },
        { label: 'Sequences', href: '/app/orbit/sequences', icon: 'Repeat' },
        { label: 'Clients', href: '/app/clients?from=orbit', icon: 'Building2', perm: 'clients.read' },
        { label: 'WhatsApp inbox', href: '/app/whatsapp?from=orbit', icon: 'Inbox', perm: 'clients.read', requires: 'whatsapp' },
      ],
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: 'ChartLine',
      links: [
        { label: 'Reports', href: '/app/orbit/reports', icon: 'ChartLine', perm: 'orbit.reports' },
        { label: 'Settings', href: '/app/orbit/settings', icon: 'Settings', perm: 'orbit.settings' },
      ],
    },
  ],
  folio: [
    {
      key: 'billing',
      label: 'Invoicing',
      icon: 'ReceiptIndianRupee',
      links: [
        { label: 'Folio', href: '/app/folio', icon: 'House', perm: 'folio.read' },
        { label: 'Invoices', href: '/app/folio/invoices', icon: 'FileText', perm: 'folio.read' },
        { label: 'Quotes', href: '/app/folio/quotes', icon: 'ClipboardList' },
        { label: 'Receipts', href: '/app/folio/receipts', icon: 'Receipt', perm: 'folio.read' },
        { label: 'Bank', href: '/app/folio/bank', icon: 'Landmark', perm: 'receipts.write' },
        { label: 'Recurring', href: '/app/folio/recurring', icon: 'Repeat', perm: 'folio.read' },
        { label: 'Credit notes', href: '/app/folio/credit-notes', icon: 'FileMinus', perm: 'folio.read' },
        { label: 'Clients', href: '/app/clients?from=folio', icon: 'Building2', perm: 'clients.read' },
      ],
    },
    {
      key: 'money-in',
      label: 'Money in',
      icon: 'Wallet',
      links: [
        { label: 'Collections', href: '/app/folio/collections', icon: 'PhoneCall', perm: 'folio.read' },
        { label: 'Ledgers', href: '/app/folio/ledger', icon: 'BookOpen', perm: 'folio.read' },
        { label: 'Forecast', href: '/app/folio/forecast', icon: 'ChartLine', perm: 'folio.read' },
      ],
    },
    {
      key: 'money-out',
      label: 'Money out',
      icon: 'Banknote',
      links: [
        { label: 'Expenses', href: '/app/folio/expenses', icon: 'Wallet', perm: 'expenses.read' },
        { label: 'Profit & loss', href: '/app/folio/pnl', icon: 'Scale', perm: 'folio.reports' },
      ],
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: 'ChartPie',
      links: [
        { label: 'Reports', href: '/app/folio/reports', icon: 'ChartPie', perm: 'folio.reports' },
        { label: 'Compliance calendar', href: '/app/settings/compliance', icon: 'CalendarDays', anyPerm: ['org.manage', 'folio.settings'] },
        { label: 'Export', href: '/app/folio/export', icon: 'Download', perm: 'folio.reports' },
        { label: 'Settings', href: '/app/folio/settings', icon: 'Settings', perm: 'folio.settings' },
      ],
    },
  ],
  settings: [
    {
      key: 'personal',
      label: 'You',
      icon: 'UserRound',
      links: [
        { label: 'My account (login)', href: '/app/settings/profile', icon: 'UserRound' },
        { label: 'Security', href: '/app/settings/security', icon: 'KeyRound' },
        { label: 'Appearance', href: '/app/settings/appearance', icon: 'Palette' },
        { label: 'My alerts', href: '/app/settings/profile/notifications', icon: 'Zap' },
        { label: 'Briefs', href: '/app/settings/profile/briefs', icon: 'Sparkles' },
        { label: 'Google', href: '/app/settings/integrations/google', icon: 'CalendarDays' },
        { label: 'Connected apps', href: '/app/settings/integrations/ai', icon: 'Sparkles' },
      ],
    },
    {
      key: 'company',
      label: 'Company',
      icon: 'Building2',
      links: [
        { label: 'General', href: '/app/settings', icon: 'Settings', perm: 'org.manage' },
        { label: 'Company profile', href: '/app/settings/company', icon: 'FileSignature', perm: 'org.manage' },
        { label: 'Domains', href: '/app/settings/domains', icon: 'Globe', perm: 'org.manage' },
        { label: 'Privacy', href: '/app/settings/privacy', icon: 'Fingerprint', perm: 'org.manage' },
      ],
    },
    {
      key: 'access',
      label: 'People and access',
      icon: 'Users',
      links: [
        { label: 'Members', href: '/app/settings/members', icon: 'Users', perm: 'members.manage' },
        { label: 'Roles', href: '/app/settings/roles', icon: 'Shield', perm: 'roles.manage' },
        { label: 'Support access', href: '/app/settings/support', icon: 'ShieldCheck', perm: 'org.manage' },
        { label: 'Audit log', href: '/app/settings/audit', icon: 'ScrollText', perm: 'audit.read' },
      ],
    },
    {
      key: 'plan',
      label: 'Plan',
      icon: 'CreditCard',
      links: [{ label: 'Plan & billing', href: '/app/settings/subscription', icon: 'CreditCard', perm: 'billing.manage' }],
    },
    {
      key: 'automation',
      label: 'Automation and messages',
      icon: 'Zap',
      links: [
        { label: 'Workspace alerts', href: '/app/settings/notifications', icon: 'Bell', perm: 'org.manage' },
        { label: 'Automations', href: '/app/settings/automations', icon: 'Zap', perm: 'org.manage' },
        { label: 'Compliance calendar', href: '/app/settings/compliance', icon: 'CalendarDays', anyPerm: ['org.manage', 'folio.settings'] },
        { label: 'Messages log', href: '/app/settings/messages', icon: 'Mail', perm: 'org.manage' },
      ],
    },
    {
      key: 'data',
      label: 'Data',
      icon: 'Layers',
      links: [
        { label: 'Import', href: '/app/settings/import', icon: 'Upload' },
        // The page is open to everyone (only the owner downloads; others see why and where module CSVs are).
        { label: 'Export', href: '/app/settings/export', icon: 'Download' },
        { label: 'Integrations', href: '/app/settings/integrations', icon: 'Plug', perm: 'org.manage' },
        { label: 'Modules', href: '/app/settings/modules', icon: 'Puzzle', perm: 'org.manage' },
      ],
    },
  ],
}

/** Pages several products share (Clients, the WhatsApp inbox): they keep the side panel of the product the member came from. */
export const SHARED_PANEL_PATHS = ['/app/clients', '/app/whatsapp'] as const
const SHARED_FROM: readonly PanelKey[] = ['orbit', 'folio']

export const isSharedPanelPath = (pathname: string): boolean => SHARED_PANEL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/** Reads a `?from=` value (or a remembered panel) as a product panel a shared page may keep, else null. */
export const sharedPanelFrom = (value: string | null | undefined): PanelKey | null => (SHARED_FROM as readonly string[]).includes(value ?? '') ? (value as PanelKey) : null

/**
 * Which side panel a pathname shows. On a shared page, `from` (the product the member came from: Orbit or
 * Folio) keeps that product's panel, so opening Clients from Folio does not drop the member into Work.
 */
export function panelFor(pathname: string, from?: string | null): PanelKey {
  if (pathname.startsWith('/app/hr') || pathname.startsWith('/app/me')) return 'muster'
  // An import opened from an HR page (Settings → Import, ?from=people) keeps Muster's panel.
  if (pathname.startsWith('/app/settings/import/') && (from === 'people' || from === 'attendance')) return 'muster'
  if (pathname.startsWith('/app/orbit')) return 'orbit'
  if (pathname.startsWith('/app/folio')) return 'folio'
  if (pathname.startsWith('/app/settings')) return 'settings'
  if (isSharedPanelPath(pathname)) return sharedPanelFrom(from) ?? 'work'
  return 'work'
}
