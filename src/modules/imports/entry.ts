import type { ImportKind } from './types'

/**
 * One import screen per importer (audit A9). Every Import button in the app opens the Settings → Import screen
 * for its kind, with `?from=` so Back and Done return to the page it came from. Leads are the one exception: their
 * screen is Orbit's import dialog (it also picks the owner and reviewer), and Settings → Import opens that.
 * Pure, safe on the client.
 */

export const IMPORT_FROM = {
  clients: { href: '/app/clients', label: 'Clients' },
  people: { href: '/app/hr/people', label: 'People' },
  attendance: { href: '/app/hr/attendance?view=import', label: 'Attendance' },
  setup: { href: '/app', label: 'Home' },
} as const
export type ImportFrom = keyof typeof IMPORT_FROM

/** Kinds whose single import screen lives on their own product page. */
export const IMPORT_HOME: Readonly<Partial<Record<ImportKind, string>>> = { leads: '/app/orbit/leads?import=1' }

export const isImportFrom = (value: unknown): value is ImportFrom => typeof value === 'string' && value in IMPORT_FROM

/** The one place to import `kind` from, remembering where the member started. */
export function importHref(kind: ImportKind, from?: ImportFrom): string {
  const home = IMPORT_HOME[kind]
  if (home) return home
  return `/app/settings/import/${kind}${from ? `?from=${from}` : ''}`
}

/** Back and Done for an import screen opened from `from` (else the Import hub). */
export const importBack = (from: unknown): { href: string; label: string } => (isImportFrom(from) ? IMPORT_FROM[from] : { href: '/app/settings/import', label: 'Import' })
