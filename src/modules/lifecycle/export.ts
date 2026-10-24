import type { ZipEntry } from '@/lib/zip'
import { toCsv } from '@/modules/orbit/csv'
import type { TenantCollection } from './registry'

/**
 * The workspace export (console spec 4.3): every module's data as JSON and
 * CSV, plus the uploaded files, in one ZIP. Works in every state, blocked
 * included, without a watermark. Secrets (token and code hashes) never leave.
 *
 * Memory stays bounded however big the workspace is (V2-REVIEW T3): rows
 * come from a database cursor one at a time, and a collection is written in
 * parts of at most PART_ROWS rows or about PART_BYTES of JSON
 * (`json/work/Task.part-001.json`, `…-002`, with a CSV per part); a
 * collection that fits in one part keeps the plain name. Only one part is
 * held at a time, and the ZIP writer compresses and sends each entry before
 * the next is read. Message bodies (html, text) are left out.
 */

export type ExportRow = Record<string, unknown>
export type ExportFile = { id: string; name: string; data: Buffer }

export interface ExportSource {
  /** The workspace's own details (no Flowbit internals). */
  workspace(): Promise<ExportRow>
  /** The collection's rows in _id order, read lazily (a cursor), without its `exportOmit` fields. */
  rows(collection: TenantCollection): AsyncIterable<ExportRow>
  /** Uploaded and generated files, at most `maxBytes` in total; `skipped` counts the rest. */
  files(maxBytes: number): AsyncIterable<ExportFile | { skipped: number }>
}

export type ExportMeta = { workspace: string; at: Date }

/** Total bytes of uploaded files put in one export; the rest stay downloadable in the app. */
export const EXPORT_FILE_BYTES = 500 * 1024 * 1024
/** One part of a collection: at most this many rows, or about this much JSON, whichever comes first. */
export type PartLimits = Readonly<{ rows: number; bytes: number }>
export const PART_LIMITS: PartLimits = { rows: 5_000, bytes: 8 * 1024 * 1024 }
/** CSV columns per collection (wider documents keep everything in the JSON). */
const MAX_CSV_COLUMNS = 200
const SECRET_KEY = /(hash|secret|token|password)$/i

const isObjectId = (v: unknown): v is { toHexString: () => string } => typeof v === 'object' && v !== null && typeof (v as { toHexString?: unknown }).toHexString === 'function'
const isBinary = (v: unknown) => Buffer.isBuffer(v) || (typeof v === 'object' && v !== null && (v as { _bsontype?: string })._bsontype === 'Binary')

/** A JSON-safe copy without secrets, buffers or Mongoose's version key; ids and dates as strings. */
export function cleanValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (isObjectId(value)) return value.toHexString()
  if (isBinary(value)) return undefined
  if (Array.isArray(value)) return value.map(cleanValue).filter((v) => v !== undefined)
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== '__v' && !SECRET_KEY.test(key))
      .map(([key, v]) => [key, cleanValue(v)] as const)
      .filter(([, v]) => v !== undefined)
    return Object.fromEntries(entries)
  }
  return value
}

type Cell = string | number | boolean

/** One CSV row: nested fields as dot paths, lists of plain values joined with "; ", lists of records as JSON. */
export function flattenRow(row: ExportRow, prefix = ''): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      out[path] = value.every((v) => typeof v !== 'object' || v === null) ? value.join('; ') : JSON.stringify(value)
    } else if (typeof value === 'object') {
      Object.assign(out, flattenRow(value as ExportRow, path))
    } else {
      out[path] = value as Cell
    }
  }
  return out
}

export function rowsToCsv(rows: readonly ExportRow[]): string {
  const flat = rows.map((r) => flattenRow(r))
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))].slice(0, MAX_CSV_COLUMNS)
  return toCsv(headers, flat.map((r) => headers.map((h) => r[h] ?? '')))
}

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file'

