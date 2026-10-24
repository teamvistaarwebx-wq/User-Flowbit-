import { createHash } from 'node:crypto'
import { detectHeader, mapHeaders, mappingProblem, type BankPreset, type ColumnMap, type DetectedPreset } from './presets'

/**
 * Bank statement rows → transactions: dates (day first, as Indian banks
 * print them), money in paise, credit or debit, and a row hash that makes a
 * re-imported statement skip what is already in. Pure (node:crypto only).
 */

export type Direction = 'credit' | 'debit'

export type StatementTxn = Readonly<{
  /** 1-based line in the file. */
  line: number
  date: string
  narration: string
  reference: string
  direction: Direction
  amountPaise: number
  balancePaise: number | null
  rowHash: string
}>

export type ParsedStatement = Readonly<{
  preset: DetectedPreset
  headerRow: number
  headers: string[]
  map: ColumnMap
  txns: StatementTxn[]
  /** Rows after the header that are not transactions (opening balance, totals, footers). */
  skipped: number
}>

const MONTHS: Readonly<Record<string, number>> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

const pad = (n: number) => String(n).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

function isoOf(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "05/10/2026", "05-10-26", "5 Oct 2026", "05-OCT-2026", "2026-10-05" (and with a time after it) → "2026-10-05". */
export function parseStatementDate(text: string): string | null {
  const value = text.trim().split(/\s+(?=\d{1,2}:\d{2})/)[0]
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]))
  m = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/)
  if (m) return isoOf(fullYear(Number(m[3])), Number(m[2]), Number(m[1]))
  m = value.match(/^(\d{1,2})[\s/.\-]+([A-Za-z]{3,4})[A-Za-z]*[\s/.\-,]+(\d{2}|\d{4})$/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    return month ? isoOf(fullYear(Number(m[3])), month, Number(m[1])) : null
  }
  return null
}

/**
 * Money text in paise without floating point: "1,23,456.78", "₹ 500", "Rs. 1,000.5",
 * "(250.00)" and "-250" (negative), "1,000.00 Cr" / "Dr". Null when there is no number.
 */
export function parseAmountPaise(text: string): { paise: number; sign: 1 | -1; marker: 'cr' | 'dr' | null } | null {
  const raw = text.trim()
  if (!raw) return null
  const marker = /\bcr\.?$/i.test(raw) ? 'cr' : /\bdr\.?$/i.test(raw) ? 'dr' : null
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw.replace(/^(₹|rs\.?|inr)\s*/i, ''))
  const digits = raw.replace(/(₹|rs\.?|inr|cr\.?|dr\.?)/gi, '').replace(/[,\s()+-]/g, '')
  const m = digits.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) return null
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
  if (!Number.isSafeInteger(paise)) return null
  return { paise, sign: negative ? -1 : 1, marker }
}

const cell = (row: readonly string[], index: number) => (index >= 0 ? (row[index] ?? '').trim() : '')

/** Credit or debit and the amount of one row, or null when the row moves no money. */
function moneyOf(row: readonly string[], map: ColumnMap): { direction: Direction; amountPaise: number } | null {
  const credit = parseAmountPaise(cell(row, map.credit))
  const debit = parseAmountPaise(cell(row, map.debit))
  if (credit && credit.paise > 0) return { direction: 'credit', amountPaise: credit.paise }
  if (debit && debit.paise > 0) return { direction: 'debit', amountPaise: debit.paise }
  const amount = parseAmountPaise(cell(row, map.amount))
  if (!amount || amount.paise === 0) return null
  const flag = cell(row, map.drcr).toLowerCase()
  const isDebit = flag ? /^(d|dr|debit|withdrawal)/.test(flag) : amount.marker ? amount.marker === 'dr' : amount.sign < 0
  return { direction: isDebit ? 'debit' : 'credit', amountPaise: amount.paise }
}

function signedBalance(text: string): number | null {
  const parsed = parseAmountPaise(text)
  if (!parsed) return null
  return parsed.marker === 'dr' || parsed.sign < 0 ? -parsed.paise : parsed.paise
}

/** Narration with spaces collapsed and in upper case, for hashing and matching. */
export const normaliseNarration = (text: string): string => text.replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * The duplicate key: the firm, the transaction and its balance. Identical rows in one file
 * (two ₹500 UPI payments, no balance column) get their position among the identical rows,
 * so importing the same file twice still finds both.
 */
export function rowHash(entityId: string, txn: Omit<StatementTxn, 'rowHash' | 'line'>, occurrence: number): string {
  const key = [entityId, txn.date, txn.direction, txn.amountPaise, normaliseNarration(txn.narration), txn.reference.toUpperCase(), txn.balancePaise ?? '', occurrence].join('|')
  return createHash('sha256').update(key).digest('hex')
}

export const MAX_STATEMENT_ROWS = 5000

/** Reads the statement with a preset (or an explicit column map for "Other bank"). */
export function parseStatement(rows: readonly (readonly string[])[], entityId: string, opts: { preset?: BankPreset; map?: ColumnMap | null } = {}): ParsedStatement | { error: string } {
  const guess = detectHeader(rows, opts.preset ?? 'auto')
  if (!guess && !opts.map) return { error: 'No header row with a date, a narration and a deposit column was found. Pick "Other bank" and map the columns.' }
  const headerRow = guess?.headerRow ?? 0
  const map = opts.map ?? guess!.map
  const problem = mappingProblem(map)
  if (problem) return { error: problem }
  const body = rows.slice(headerRow + 1)
  if (body.length > MAX_STATEMENT_ROWS) return { error: `A statement can have at most ${MAX_STATEMENT_ROWS.toLocaleString('en-IN')} rows. Split it by month.` }
  const seen = new Map<string, number>()
  const txns: StatementTxn[] = []
  let skipped = 0
  body.forEach((row, i) => {
    const date = parseStatementDate(cell(row, map.date))
    const money = date ? moneyOf(row, map) : null
    if (!date || !money) {
      if (row.some((c) => c.trim())) skipped += 1
      return
    }
    const base = { date, narration: cell(row, map.narration).replace(/\s+/g, ' ').slice(0, 500), reference: cell(row, map.reference).slice(0, 80), ...money, balancePaise: signedBalance(cell(row, map.balance)) }
    const key = [base.date, base.direction, base.amountPaise, normaliseNarration(base.narration), base.reference, base.balancePaise ?? ''].join('|')
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    txns.push({ ...base, line: headerRow + i + 2, rowHash: rowHash(entityId, base, occurrence) })
  })
  if (!txns.length) return { error: 'No transactions were found under the header. Check the column mapping.' }
  return { preset: guess?.preset ?? 'generic', headerRow, headers: [...(rows[headerRow] ?? [])], map, txns, skipped }
}

/** The map for "Other bank" from the person's picks, by header text; falls back to the generic guess. */
export function mapFromPicks(headers: readonly string[], picks: Readonly<Partial<Record<keyof ColumnMap, string>>>): ColumnMap {
  const guess = mapHeaders(headers, 'generic')
  const index = (field: keyof ColumnMap) => {
    const pick = picks[field]
    if (pick === undefined) return guess[field]
    if (pick === '') return -1
    return headers.indexOf(pick)
  }
  return { date: index('date'), narration: index('narration'), reference: index('reference'), debit: index('debit'), credit: index('credit'), amount: index('amount'), drcr: index('drcr'), balance: index('balance') }
}
