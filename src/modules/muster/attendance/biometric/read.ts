import { MAX_IMPORT_BYTES, readSheet, sheetFromCsv, sheetRows, type Sheet } from '@/modules/imports/sheet'
import { detectFormat, detectFromHeaders, MAX_PUNCH_ROWS, parseAttlog, parsePunchSheet, type BiometricFormat, type BiometricFormatChoice, type ParsedPunches, type PunchColumns } from './formats'

/** Reads an uploaded punch file (.dat, .txt, .csv or .xlsx) into raw punches. Server-only for XLSX (node:zlib). */

export type PunchFileInput = { fileName: string; bytes: Buffer; format: BiometricFormatChoice; picks?: PunchColumns }

const tooMany = (count: number) => `The file has ${count.toLocaleString('en-IN')} punch rows. Import at most ${MAX_PUNCH_ROWS.toLocaleString('en-IN')} at a time.`

function fromSheet(sheet: Sheet, choice: BiometricFormatChoice, picks: PunchColumns | undefined): ParsedPunches | { error: string } {
  if (sheet.cells.length > MAX_PUNCH_ROWS) return { error: tooMany(sheet.cells.length) }
  const format: BiometricFormat = choice === 'auto' ? detectFromHeaders(sheet.headers) : choice
  if (format === 'zkteco_dat') return { error: 'That file has a header row, so it is not an attlog.dat. Choose another format, or Detect.' }
  const { headers, rows } = sheetRows(sheet)
  if (!rows.length) return { error: 'The file has a header but no punches.' }
  return parsePunchSheet({ headers, rows }, format, picks)
}

export function readPunchFile({ fileName, bytes, format: choice, picks }: PunchFileInput): ParsedPunches | { error: string } {
  if (!bytes.length) return { error: 'The file is empty.' }
  if (bytes.length > MAX_IMPORT_BYTES) return { error: 'That file is larger than 3 MB. Split it into smaller files, for example one per fortnight.' }
  const name = fileName.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const sheet = readSheet(fileName, bytes)
    return 'error' in sheet ? sheet : fromSheet(sheet, choice, picks)
  }
  if (!/\.(csv|txt|dat|tsv)$/.test(name)) return { error: 'Upload the device export as .dat, .txt, .csv or .xlsx.' }
  const text = bytes.toString('utf8')
  const format = choice === 'auto' ? detectFormat(text) : choice
  if (format === 'zkteco_dat') {
    const parsed = parseAttlog(text)
    if (parsed.punches.length > MAX_PUNCH_ROWS) return { error: tooMany(parsed.punches.length) }
    return parsed.punches.length ? parsed : { error: 'No punch lines found. An attlog.dat line is the user id, then YYYY-MM-DD HH:MM:SS.' }
  }
  const sheet = sheetFromCsv(text)
  return 'error' in sheet ? sheet : fromSheet(sheet, format, picks)
}
