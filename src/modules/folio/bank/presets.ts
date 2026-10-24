/**
 * Bank statement column presets (HDFC, ICICI, SBI, Axis, Kotak and a generic
 * one): header aliases per field, the header-row finder and the column
 * mapping a statement is read with. Pure and client-safe.
 */

export const BANK_PRESETS = ['auto', 'hdfc', 'icici', 'sbi', 'axis', 'kotak', 'generic'] as const
export type BankPreset = (typeof BANK_PRESETS)[number]
export type DetectedPreset = Exclude<BankPreset, 'auto'>

export const BANK_PRESET_LABEL: Readonly<Record<BankPreset, string>> = {
  auto: 'Detect from the file',
  hdfc: 'HDFC Bank',
  icici: 'ICICI Bank',
  sbi: 'State Bank of India',
  axis: 'Axis Bank',
  kotak: 'Kotak Mahindra Bank',
  generic: 'Other bank (map the columns)',
}

export const MAP_FIELDS = ['date', 'narration', 'reference', 'debit', 'credit', 'amount', 'drcr', 'balance'] as const
export type MapField = (typeof MAP_FIELDS)[number]

export const MAP_FIELD_LABEL: Readonly<Record<MapField, string>> = {
  date: 'Date',
  narration: 'Narration / description',
  reference: 'Reference / cheque no.',
  debit: 'Withdrawal (debit)',
  credit: 'Deposit (credit)',
  amount: 'Amount (one column)',
  drcr: 'Dr / Cr',
  balance: 'Balance',
}

/** Column index per field; -1 when the statement has no such column. */
export type ColumnMap = Readonly<Record<MapField, number>>

type Aliases = Readonly<Partial<Record<MapField, readonly string[]>>>

/** Normalised header text: lower case letters and digits only ("Chq./Ref.No." → "chqrefno"). */
export const normaliseHeader = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** In order of preference: the first alias found wins (ICICI's transaction date over its value date). */
const PRESET_ALIASES: Readonly<Record<Exclude<DetectedPreset, 'generic'>, Aliases>> = {
  hdfc: {
    date: ['date', 'transactiondate'],
    narration: ['narration'],
    reference: ['chqrefno', 'chqrefnumber', 'refno'],
    debit: ['withdrawalamt', 'withdrawalamount'],
    credit: ['depositamt', 'depositamount'],
    balance: ['closingbalance', 'balance'],
  },
  icici: {
    date: ['transactiondate', 'txndate', 'valuedate'],
    narration: ['transactionremarks', 'remarks', 'particulars'],
    reference: ['chequenumber', 'chqno', 'refno'],
    debit: ['withdrawalamountinr', 'withdrawalamount', 'withdrawals'],
    credit: ['depositamountinr', 'depositamount', 'deposits'],
    balance: ['balanceinr', 'balance'],
  },
  sbi: {
    date: ['txndate', 'transactiondate', 'date'],
    narration: ['description', 'narration'],
    reference: ['refnochequeno', 'refno', 'chequeno'],
    debit: ['debit', 'withdrawal'],
    credit: ['credit', 'deposit'],
    balance: ['balance'],
  },
  axis: {
    date: ['trandate', 'transactiondate', 'txndate'],
    narration: ['particulars', 'narration'],
    reference: ['chqno', 'chequeno', 'refno'],
    debit: ['dr', 'debit', 'withdrawalamt'],
    credit: ['cr', 'credit', 'depositamt'],
    balance: ['bal', 'balance'],
  },
  kotak: {
    date: ['transactiondate', 'date', 'txndate'],
    narration: ['description', 'narration'],
    reference: ['chqrefno', 'refno', 'chequeno'],
    debit: ['debit', 'withdrawalamt'],
    credit: ['credit', 'depositamt'],
    amount: ['amount'],
    drcr: ['drcr', 'debitcredit', 'type'],
    balance: ['balance'],
  },
}

/** Generic: every bank's aliases plus common words, for statements from other banks. */
const GENERIC_ALIASES: Aliases = {
  date: ['date', 'transactiondate', 'txndate', 'trandate', 'postingdate', 'valuedate'],
  narration: ['narration', 'description', 'particulars', 'transactionremarks', 'remarks', 'details', 'transactiondetails'],
  reference: ['chqrefno', 'refno', 'reference', 'referenceno', 'chequeno', 'chqno', 'utr', 'refnochequeno'],
  debit: ['withdrawalamt', 'withdrawalamount', 'withdrawalamountinr', 'withdrawals', 'debit', 'debitamount', 'dr', 'withdrawal'],
  credit: ['depositamt', 'depositamount', 'depositamountinr', 'deposits', 'credit', 'creditamount', 'cr', 'deposit'],
  amount: ['amount', 'transactionamount', 'amountinr'],
  drcr: ['drcr', 'debitcredit', 'crdr', 'type', 'transactiontype'],
  balance: ['closingbalance', 'balance', 'balanceinr', 'runningbalance', 'bal'],
}

export const aliasesOf = (preset: DetectedPreset): Aliases => (preset === 'generic' ? GENERIC_ALIASES : PRESET_ALIASES[preset])

/** Maps a header row with a preset's aliases. Each column is used once. */
export function mapHeaders(headers: readonly string[], preset: DetectedPreset): ColumnMap {
  const norm = headers.map(normaliseHeader)
  const used = new Set<number>()
  const aliases = aliasesOf(preset)
  const entries = MAP_FIELDS.map((field) => {
    for (const alias of aliases[field] ?? []) {
      const index = norm.findIndex((h, i) => h === alias && !used.has(i))
      if (index >= 0) {
        used.add(index)
        return [field, index] as const
      }
    }
    return [field, -1] as const
  })
  return Object.fromEntries(entries) as Record<MapField, number>
}

/** A map can read money in when it has a date, a narration, and credit, or an amount column. */
export function mappingProblem(map: ColumnMap): string | null {
  if (map.date < 0) return 'Pick the column with the transaction date.'
  if (map.narration < 0) return 'Pick the column with the narration or description.'
  if (map.credit < 0 && map.amount < 0) return 'Pick the deposit (credit) column, or one amount column.'
  return null
}

const fieldsFound = (map: ColumnMap) => MAP_FIELDS.filter((f) => map[f] >= 0).length

const HEADER_SCAN_ROWS = 40

export type HeaderGuess = Readonly<{ preset: DetectedPreset; headerRow: number; map: ColumnMap }>

/**
 * The header row and the preset that reads it best. Bank exports start with
 * the account holder's details, so the first 40 rows are searched for a row
 * that a preset can map. `preset` other than 'auto' only uses that preset.
 */
export function detectHeader(rows: readonly (readonly string[])[], preset: BankPreset = 'auto'): HeaderGuess | null {
  const candidates: DetectedPreset[] = preset === 'auto' ? ['hdfc', 'icici', 'sbi', 'axis', 'kotak', 'generic'] : [preset]
  let best: HeaderGuess | null = null
  let bestScore = 0
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r += 1) {
    for (const candidate of candidates) {
      const map = mapHeaders(rows[r], candidate)
      if (mappingProblem(map)) continue
      // A bank's own preset beats generic on a tie; an earlier row beats a later one.
      const score = fieldsFound(map) * 10 + (candidate === 'generic' ? 0 : 1)
      if (score > bestScore) {
        best = { preset: candidate, headerRow: r, map }
        bestScore = score
      }
    }
    if (best) return best
  }
  return best
}
