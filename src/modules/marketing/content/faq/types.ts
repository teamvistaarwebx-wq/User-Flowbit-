/**
 * The FAQ hub's data shapes. Every answer lives once, in one of the category
 * files next to this one; the landing, pricing and product pages pick theirs
 * by id (see ./index.ts). Pure.
 */

export const FAQ_CATEGORIES = [
  { key: 'getting-started', label: 'Getting started', blurb: 'What Flowbit is, signing up, inviting people and finding your way.' },
  { key: 'plans', label: 'Plans & billing', blurb: 'Free, the trial, prices, GST, payments and refunds.' },
  { key: 'work', label: 'Work', blurb: 'Tasks, projects, meetings, posts, time and whiteboards.' },
  { key: 'hr', label: 'HR & payroll', blurb: 'People, attendance, leave, claims, payroll, tax and letters.' },
  { key: 'sales', label: 'Sales CRM', blurb: 'Orbit leads, deals, follow-ups, sequences and clients.' },
  { key: 'finance', label: 'Billing & finance', blurb: 'Folio invoices, payments, bank import, GST, e-invoice and Tally.' },
  { key: 'settings', label: 'Settings & security', blurb: 'Roles, branding, alerts, automations, export, privacy and two-factor.' },
  { key: 'integrations', label: 'Integrations & AI', blurb: 'Arc, Claude and ChatGPT, Google, Slack, webhooks and email to task.' },
] as const

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]['key']

/**
 * A manual topic to read next: `<chapter slug>#<topic id>`, for example
 * `work#work-tasks`. Tests check both halves against content/manual.
 */
export type ManualRef = `${string}#${string}`

export type FaqItem = Readonly<{
  /** Stable anchor on /faq (kebab case, unique across every category). */
  id: string
  category: FaqCategory
  q: string
  /** Plain text, short. */
  a: string
  guide?: ManualRef
}>

/** The /manual URL for a guide reference. */
export const guideHref = (ref: ManualRef): string => {
  const [chapter, topic] = ref.split('#')
  return `/manual/${chapter}#${topic}`
}

/** The /faq URL for one question. */
export const faqHref = (id: string): string => `/faq#${id}`
