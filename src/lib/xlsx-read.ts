import { inflateRawSync } from 'node:zlib'

/**
 * Reads the first worksheet of an .xlsx file into rows of text (no library:
 * an .xlsx is a ZIP of XML parts). Handles shared and inline strings,
 * numbers, booleans, and date/time cells (shown as YYYY-MM-DD or HH:MM).
 * Formulas give their cached value. Server-only (node:zlib).
 */

/** Refuses archives that inflate past this (a "zip bomb"). */
const MAX_INFLATED_BYTES = 40 * 1024 * 1024
const MAX_COLUMNS = 200
/** A real workbook has a few dozen parts; thousands of entries are a crafted archive. */
const MAX_ENTRIES = 1000

const END_OF_DIRECTORY = 0x06054b50
const CENTRAL_HEADER = 0x02014b50

/** Every stored or deflated entry of a ZIP, by name. Throws on a damaged or oversized archive. */
export function unzip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0 || zip.readUInt32LE(end) !== END_OF_DIRECTORY) throw new Error('not a zip file')
  const count = zip.readUInt16LE(end + 10)
  if (count > MAX_ENTRIES) throw new Error('the file has too many parts')
  let at = zip.readUInt32LE(end + 16)
  // Counts the bytes actually unpacked: the sizes an archive declares can lie.
  let total = 0
  const offsets = new Set<number>()
  const out = new Map<string, Buffer>()
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error('bad central header')
    const method = zip.readUInt16LE(at + 10)
    const compressed = zip.readUInt32LE(at + 20)
    const nameLen = zip.readUInt16LE(at + 28)
    const extraLen = zip.readUInt16LE(at + 30)
    const commentLen = zip.readUInt16LE(at + 32)
    const offset = zip.readUInt32LE(at + 42)
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8')
    // Several directory entries pointing at one stored part is a classic overlapping zip bomb.
    if (offsets.has(offset)) throw new Error('damaged zip file')
    offsets.add(offset)
    const localNameLen = zip.readUInt16LE(offset + 26)
    const localExtraLen = zip.readUInt16LE(offset + 28)
    const start = offset + 30 + localNameLen + localExtraLen
    const raw = zip.subarray(start, start + compressed)
    const remaining = MAX_INFLATED_BYTES - total
    let part: Buffer | null = null
    if (method === 0) part = Buffer.from(raw)
    else if (method === 8) {
      try {
        part = inflateRawSync(raw, { maxOutputLength: Math.max(1, remaining) })
      } catch (error) {
        if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw new Error('the file is too large once unpacked')
        throw error
      }
    }
    if (part) {
      total += part.length
      if (total > MAX_INFLATED_BYTES) throw new Error('the file is too large once unpacked')
      out.set(name, part)
    }
    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export const decodeXml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })

/** Text of every <t> inside a fragment (rich text runs are joined). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('')

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
}

type CellFormat = 'date' | 'time' | 'datetime' | null
const BUILTIN_DATE = new Set([14, 15, 16, 17, 22])
const BUILTIN_TIME = new Set([18, 19, 20, 21, 45, 46, 47])

function formatKind(code: string): CellFormat {
  const plain = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase()
  const hasDate = /[dy]/.test(plain) || /m{3,}/.test(plain) || (/m/.test(plain) && !/[hs]/.test(plain))
  const hasTime = /[hs]/.test(plain)
  if (hasDate && hasTime) return 'datetime'
  if (hasDate) return 'date'
  return hasTime ? 'time' : null
}

/** Date/time kind per cell style index (styles.xml cellXfs). */
function styleKinds(xml: string | undefined): CellFormat[] {
  if (!xml) return []
  const custom = new Map([...xml.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), decodeXml(m[2])]))
  const xfs = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  return [...xfs.matchAll(/<xf\s([^>]*?)\/?>/g)].map((m) => {
    const id = Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0)
    if (BUILTIN_DATE.has(id)) return 'date'
    if (BUILTIN_TIME.has(id)) return 'time'
    const code = custom.get(id)
    return code ? formatKind(code) : null
  })
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

/** Excel serial number as text in the cell's date/time format. */
export function serialToText(serial: number, kind: CellFormat): string {
  const ms = Math.round(EXCEL_EPOCH_MS + serial * DAY_MS)
  const iso = new Date(ms).toISOString()
  if (kind === 'date') return iso.slice(0, 10)
  if (kind === 'time') return iso.slice(11, 16)
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

/** "AB12" -> 27 (zero-based column). */
export function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A'
  return [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
}

function cellText(attrs: string, body: string, strings: readonly string[], kinds: readonly CellFormat[]): string {
  const type = attrs.match(/\st="([^"]+)"/)?.[1] ?? 'n'
  const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
  if (type === 'inlineStr') return textOf(body)
  if (value == null) return ''
  if (type === 's') return strings[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
  if (type === 'str' || type === 'e') return decodeXml(value)
  const style = Number(attrs.match(/\ss="(\d+)"/)?.[1] ?? -1)
  const kind = kinds[style] ?? null
  const n = Number(value)
  return kind && Number.isFinite(n) ? serialToText(n, kind) : value
}

/** The path of the first sheet in workbook order. */
function firstSheetPath(files: Map<string, Buffer>): string | null {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  const rid = workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1]
  const target = rid ? rels.match(new RegExp(`<Relationship\\s[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`<Relationship\\s[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined
  if (target) {
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    if (files.has(path)) return path
  }
  return [...files.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()[0] ?? null
}

/** Rows of the first sheet as text cells (trailing empty rows dropped). */
export function readXlsx(file: Buffer): string[][] {
  const files = unzip(file)
  const path = firstSheetPath(files)
  if (!path) throw new Error('the workbook has no sheet')
  const strings = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8'))
  const kinds = styleKinds(files.get('xl/styles.xml')?.toString('utf8'))
  const sheet = files.get(path)!.toString('utf8')
  const rows: string[][] = []
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const index = Number(row[1].match(/\sr="(\d+)"/)?.[1] ?? rows.length + 1) - 1
    const cells: string[] = []
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cell[1].match(/\sr="([A-Z]+\d+)"/i)?.[1]
      const col = ref ? columnIndex(ref) : cells.length
      if (col >= MAX_COLUMNS) continue
      while (cells.length < col) cells.push('')
      cells[col] = cellText(cell[1], cell[2] ?? '', strings, kinds).trim()
    }
    while (rows.length < index) rows.push([])
    rows[index] = cells
  }
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop()
  return rows
}
