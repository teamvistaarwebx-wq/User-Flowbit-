/**
 * Product tours (pure, client-safe): about 60 seconds each, 4–6 steps
 * pointing at shell UI marked with data-tour="…". A step whose target is not
 * on screen (a phone hides the side panel) shows as a centred card. Each
 * person sees a product's tour once on their first visit; Help replays it.
 */

export const TOUR_KEYS = ['work', 'muster', 'orbit', 'folio', 'me'] as const
export type TourKey = (typeof TOUR_KEYS)[number]

export type TourStep = Readonly<{ target?: string; title: string; body: string }>

const RAIL: TourStep = { target: 'rail', title: 'Switch products here', body: 'Work, Muster, Orbit and Folio share one login, one team and one search.' }
const SEARCH_STEP: TourStep = { target: 'notifications', title: 'Never miss a thing', body: 'Mentions, approvals and reminders land in the bell. Press ⌘K (Ctrl K) anywhere to search or jump.' }

export const TOURS: Readonly<Record<TourKey, readonly TourStep[]>> = {
  work: [
    { title: 'Welcome to Flowbit Work', body: 'Projects, tasks, posts and meetings for the whole agency. A one-minute tour.' },
    RAIL,
    { target: 'side-panel', title: 'Your lists and projects', body: 'Spaces, projects and teams you belong to stay one click away.' },
    { target: 'page-actions', title: 'Add work fast', body: 'Create from here, or type "kal 5 baje @asha #design" in quick add and Flowbit fills the date, owner and tag.' },
    SEARCH_STEP,
  ],
  muster: [
    { title: 'Welcome to Muster', body: 'Attendance, leave, people and payroll in one place. A one-minute tour.' },
    { target: 'check-in', title: 'Check in and out', body: 'One tap starts your day. Breaks and check-out live here too, on the phone as well.' },
    { target: 'page-header', title: 'Everything HR, by area', body: 'People, attendance, leave and payroll each have a page with their own reports.' },
    RAIL,
    SEARCH_STEP,
  ],
  // My HR: what every employee can open, without the HR pages they may not see.
  me: [
    { title: 'Welcome to My HR', body: 'Your attendance, leave, payslips, claims and letters in one place. A short tour.' },
    { target: 'check-in', title: 'Check in and out', body: 'One tap starts your day. Breaks and check-out live here too, on the phone as well.' },
    { target: 'page-header', title: 'Your own records', body: 'Apply for leave, see your payslips and file claims from the pages under My HR.' },
    SEARCH_STEP,
  ],
  orbit: [
    { title: 'Welcome to Orbit', body: 'Leads and deals from first touch to won. A one-minute tour.' },
    { target: 'page-actions', title: 'Add or import leads', body: 'Add a lead by hand, import a sheet, or connect a web form or IndiaMART.' },
    { target: 'page-header', title: 'Follow the pipeline', body: 'Leads move from new to meeting to won; follow-ups remind you when to call.' },
    RAIL,
    SEARCH_STEP,
  ],
  folio: [
    { title: 'Welcome to Folio', body: 'GST invoices, receipts, expenses and reports. A one-minute tour.' },
    { target: 'page-actions', title: 'Bill in a minute', body: 'Draft an invoice with GST worked out and a UPI QR printed on it.' },
    { target: 'page-header', title: 'Know who owes what', body: 'Receivables, aging and the GST summary update as invoices and receipts come in.' },
    RAIL,
    SEARCH_STEP,
  ],
}

const PREFIXES: readonly [string, TourKey][] = [['/app/work', 'work'], ['/app/hr', 'muster'], ['/app/me', 'me'], ['/app/orbit', 'orbit'], ['/app/folio', 'folio']]

/** The product tour that belongs to a page, or null (Home, Settings). */
export function tourForPath(pathname: string): TourKey | null {
  return PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? null
}

const PRODUCT_TOURS: readonly TourKey[] = ['work', 'muster', 'orbit', 'folio']

/** Help → Replay on a page without its own tour (Home, Settings): the first product this workspace has. */
export function replayTourFor(pathname: string, enabled: readonly string[]): TourKey | null {
  return tourForPath(pathname) ?? PRODUCT_TOURS.find((k) => enabled.includes(k)) ?? null
}

/** Start automatically on a product's first visit only. */
export const shouldAutoStart = (key: TourKey | null, seen: readonly string[]): key is TourKey => Boolean(key) && !seen.includes(key!)

/** The seen list with this tour added (no mutation, no repeats). */
export const markSeen = (seen: readonly string[], key: TourKey): string[] => (seen.includes(key) ? [...seen] : [...seen, key])

/** Browser storage key for tours this person finished or skipped, kept until the server has them. */
export const TOURS_SEEN_STORAGE_KEY = 'flowbit:tours-seen'

/** Tour keys from browser storage (anything unreadable or unknown is dropped). */
export function parseStoredTours(raw: string | null | undefined): TourKey[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? TOUR_KEYS.filter((k) => value.includes(k)) : []
  } catch {
    return []
  }
}

/** Seen on the server or in this browser: either is enough to stay quiet. */
export const mergeSeen = (server: readonly string[], local: readonly string[]): string[] => [...new Set([...server, ...local])]

/** Seen in this browser but not yet saved on the server (a save cut off by navigation): to save again. */
export const unsavedTours = (server: readonly string[], local: readonly TourKey[]): TourKey[] => local.filter((k) => !server.includes(k))

/** Where the tooltip goes for a target rect: below it when there is room, else above; clamped to the viewport. */
export function placeTip(rect: { top: number; left: number; width: number; height: number } | null, viewport: { width: number; height: number }, tip: { width: number; height: number }, gap = 12): { top: number; left: number; side: 'below' | 'above' | 'center' } {
  const margin = 12
  if (!rect || rect.width === 0 || rect.height === 0) return { top: Math.max(margin, (viewport.height - tip.height) / 2), left: Math.max(margin, (viewport.width - tip.width) / 2), side: 'center' }
  const clampLeft = (x: number) => Math.min(Math.max(margin, x), Math.max(margin, viewport.width - tip.width - margin))
  const left = clampLeft(rect.left + rect.width / 2 - tip.width / 2)
  const below = rect.top + rect.height + gap
  if (below + tip.height <= viewport.height - margin) return { top: below, left, side: 'below' }
  const above = rect.top - gap - tip.height
  if (above >= margin) return { top: above, left, side: 'above' }
  return { top: Math.max(margin, Math.min(viewport.height - tip.height - margin, rect.top)), left: clampLeft(rect.left + rect.width + gap), side: 'center' }
}
