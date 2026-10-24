/**
 * Indian statutory due dates, FY 2026-27 (pure, client-safe). The table is
 * docs/archive/V2-RESEARCH.md §3, kept as editable data: the government extends dates
 * often, so a workspace can override any one occurrence, and every screen
 * says to verify before relying on it.
 *
 *  GSTR-1        11th of the next month; QRMP: quarterly, 13th after the quarter
 *  GSTR-3B       20th of the next month; QRMP: 22nd or 24th after the quarter (by state)
 *  PMT-06        QRMP only: 25th of the next month, for the first two months of a quarter
 *  TDS deposit   7th of the next month; March: 30 April
 *  TDS returns   31 Jul, 31 Oct, 31 Jan, 31 May
 *  PF, ESI       15th of the next month
 *  Prof. tax     per state (editable day of the next month)
 *  Advance tax   15 Jun, 15 Sep, 15 Dec, 15 Mar
 */

export const COMPLIANCE_ITEMS = ['gstr1', 'gstr3b', 'pmt06', 'tds_deposit', 'tds_return', 'pf', 'esi', 'pt', 'advance_tax'] as const
export type ComplianceItem = (typeof COMPLIANCE_ITEMS)[number]

export const ITEM_LABELS: Readonly<Record<ComplianceItem, string>> = {
  gstr1: 'GSTR-1',
  gstr3b: 'GSTR-3B',
  pmt06: 'PMT-06 (QRMP tax payment)',
  tds_deposit: 'TDS deposit',
  tds_return: 'TDS return (24Q / 26Q)',
  pf: 'PF payment and ECR',
  esi: 'ESI payment',
  pt: 'Professional tax',
  advance_tax: 'Advance tax',
}

export const FILER_TYPES = ['monthly', 'qrmp'] as const
export type FilerType = (typeof FILER_TYPES)[number]

export const VERIFY_NOTE = 'These dates follow the law as of FY 2026-27. The government often extends them: check the GST portal, the income-tax site, EPFO and your state before relying on a date, and override it here when it moves.'

/** QRMP GSTR-3B: Category X states file by the 22nd, everyone else by the 24th (CGST notification 76/2020). */
export const QRMP_22ND_STATES: readonly string[] = ['CG', 'MP', 'GJ', 'MH', 'KA', 'GA', 'KL', 'TN', 'TS', 'AP', 'DN', 'PY', 'AN', 'LD']

/** Professional tax: the usual day of the next month by state (blank = set it yourself). Verify with the state. */
export const PT_DEFAULT_DAY: Readonly<Record<string, number>> = { KA: 20, MH: 31, WB: 21, TS: 10, AP: 10, GJ: 15, MP: 10, OD: 10, AS: 28 }

export type Override = Readonly<{ item: ComplianceItem; period: string; dueDate: string; note?: string }>

export type ComplianceSettings = Readonly<{
  filerType: FilerType
  /** Two-letter state code (lib/india-states). */
  state: string
  items: readonly ComplianceItem[]
  /** Professional tax day of the next month; null = the state default; 0 = not set. */
  ptDay: number | null
  overrides: readonly Override[]
}>

export const DEFAULT_ITEMS: readonly ComplianceItem[] = ['gstr1', 'gstr3b', 'tds_deposit', 'tds_return', 'pf', 'esi', 'advance_tax']

