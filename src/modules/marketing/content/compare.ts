/**
 * The "Flowbit 1 and 2" page (/compare-v1-v2). Every number was counted in
 * the repository on 9 Oct 2026 against the v1 baseline commit b972907
 * (7 Oct 2026), the same way docs/FEATURES.md counts them; `how` says how.
 * Recount before changing a figure.
 */

export type CompareStat = { label: string; v1: string; v2: string; how: string }

export const COUNTED_ON = '9 Oct 2026'

export const COMPARE_STATS: readonly CompareStat[] = [
  { label: 'Products', v1: '4', v2: '4 + Console', how: 'Work, Muster, Orbit and Folio in one app; the Console is the Flowbit team’s own back office on its own host.' },
  { label: 'Pages', v1: '122', v2: '183', how: 'Every page.tsx under src/app, including the marketing site, sign-in, public document links and the Console.' },
  { label: 'API routes', v1: '39', v2: '87', how: 'Every route.ts under src/app: exports, PDFs, webhooks and scheduled jobs.' },
  { label: 'Automated tests', v1: '915', v2: '2,139', how: 'Tests run by vitest on every change; all pass before a commit.' },
  { label: 'Test files', v1: '98', v2: '228', how: 'Files ending in .test.ts or .test.tsx under src.' },
  { label: 'Server actions', v1: '321', v2: '509', how: 'Writes made through the action wrapper, which validates input with a schema and checks the signed-in member, their permission and the plan.' },
  { label: 'Data models', v1: '83', v2: '149', how: 'Collections defined under src/models; workspace data is scoped to its workspace.' },
  { label: 'Workspace roles', v1: '8 built-in + custom', v2: '8 built-in + custom', how: 'Owner, Admin, HR admin, HR executive, Finance, Manager, Sales and Member, from 76 permissions; custom roles pick from the same list.' },
]

export type CompareGroup = { title: string; items: readonly string[] }

/** What v2 added, from CHANGELOG.md, docs/FEATURES.md and docs/archive/STATUS-HISTORY.md (v2.0 to v2.2). */
export const V2_ADDED: readonly CompareGroup[] = [
  { title: 'Plans and the back office', items: ['Free, Trial, Paid, Comped, Internal and Test accounts with a read-only, blocked, deleted lifecycle', 'The Console: accounts, billing, dunning, offline payments, staff roles with two-factor sign-in, reports and incidents', 'Prices, limits, templates and tax rules changed in settings, without a release'] },
  { title: 'Notifications and automations', items: ['Alerts by channel per person and workspace, digests, quiet hours and snooze', 'Emails with Approve, Reject and Mark done buttons; calendar invites for meetings', 'Morning briefs and an automations engine with ready recipes', 'A messages log with delivery timelines, retries and bounce handling'] },
  { title: 'Clients and money', items: ['Online invoices, quotes, receipts and statements with UPI QR and Razorpay links', 'A read-only client portal with email-code sign-in and approvals', 'Bank statement import that matches receipts, with undo', 'E-invoice IRN and e-way bills through a GSP'] },
  { title: 'People and payroll', items: ['Break types, effective and payable hours', 'Salary TDS worksheet with declarations, proofs, the Form 138 (earlier 24Q) data export and Form 130 (earlier Form 16) Part B', 'Hindi for My HR, check-in, leave and bilingual payslips'] },
  { title: 'Work and sales', items: ['Meetings AI: transcripts, minutes and draft tasks', 'Email to task, Slack, outbound webhooks and AI app connections', 'Orbit sequences that stop when a lead replies'] },
  { title: 'Trust and control', items: ['Two-factor sign-in for workspace users, with remembered devices', 'DPDP tools: export or erase one person’s data, retention pruning and a data processing agreement', 'Support access that owners approve, read-only or import-only', 'Whole-workspace export as a ZIP'] },
]

/** How the code is held to account (each true of the code today). */
export const ENGINEERING: readonly CompareGroup[] = [
  { title: 'Checked on every change', items: ['TypeScript in strict mode across the app', 'The full test suite, the type checker, the linter and a production build all pass before a commit lands'] },
  { title: 'Role checks at the server', items: ['Server actions check the signed-in member, their permission and the workspace’s plan before they change anything', 'Each query is scoped to the signed-in workspace'] },
  { title: 'Audited and encrypted', items: ['Sensitive changes are written to an audit log with who, what and when', 'Payment keys, GSP and Google tokens and two-factor secrets are encrypted at rest with AES-256-GCM'] },
]
