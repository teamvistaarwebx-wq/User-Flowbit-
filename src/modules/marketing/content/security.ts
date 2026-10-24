import { LOG_RETENTION_MONTHS, OWNER_DELETE_PURGE_DAYS } from '@/lib/lifecycle'
import { DATA_LOCATION } from '../legal/providers'
/**
 * The public security page (/security). Only what the code and the
 * deployment guide (docs/DEPLOY-VERCEL.md) make true today; nothing about
 * certifications Flowbit does not hold. Check the code before adding a line.
 */

export type SecurityTopic = { key: string; title: string; points: readonly string[] }

export const SECURITY_TOPICS: readonly SecurityTopic[] = [
  {
    key: 'signin',
    title: 'Sign-in and two-factor',
    points: [
      'Passwords are stored only as bcrypt hashes; sign-in and code attempts are rate limited.',
      'Two-factor sign-in with an authenticator app, with remembered devices; owners can require it for owners and admins.',
      'Sessions can be seen and signed out from Settings → Security.',
      'Flowbit staff use a separate Console on its own host, with two-factor sign-in required.',
    ],
  },
  {
    key: 'encryption',
    title: 'Encryption',
    points: [
      'Traffic to Flowbit is HTTPS only, and the database connection uses TLS.',
      'Secrets you give Flowbit (your Razorpay keys, GSP login, Google and Slack tokens, webhook secrets, two-factor secrets) are encrypted with AES-256-GCM before they are stored, and never shown again in full.',
      'Files sit in a private storage bucket with public access blocked; downloads check who is asking (only your logo is public, for your emails).',
    ],
  },
  {
    key: 'roles',
    title: 'Roles and permissions',
    points: [
      'Eight built-in roles (Owner, Admin, HR admin, HR executive, Finance, Manager, Sales, Member) from 76 permissions, plus custom roles.',
      'Permissions are checked on the server for every change, not only hidden in the interface.',
      'Each workspace’s data is kept apart: every query is scoped to the signed-in workspace.',
      'Sensitive details such as bank accounts, PAN and salaries need their own permission.',
    ],
  },
  {
    key: 'audit',
    title: 'Audit log',
    points: [
      'Sensitive actions (payroll steps, role and permission changes, exports, sign-in settings, integrations) are written to an audit log with who, what and when.',
      'People with audit access can read and export it in Settings → Audit log.',
    ],
  },
  {
    key: 'dpdp',
    title: 'DPDP and your data',
    points: [
      'For your clients’ and employees’ data, Flowbit acts as your data processor under a data processing agreement (see Data processing terms).',
      'Export or erase one person’s data on request, from Settings → Privacy.',
      `Message and processing logs are kept ${LOG_RETENTION_MONTHS} months, then deleted (DPDP asks for at least a year), and a breach process tells you straight away so you can meet your own deadlines.`,
      'Flowbit staff see your workspace only when an owner grants support access, read-only or import-only, for a limited time.',
    ],
  },
  {
    key: 'export',
    title: 'Export and deletion',
    points: [
      'An owner can export the whole workspace as a ZIP at any time.',
      `Deleting a workspace can be undone for ${OWNER_DELETE_PURGE_DAYS} days (write to support); after that its data is removed.`,
    ],
  },
  {
    key: 'hosting',
    title: 'Hosting and backups',
    points: [
      DATA_LOCATION,
      'Backups come from the database provider; ask support for the current schedule and retention. Your own copy is always one ZIP export away.',
    ],
  },
]

export const SECURITY_CONTACT_NOTE = 'Found a security issue? Write to support with the details; we reply within one working day.'
