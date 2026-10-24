/**
 * The one table of file and import limits (B25, B26) for the FAQ and the
 * manual. The numbers mirror the code; limits.test.ts fails when they drift
 * (modules/imports importers, lib/upload-limit, meetings, export, avatars,
 * logos, biometric punches). Pure and client-safe.
 */

export type LimitRow = Readonly<{ what: string; limit: string }>

export const FILE_LIMITS: readonly LimitRow[] = [
  { what: 'Attachments, receipts, documents and images', limit: '4 MB each on the hosted service' },
  { what: 'Profile photo', limit: '2 MB' },
  { what: 'Company and firm logos', limit: '1 MB' },
  { what: 'Meeting recordings (Meetings AI)', limit: '200 MB' },
  { what: 'Spreadsheet to import', limit: '3 MB' },
  { what: 'Files in one full export', limit: '500 MB (the rest are listed in the ZIP)' },
]

/** Rows per import file, by importer (modules/imports registry). */
export const IMPORT_ROW_LIMITS: readonly Readonly<{ kind: string; label: string; rows: number }>[] = [
  { kind: 'team', label: 'Team members', rows: 200 },
  { kind: 'employees', label: 'Employees', rows: 500 },
  { kind: 'attendance', label: 'Attendance', rows: 5_000 },
  { kind: 'projects', label: 'Projects', rows: 500 },
  { kind: 'tasks', label: 'Tasks', rows: 2_000 },
  { kind: 'leads', label: 'Leads', rows: 2_000 },
  { kind: 'contacts', label: 'Contacts and companies', rows: 2_000 },
  { kind: 'folio_clients', label: 'Folio clients', rows: 2_000 },
  { kind: 'folio_items', label: 'Folio items', rows: 1_000 },
]

export const BIOMETRIC_PUNCH_ROWS = 50_000

/** The FAQ answers: file sizes, then rows per import. */
export const FILE_LIMITS_COPY = `${FILE_LIMITS.map((r) => `${r.what}: ${r.limit}`).join('. ')}.`
export const IMPORT_LIMITS_COPY = `Rows per file: ${IMPORT_ROW_LIMITS.map((r) => `${r.label.toLowerCase()} ${r.rows.toLocaleString('en-IN')}`).join(', ')}; biometric punch logs ${BIOMETRIC_PUNCH_ROWS.toLocaleString('en-IN')} punches. Split a bigger file and import it in parts.`
