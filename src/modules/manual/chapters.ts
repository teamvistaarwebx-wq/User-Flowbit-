/**
 * The user manual's chapters (content/manual/*.html, copied from the launch
 * kit and edited for v2.1). Order here is the reading order. Pure.
 */

export type ManualGroup = 'Start' | 'Work' | 'Muster' | 'Orbit' | 'Folio' | 'Settings' | 'New'

export type ManualChapter = Readonly<{
  slug: string
  file: string
  group: ManualGroup
  eyebrow: string
  title: string
  summary: string
  /** Accent colour for the chapter (marketing product colours). */
  accent: string
}>

export const MANUAL_CHAPTERS: readonly ManualChapter[] = [
  { slug: 'getting-started', file: '10-start.html', group: 'Start', eyebrow: 'Getting started', title: 'Sign in and find your way around', summary: 'Plans, signup, sign-in, inviting people, the screen layout, check-in and Home.', accent: '#BB62A5' },
  { slug: 'work', file: '20-work.html', group: 'Work', eyebrow: 'Work · Tasks', title: 'Plan and track the work', summary: 'Tasks, projects, spaces, meetings, posts, time, whiteboards, teams and reports.', accent: '#C084FC' },
  { slug: 'hr', file: '30-muster-a.html', group: 'Muster', eyebrow: 'Muster · HR', title: 'People, attendance and leave', summary: 'Employee records, the attendance register, corrections, leave and comp-off.', accent: '#5EEAB0' },
  { slug: 'payroll', file: '31-muster-b.html', group: 'Muster', eyebrow: 'Muster · Payroll', title: 'Payroll, claims, letters and HR settings', summary: 'Payroll months, statutory rates, salary structures, claims, letters, reports and settings.', accent: '#5EEAB0' },
  { slug: 'my-hr', file: '35-me.html', group: 'Muster', eyebrow: 'My HR', title: 'Your own HR desk', summary: 'Check-in, leave, payslips, claims, letters and your details.', accent: '#5EEAB0' },
  { slug: 'orbit', file: '40-orbit.html', group: 'Orbit', eyebrow: 'Orbit · Sales', title: 'Find, follow up and win clients', summary: 'Leads, deals, contacts, activities, reports and Orbit settings.', accent: '#60A5FA' },
  { slug: 'folio', file: '50-folio.html', group: 'Folio', eyebrow: 'Folio · Invoicing', title: 'Send GST invoices and get paid', summary: 'Quotes, invoices, receipts, collections, expenses, recurring billing and reports.', accent: '#F5B85C' },
  { slug: 'settings', file: '60-admin.html', group: 'Settings', eyebrow: 'Settings and admin', title: 'Run your workspace', summary: 'My account, alerts, members, roles, plans, billing, automations, integrations, import, export and privacy.', accent: '#EAC1DC' },
  { slug: 'whats-new', file: '70-new.html', group: 'New', eyebrow: "What's new", title: 'New in Flowbit 2.0', summary: 'Quick add, breaks, the task panel, posts, Google Calendar, sequences, two-factor, Hindi, the client portal, bank import and connectors.', accent: '#BB62A5' },
]

export const chapterBySlug = (slug: string): ManualChapter | undefined => MANUAL_CHAPTERS.find((c) => c.slug === slug)
