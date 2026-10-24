import { ChartPie, FileText, Receipt } from 'lucide-react'
import { BarChart } from '@/components/charts/bar-chart'
import { Avatar } from '@/components/ui/avatar'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { amountInWords, formatINR, formatINRCompact } from '@/lib/money'
import { MockFrame, MockPill } from '../mock-frame'

const ACCENT = 'var(--folio)'

const LINES = [
  { item: 'Website design and build, phase 2', sac: '998314', qty: 1, ratePaise: 12_000_000 },
  { item: 'Monthly maintenance retainer, October', sac: '998314', qty: 1, ratePaise: 2_500_000 },
]
const GST_RATE = 0.18

/** GST invoice: issued number, intra-state CGST + SGST split, total in words. */
export function FolioInvoiceMock() {
  const taxable = LINES.reduce((s, l) => s + l.qty * l.ratePaise, 0)
  const half = Math.round((taxable * GST_RATE) / 2)
  const total = taxable + half * 2
  return (
    <MockFrame label="Preview of a Folio GST invoice" path="/app/folio/invoices/vwx-2026-27-0042" accent={ACCENT}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="section-label flex items-center gap-2"><FileText className="size-3.5" strokeWidth={1.5} aria-hidden /> Tax invoice</span>
          <p className="mt-1 text-sm font-semibold text-fg">VWX/2026-27/0042</p>
          <p className="text-[11px] text-fg-3">Issued 1 Oct 2026 · Due 16 Oct 2026</p>
        </div>
        <span className="flex items-center gap-2"><StatusPill status="issued" /><MockPill>Email PDF</MockPill></span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-[10px] bg-white/[0.04] p-3">
          <p className="text-fg-3">From</p>
          <p className="font-medium text-fg">Vistaar WebX</p>
          <p className="text-fg-3">Bhopal, Madhya Pradesh (23)</p>
        </div>
        <div className="rounded-[10px] bg-white/[0.04] p-3">
          <p className="text-fg-3">Bill to · place of supply</p>
          <p className="font-medium text-fg">Kalpa Studio LLP</p>
          <p className="text-fg-3">Indore, Madhya Pradesh (23)</p>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-[10px] bg-[#232323] text-[11px]">
        <div className="grid grid-cols-[2.4fr_0.8fr_1fr] border-b border-line/70 px-3 py-2 text-[10px] text-white"><span>Item · SAC</span><span className="text-right">Qty</span><span className="text-right">Amount</span></div>
        {LINES.map((l) => (
          <div key={l.item} className="grid grid-cols-[2.4fr_0.8fr_1fr] border-t border-white/[0.04] px-3 py-2.5">
            <span className="min-w-0"><span className="block truncate text-fg">{l.item}</span><span className="text-[10px] text-fg-3">{l.sac}</span></span>
            <span className="text-right text-fg-2">{l.qty}</span>
            <span className="text-right text-fg">{formatINR(l.qty * l.ratePaise)}</span>
          </div>
        ))}
      </div>
      <dl className="ml-auto mt-3 grid max-w-[260px] gap-1.5 text-[11px]">
        <div className="flex justify-between"><dt className="text-fg-3">Taxable value</dt><dd className="text-fg">{formatINR(taxable)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-3">CGST 9%</dt><dd className="text-fg">{formatINR(half)}</dd></div>
        <div className="flex justify-between"><dt className="text-fg-3">SGST 9%</dt><dd className="text-fg">{formatINR(half)}</dd></div>
        <div className="flex justify-between border-t border-line/70 pt-1.5 text-[13px] font-semibold"><dt className="text-fg">Total</dt><dd className="text-folio">{formatINR(total)}</dd></div>
      </dl>
      <p className="mt-2 text-right text-[10px] text-fg-3">{amountInWords(total)}</p>
    </MockFrame>
  )
}

const BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+']
const AGING = [42_000_000, 18_500_000, 6_200_000, 2_400_000, 1_100_000]
const DEBTORS = [
  { name: 'Saffron Threads', duePaise: 6_844_000, overdueDays: 34 },
  { name: 'Ananta Foods', duePaise: 4_130_000, overdueDays: 12 },
  { name: 'Nirmal Realty', duePaise: 2_360_000, overdueDays: 71 },
]

/** Receivables dashboard: aging buckets and top debtors. */
export function FolioAgingMock() {
  const outstanding = AGING.reduce((s, v) => s + v, 0)
  return (
    <MockFrame label="Preview of the Folio receivables dashboard" path="/app/folio" accent={ACCENT}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="section-label flex items-center gap-2"><ChartPie className="size-3.5" strokeWidth={1.5} aria-hidden /> Receivables</span>
        <span className="text-[11px] text-fg-3">Outstanding <span className="font-semibold text-fg">{formatINRCompact(outstanding)}</span></span>
      </div>
      <div className="mt-4">
        <BarChart labels={BUCKETS} series={[{ name: 'Outstanding', color: 'var(--folio)', data: AGING }]} height={150} formatValue={(v) => formatINRCompact(v)} />
      </div>
      <p className="section-label mt-4">Top debtors</p>
      <div className="mt-2 grid gap-2">
        {DEBTORS.map((d) => (
          <div key={d.name} className="flex items-center gap-3 rounded-[10px] bg-white/[0.04] px-3 py-2">
            <Avatar name={d.name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{d.name}</span>
            <Badge tone={d.overdueDays > 60 ? 'danger' : 'warning'}>{d.overdueDays} days</Badge>
            <span className="w-20 text-right text-[12px] font-semibold text-fg">{formatINRCompact(d.duePaise)}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  )
}

const RECEIPT_PAISE = 35_000_000
const ALLOCATIONS = [
  { number: 'VWX/2026-27/0031', balancePaise: 11_800_000 },
  { number: 'VWX/2026-27/0036', balancePaise: 14_750_000 },
  { number: 'VWX/2026-27/0039', balancePaise: 5_900_000 },
]

/** Receipt allocation: one payment spread across three invoices, the rest kept as an advance. */
export function FolioReceiptMock() {
  const allocated = ALLOCATIONS.reduce((s, a) => s + a.balancePaise, 0)
  const advance = RECEIPT_PAISE - allocated
  return (
    <MockFrame label="Preview of a Folio receipt being allocated to invoices" path="/app/folio/receipts/new" accent={ACCENT}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="section-label flex items-center gap-2"><Receipt className="size-3.5" strokeWidth={1.5} aria-hidden /> Receipt</span>
          <p className="mt-1 text-sm font-semibold text-fg">Ananta Foods · NEFT</p>
          <p className="text-[11px] text-fg-3">Received 30 Sep 2026</p>
        </div>
        <p className="text-xl font-semibold text-folio">{formatINR(RECEIPT_PAISE, { decimals: 0 })}</p>
      </div>
      <Progress className="mt-4" value={(allocated / RECEIPT_PAISE) * 100} label="Allocated" />
      <div className="mt-4 grid gap-2">
        {ALLOCATIONS.map((a) => (
          <div key={a.number} className="flex items-center justify-between rounded-[10px] bg-white/[0.04] px-3 py-2.5 text-[11px]">
            <span className="text-fg">{a.number}</span>
            <span className="flex items-center gap-2"><span className="text-fg-2">{formatINR(a.balancePaise, { decimals: 0 })}</span><StatusPill status="paid" /></span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-[10px] bg-white/[0.04] px-3 py-2.5 text-[11px]">
          <span className="text-fg-2">Unallocated, kept as advance</span>
          <span className="font-semibold text-folio">{formatINR(advance, { decimals: 0 })}</span>
        </div>
      </div>
    </MockFrame>
  )
}
