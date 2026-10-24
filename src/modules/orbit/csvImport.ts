/**
 * CSV lead import: smart header resolution (ported from the reference CRM) and
 * row mapping against the workspace's sources and sectors. Pure; the dialog
 * parses the file with papaparse and the server re-validates every row.
 */
import { IMPORT_MAX_ROWS } from './constants'
import { INSTAGRAM_RE, isPhoneLike, isWebUrl, normaliseInstagram, normaliseUrl } from './normalize'

export const IMPORT_FIELDS = ['company', 'linkedin', 'instagram', 'email', 'phone', 'designation', 'contact', 'website', 'sector', 'source', 'notes'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** Field order matters: company before contact, linkedin/instagram before website. */
export const COLUMN_SPECS: { field: ImportField; exact: string[]; fuzzy: string[] }[] = [
  { field: 'company', exact: ['company', 'company name', 'brand', 'brand name', 'account', 'organisation', 'organization', 'org', 'business', 'business name', 'firm'], fuzzy: ['company', 'brand name', 'organisation', 'organization', 'business name'] },
  { field: 'linkedin', exact: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link', 'li url'], fuzzy: ['linkedin'] },
  { field: 'instagram', exact: ['instagram', 'instagram handle', 'instagram url', 'ig', 'ig handle', 'insta', 'handle'], fuzzy: ['instagram', 'insta'] },
  { field: 'email', exact: ['email', 'email address', 'e mail', 'mail', 'email id'], fuzzy: ['email'] },
  { field: 'phone', exact: ['phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'number', 'whatsapp', 'tel'], fuzzy: ['phone', 'mobile', 'whatsapp'] },
  { field: 'designation', exact: ['designation', 'title', 'job title', 'role', 'position'], fuzzy: ['designation', 'job title'] },
  { field: 'contact', exact: ['contact', 'contact name', 'name', 'person', 'full name', 'poc', 'contact person', 'founder'], fuzzy: ['contact name', 'contact person', 'poc'] },
  { field: 'website', exact: ['website', 'website url', 'url', 'site', 'web', 'domain', 'web address'], fuzzy: ['website', 'domain'] },
  { field: 'sector', exact: ['sector', 'industry', 'vertical', 'category', 'niche'], fuzzy: ['sector', 'industry', 'vertical'] },
  { field: 'source', exact: ['source', 'lead source', 'channel', 'found via'], fuzzy: ['source', 'channel'] },
  { field: 'notes', exact: ['notes', 'note', 'remark', 'remarks', 'comment', 'comments', 'description'], fuzzy: ['notes', 'remark', 'comment'] },
]

/** Trim, lower-case, runs of _ - . become a space, collapse spaces. */
export const normalise = (header: string) => header.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Column index per field. Exact matches first, then substring matches; a column is claimed once. */
export function resolveHeaders(headers: readonly string[]): Partial<Record<ImportField, number>> {
  const norm = headers.map(normalise)
  const claimed = new Set<number>()
  const out: Partial<Record<ImportField, number>> = {}
  for (const spec of COLUMN_SPECS) {
    const i = norm.findIndex((h, idx) => !claimed.has(idx) && spec.exact.includes(h))
    if (i >= 0) {
      out[spec.field] = i
      claimed.add(i)
    }
  }
  for (const spec of COLUMN_SPECS) {
    if (out[spec.field] !== undefined) continue
    const i = norm.findIndex((h, idx) => !claimed.has(idx) && spec.fuzzy.some((f) => h.includes(f)))
    if (i >= 0) {
      out[spec.field] = i
      claimed.add(i)
    }
  }
  return out
}

export type ImportRow = {
  /** Line in the CSV file (the header is line 1), for naming skipped rows. */
  line: number
  companyName: string
  contactName: string
  designation: string
  email: string
  phone: string
  linkedinUrl: string
  instagramHandle: string
  website: string
  sector: string
  source: string
  notes: string
}

type Option = { key: string; label: string }
const ALIASES: Record<string, string> = { 'real estate': 'real_estate', realestate: 'real_estate', ngo: 'dev_ngo', 'development & ngo': 'dev_ngo', 'development / ngo': 'dev_ngo', dev_ngo: 'dev_ngo', 'development and ngo': 'dev_ngo' }

/** Matches a cell against setting keys, labels and the reference aliases; null when unknown. */
export function matchOption(value: string, options: readonly Option[]): string | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  const direct = options.find((o) => o.key === v || o.label.toLowerCase() === v || o.key === v.replace(/[\s/&-]+/g, '_'))
  if (direct) return direct.key
  const alias = ALIASES[v]
  return alias && options.some((o) => o.key === alias) ? alias : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Optional fields of a row that will not pass validation (the import leaves them blank). Mirrors importRowSchema. */
export function badFields(row: ImportRow): string[] {
  const out: string[] = []
  if (row.email && !EMAIL_RE.test(row.email)) out.push('email')
  if (row.phone && !isPhoneLike(row.phone)) out.push('phone')
  if (row.linkedinUrl && !(isWebUrl(normaliseUrl(row.linkedinUrl)) && /linkedin\.com/i.test(row.linkedinUrl))) out.push('LinkedIn')
  if (row.instagramHandle && !INSTAGRAM_RE.test(normaliseInstagram(row.instagramHandle))) out.push('Instagram')
  if (row.website && !isWebUrl(normaliseUrl(row.website))) out.push('website')
  return out
}

export type MapResult = { rows: ImportRow[]; skippedNoCompany: number; withBadFields: number; mappedToOther: { sector: number; source: number }; tooMany: boolean; total: number }

/** Turns parsed CSV cells (first row = headers) into lead rows. */
export function mapRows(cells: readonly string[][], settings: { sectors: readonly Option[]; sources: readonly Option[] }): MapResult {
  const [headers = [], ...data] = cells
  const cols = resolveHeaders(headers)
  const cell = (row: readonly string[], f: ImportField) => (cols[f] === undefined ? '' : String(row[cols[f] as number] ?? '').trim())
  const fallback = (opts: readonly Option[]) => (opts.some((o) => o.key === 'other') ? 'other' : (opts[0]?.key ?? 'other'))
  const out: MapResult = { rows: [], skippedNoCompany: 0, withBadFields: 0, mappedToOther: { sector: 0, source: 0 }, tooMany: data.length > IMPORT_MAX_ROWS, total: data.length }
  for (const [index, row] of data.slice(0, IMPORT_MAX_ROWS).entries()) {
    const companyName = cell(row, 'company')
    if (!companyName) {
      out.skippedNoCompany += 1
      continue
    }
    const sectorRaw = cell(row, 'sector')
    const sourceRaw = cell(row, 'source')
    const sector = matchOption(sectorRaw, settings.sectors)
    const source = matchOption(sourceRaw, settings.sources)
    if (!sector) out.mappedToOther.sector += 1
    if (!source) out.mappedToOther.source += 1
    const mapped: ImportRow = {
      line: index + 2,
      companyName: companyName.slice(0, 120),
      contactName: cell(row, 'contact').slice(0, 80),
      designation: cell(row, 'designation').slice(0, 80),
      email: cell(row, 'email').toLowerCase(),
      phone: cell(row, 'phone'),
      linkedinUrl: cell(row, 'linkedin'),
      instagramHandle: cell(row, 'instagram'),
      website: cell(row, 'website'),
      sector: sector ?? fallback(settings.sectors),
      source: source ?? fallback(settings.sources),
      notes: cell(row, 'notes').slice(0, 2000),
    }
    if (badFields(mapped).length) out.withBadFields += 1
    out.rows.push(mapped)
  }
  return out
}