export type DueItem = Readonly<{ item: ComplianceItem; label: string; period: string; periodLabel: string; dueDate: string; extended: boolean; note: string | null }>

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** The ISO date of `day` (clamped to the month's end) in month m (1-12) of year y. */
const on = (y: number, m: number, day: number) => `${y}-${pad(m)}-${pad(Math.min(day, lastDay(y, m)))}`
const next = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`

/** The Indian financial-year quarter (1 = Apr–Jun) a month belongs to, and its label 'Q2 FY 2026-27'. */
function quarterOf(y: number, m: number) {
  const q = m >= 4 ? Math.ceil((m - 3) / 3) : 4
  const fy = m >= 4 ? y : y - 1
  return { q, fy, label: `Q${q} FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`, key: `${fy}-Q${q}` }
}
const isQuarterEnd = (m: number) => m % 3 === 0

export const ptDayFor = (settings: Pick<ComplianceSettings, 'ptDay' | 'state'>): number | null => (settings.ptDay === 0 ? null : (settings.ptDay ?? PT_DEFAULT_DAY[settings.state] ?? null))

type Raw = Omit<DueItem, 'label' | 'extended' | 'note'>

/** Due dates for the tax period of month (y, m): what falls due for that month or the quarter it ends. */
function forMonth(y: number, m: number, s: ComplianceSettings): Raw[] {
  const out: Raw[] = []
  const n = next(y, m)
  const month = `${y}-${pad(m)}`
  const quarter = quarterOf(y, m)
  const qrmp = s.filerType === 'qrmp'
  const add = (item: ComplianceItem, period: string, periodLabel: string, dueDate: string) => out.push({ item, period, periodLabel, dueDate })
  if (!qrmp) {
    add('gstr1', month, monthLabel(y, m), on(n.y, n.m, 11))
    add('gstr3b', month, monthLabel(y, m), on(n.y, n.m, 20))
  } else if (isQuarterEnd(m)) {
    add('gstr1', quarter.key, quarter.label, on(n.y, n.m, 13))
    add('gstr3b', quarter.key, quarter.label, on(n.y, n.m, QRMP_22ND_STATES.includes(s.state) ? 22 : 24))
  } else {
    add('pmt06', month, monthLabel(y, m), on(n.y, n.m, 25))
  }
  add('tds_deposit', month, monthLabel(y, m), m === 3 ? on(y, 4, 30) : on(n.y, n.m, 7))
  if (isQuarterEnd(m)) add('tds_return', quarter.key, quarter.label, quarter.q === 4 ? on(y, 5, 31) : on(n.y, n.m, 31))
  add('pf', month, monthLabel(y, m), on(n.y, n.m, 15))
  add('esi', month, monthLabel(y, m), on(n.y, n.m, 15))
  const ptDay = ptDayFor(s)
  if (ptDay) add('pt', month, monthLabel(y, m), on(n.y, n.m, ptDay))
  // Advance tax instalments fall due in the quarter's last month (Jun, Sep, Dec, Mar) on the 15th.
  if (isQuarterEnd(m)) add('advance_tax', `${quarter.key}-AT`, `${quarter.label} instalment`, on(y, m, 15))
  return out
}

/**
 * Every enabled due date between `from` and `to` (ISO, inclusive), with the
 * workspace's overrides applied (an extension moves the date and is marked).
 * Sorted by date, then by the order of COMPLIANCE_ITEMS.
 */
export function dueDatesBetween(settings: ComplianceSettings, from: string, to: string): DueItem[] {
  const enabled = new Set(settings.items)
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: DueItem[] = []
  // Periods end up to two months before their due date (TDS Q4: March → 31 May).
  let y = fm <= 3 ? fy - 1 : fy
  let m = fm <= 3 ? fm + 9 : fm - 3
  while (y < ty || (y === ty && m <= tm)) {
    for (const raw of forMonth(y, m, settings)) {
      if (!enabled.has(raw.item)) continue
      const override = settings.overrides.find((o) => o.item === raw.item && o.period === raw.period)
      const dueDate = override?.dueDate ?? raw.dueDate
      if (dueDate < from || dueDate > to) continue
      out.push({ ...raw, label: ITEM_LABELS[raw.item], dueDate, extended: Boolean(override && override.dueDate !== raw.dueDate), note: override?.note ?? null })
    }
    ;({ y, m } = next(y, m))
  }
  const order = (i: ComplianceItem) => COMPLIANCE_ITEMS.indexOf(i)
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || order(a.item) - order(b.item))
}

/** Cleans stored settings (unknown items, bad dates and days dropped). */
export function readComplianceSettings(raw: unknown): ComplianceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const items = Array.isArray(r.items) ? (r.items.filter((i) => (COMPLIANCE_ITEMS as readonly string[]).includes(String(i))) as ComplianceItem[]) : [...DEFAULT_ITEMS]
  const ptDay = typeof r.ptDay === 'number' && Number.isInteger(r.ptDay) && r.ptDay >= 0 && r.ptDay <= 31 ? r.ptDay : null
  const overrides = (Array.isArray(r.overrides) ? r.overrides : [])
    .map((o) => o as Record<string, unknown>)
    .filter((o) => (COMPLIANCE_ITEMS as readonly string[]).includes(String(o.item)) && typeof o.period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(o.dueDate)))
    .map((o) => ({ item: o.item as ComplianceItem, period: String(o.period), dueDate: String(o.dueDate), ...(typeof o.note === 'string' && o.note ? { note: o.note.slice(0, 200) } : {}) }))
  return { filerType: r.filerType === 'qrmp' ? 'qrmp' : 'monthly', state: typeof r.state === 'string' ? r.state.toUpperCase().slice(0, 2) : '', items, ptDay, overrides }
}