/** A row as it is exported: cleaned, and without the collection's omitted fields (also enforced by the source's projection). */
function exportRow(collection: TenantCollection, row: ExportRow): ExportRow {
  const omit = new Set(collection.exportOmit ?? [])
  const kept = omit.size ? Object.fromEntries(Object.entries(row).filter(([key]) => !omit.has(key))) : row
  return cleanValue(kept) as ExportRow
}

const partName = (name: string, part: number, single: boolean) => (single ? name : `${name}.part-${String(part).padStart(3, '0')}`)

/**
 * One collection's entries, part by part (JSON then CSV per part); returns
 * the row count. The next row is read before a part is written, so a
 * collection that fits in one part keeps its plain file name.
 */
async function* collectionEntries(collection: TenantCollection, rows: AsyncIterable<ExportRow>, limits: PartLimits): AsyncGenerator<ZipEntry, number> {
  const it = rows[Symbol.asyncIterator]()
  let jsonRows: string[] = []
  let cleanRows: ExportRow[] = []

  let bytes = 0
  let part = 0
  let total = 0
  let next = await it.next()
  while (!next.done) {
    const row = exportRow(collection, next.value)
    const json = JSON.stringify(row, null, 2)
    // A local buffer, appended in place: copying it per row would cost O(rows²) on a large part.
    jsonRows.push(json)
    cleanRows.push(row)
    bytes += json.length
    total += 1
    next = await it.next()
    if (!next.done && jsonRows.length < limits.rows && bytes < limits.bytes) continue
    part += 1
    const name = partName(collection.name, part, part === 1 && Boolean(next.done))
    yield { name: `json/${collection.module}/${name}.json`, data: `[\n${jsonRows.join(',\n')}\n]` }
    yield { name: `csv/${collection.module}/${name}.csv`, data: rowsToCsv(cleanRows) }
    jsonRows = []
    cleanRows = []
    bytes = 0
  }
  return total
}

function readme(meta: ExportMeta, index: string[], skippedFiles: number): string {
  return [
    `Flowbit export of ${meta.workspace}`,
    `Made ${meta.at.toISOString()}`,
    '',
    'workspace.json      Workspace details and plan',
    'json/<module>/*.json  Every record, one file per kind of record (full detail);',
    '                      large kinds come in parts: <Name>.part-001.json, -002, ...',
    'csv/<module>/*.csv    The same records as spreadsheets (nested fields as dot.paths)',
    'Message log entries keep subject, status and dates; the email bodies are not included.',
    'files/              Documents, receipts and PDFs stored in the workspace',
    '',
    'Modules: workspace (members, roles, clients, audit log), work, muster, orbit, folio, messages, billing (Flowbit invoices to you).',
    ...(skippedFiles ? ['', `${skippedFiles} stored file(s) did not fit in this export (500 MB of files at most). Download them from the app, or ask support@useflowbit.com.`] : []),
    '',
    'Records:',
    ...index,
    '',
  ].join('\n')
}

/** The export's ZIP entries, in order: workspace.json, JSON and CSV per collection (in parts), files, then README.txt. */
export async function* exportEntries(source: ExportSource, collections: readonly TenantCollection[], meta: ExportMeta, limits: PartLimits = PART_LIMITS): AsyncGenerator<ZipEntry> {
  yield { name: 'workspace.json', data: JSON.stringify(cleanValue(await source.workspace()), null, 2) }
  const index: string[] = []
  for (const c of collections.filter((x) => x.exported)) {
    const count = yield* collectionEntries(c, source.rows(c), limits)
    index.push(`  ${c.module}/${c.name}: ${count}`)
  }
  let skipped = 0
  for await (const file of source.files(EXPORT_FILE_BYTES)) {
    if ('skipped' in file) skipped = file.skipped
    else yield { name: `files/${file.id}-${safeFileName(file.name)}`, data: file.data }
  }
  yield { name: 'README.txt', data: readme(meta, index, skipped) }
}
