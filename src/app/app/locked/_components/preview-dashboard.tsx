import { PRODUCTS, type ProductKey } from '@/lib/catalog'
import { formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BarChart } from '@/components/charts'
import { TONE_TEXT } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { SAMPLES } from './samples'

/**
 * A read-only, illustrative dashboard of a product the workspace has not
 * bought. Sample data only; nothing on it links anywhere or can be edited.
 */
export function PreviewDashboard({ product }: { product: ProductKey }) {
  const sample = SAMPLES[product]
  const accent = `var(${PRODUCTS[product].accentVar})`
  return (
    <section className="select-none" aria-label={`${PRODUCTS[product].name} preview with sample data`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Preview</h2>
        <p className="text-[13px] text-[#959596]">Sample data. Nothing here is real or clickable.</p>
      </div>
      <div className="pointer-events-none grid grid-cols-12 gap-3" inert>
        {sample.stats.map((s) => (
          <StatCard key={s.label} className="col-span-6 xl:col-span-3" label={s.label} value={s.value} delta={s.delta} invert={s.invert} trend={s.trend} color={accent} />
        ))}
        <Card className="col-span-12 rounded-[14px] lg:col-span-7">
          <CardHeader label={sample.chart.title} />
          <BarChart labels={sample.chart.labels} series={[{ name: sample.chart.title, color: accent, data: sample.chart.data }]} height={190} formatValue={sample.chart.money ? formatINRCompact : (v) => String(v)} />
        </Card>
        <Card variant="table" padded={false} className="col-span-12 lg:col-span-5">
          <div className="px-[23px] pb-3 pt-[17px]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">{sample.rowsTitle}</h3>
          </div>
          <ul className="border-t border-line py-1.5">
            {sample.rows.map((r) => (
              <li key={r.title} className="flex h-12 items-center justify-between gap-3 px-[23px]">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-white">{r.title}</span>
                  <span className="block truncate text-xs text-[#979797]">{r.meta}</span>
                </span>
                <span className={cn('shrink-0 text-[13px] font-medium', TONE_TEXT[r.tone])}>{r.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  )
}
