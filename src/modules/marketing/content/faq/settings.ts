import { FILE_LIMITS_COPY, IMPORT_LIMITS_COPY } from '../limits'
import { ACTION_LINK_RULE } from '@/modules/actionlinks/kinds'
import { DATA_LOCATION } from '../../legal/providers'
import type { FaqItem } from './types'

/** Settings and security: roles, branding, alerts, automations, data and sign-in. */
export const SETTINGS_FAQ: readonly FaqItem[] = [
  {
    id: 'roles-permissions',
    category: 'settings',
    q: 'How do roles and permissions work?',
    a: 'Everyone has a role. Eight are built in (Owner, Admin, HR admin, HR executive, Finance, Manager, Sales and Member), so most teams change nothing. Need something else? Create a custom role and tick exactly what it can see and do, product by product.',
    guide: 'settings#admin-roles',
  },
  {
    id: 'modules',
    category: 'settings',
    q: 'Can I hide products we don’t use?',
    a: 'Yes. Settings → Modules turns products on or off, and what is off disappears from everyone’s navigation.',
    guide: 'settings#admin-modules',
  },
  {
    id: 'company-profile',
    category: 'settings',
    q: 'Can our PDFs carry our letterhead and signature?',
    a: 'Yes. Settings → Company profile holds your legal name, GSTIN, PAN, address and logo, and your authorised signatories with their signature and an optional seal. Invoices, quotes, receipts, statements, HR letters and Form 130 print them; payslips only if you switch it on. Only owners and admins can change signatories.',
    guide: 'settings#admin-company',
  },
  {
    id: 'brand-colours',
    category: 'settings',
    q: 'Can Flowbit use our brand colours?',
    a: 'Yes, on Suite and during a trial. Settings → Appearance sets your primary, secondary and accent colours (or one of eight presets), with a contrast check. They apply across the app for everyone, on your PDFs, in client emails and in the client portal.',
    guide: 'settings#admin-appearance',
  },
  {
    id: 'email-alerts',
    category: 'settings',
    q: 'Can I control which alerts I get by email?',
    a: `Yes. In My alerts each person picks in-app or email for each kind of event, on top of the workspace defaults. Choose an hourly or end-of-day digest, quiet hours (21:00 to 08:00 by default) and snooze. Approval and task emails have buttons to approve, reject, mark done or snooze straight from the email. ${ACTION_LINK_RULE}`,
    guide: 'settings#admin-my-alerts',
  },
  {
    id: 'briefs',
    category: 'settings',
    q: 'What is a morning brief?',
    a: 'An email at the time and days you choose with your day in one place: tasks due and overdue, approvals waiting, who is out, money due and received, sales follow-ups and statutory dates. Pick the sections, skip it when empty, and send yourself a preview.',
    guide: 'settings#admin-briefs',
  },
  {
    id: 'automations',
    category: 'settings',
    q: 'What can automations do?',
    a: 'Ready-made recipes you switch on or off in Settings → Automations: payment thank-yous, quote follow-ups, leave escalations, meeting reminders, birthday posts, probation and document reminders, new-lead alerts and more. Edit the wording, test it on yourself, or build your own rule from an event or a date.',
    guide: 'settings#admin-automations',
  },
  {
    id: 'import-data',
    category: 'settings',
    q: 'Can I bring data from other tools?',
    a: 'Yes. Settings → Import has CSV or Excel templates for team members, employees, attendance, projects, tasks, leads, contacts and companies, Folio clients and items. You see a preview with row errors before anything is saved, and can undo an import within 7 days.',
    guide: 'settings#admin-import',
  },
  {
    id: 'data-export',
    category: 'settings',
    q: 'Can I export all my data?',
    a: 'Yes. The owner can download the whole workspace as a ZIP of JSON, CSV and files from Settings → Export, at any time, even after a plan ends. Reports, ledgers and lists also export to CSV.',
    guide: 'settings#admin-export',
  },
  {
    id: 'privacy-dpdp',
    category: 'settings',
    q: 'How do you handle personal data and the DPDP Act?',
    a: 'For your clients’ and employees’ data, Flowbit is your data processor under a data processing agreement. Settings → Privacy exports or erases one person’s data on request. Message and processing logs are kept 13 months, then deleted. Flowbit staff see your workspace only when the owner grants access, and never see salary, bank or PAN details.',
    guide: 'settings#admin-privacy',
  },
  {
    id: 'data-separate',
    category: 'settings',
    q: 'Is my data kept separate from other companies’?',
    a: 'Yes. Every record belongs to one workspace and every request is checked against it. Roles decide who sees what inside your workspace, and sensitive changes are written to the audit log.',
    guide: 'settings#admin-audit',
  },
  {
    id: 'security',
    category: 'settings',
    q: 'How secure is Flowbit?',
    a: `Traffic is HTTPS only, secrets such as payment keys are encrypted, files sit in private storage, and every change is checked against your role on the server. ${DATA_LOCATION} The Security page has the details.`,
  },
  {
    id: 'two-factor',
    category: 'settings',
    q: 'Does Flowbit have two-factor sign-in?',
    a: 'Yes. Turn it on in Settings → Security with any authenticator app; you get 10 recovery codes and can remember a device for 30 days. Owners and admins can require it for every owner and admin in the workspace.',
    guide: 'settings#admin-security',
  },
  {
    id: 'audit-log',
    category: 'settings',
    q: 'Can I see who changed what?',
    a: 'Yes. The audit log records important changes (payroll steps, salary and bank changes, roles, exports, integrations) with who did it and when, and exports to CSV.',
    guide: 'settings#admin-audit',
  },
  {
    id: 'compliance-calendar',
    category: 'settings',
    q: 'Does Flowbit remind us of statutory due dates?',
    a: 'Yes. Settings → Compliance calendar lists GST, TDS, PF, ESI, professional tax and advance tax dates for the year, set for your state and filer type. Reminders go out 3 days before. Always check a date before relying on it.',
    guide: 'settings#admin-compliance',
  },
  {
    id: 'upload-limit',
    category: 'settings',
    q: 'How big can uploaded files be?',
    a: FILE_LIMITS_COPY,
  },
  {
    id: 'import-limits',
    category: 'settings',
    q: 'How many rows can I import at once?',
    a: IMPORT_LIMITS_COPY,
  },
  {
    id: 'status-page',
    category: 'settings',
    q: 'How do I know if Flowbit is down?',
    a: 'Open the public Status page. It shows the app, database, file storage and email, and when each scheduled job last ran.',
    guide: 'settings#admin-status',
  },
]
