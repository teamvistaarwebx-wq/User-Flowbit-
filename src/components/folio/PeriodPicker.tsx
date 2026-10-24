import { CalendarRange } from 'lucide-react'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { DateInput } from '@/components/ui/input'
import { PERIOD_KEYS, PERIOD_LABELS, type Period, type PeriodKey } from '@/modules/folio/engine/period'
import { FilterTabs } from './FilterTabs'

const RANGE_KEYS = ['period', 'from', 'to', 'page']

/**
 * This month · Last month · This FY · Last FY · Custom, kept in the URL
 * (?period=, and ?from&to for Custom). Server-rendered; the custom dates are a
 * plain GET form, so it works without JavaScript.
 */
export function PeriodPicker({ base, params, period, today, allowAll = false }: { base: string; params: SearchParams; period: Period; today: string; allowAll?: boolean }) {
  const keys: PeriodKey[] = allowAll ? ['all', ...PERIOD_KEYS] : [...PERIOD_KEYS]
  const href = (key: PeriodKey) =>
    key === 'custom'
      ? buildHref(base, params, { page: undefined, period: 'custom', from: period.from ?? `${today.slice(0, 7)}-01`, to: period.to ?? today })
      : buildHref(base, params, { page: undefined, from: undefined, to: undefined, period: key })
  const carried = Object.entries(params)
    .map(([k, v]) => [k, first(v)] as const)
    .filter((e): e is readonly [string, string] => !RANGE_KEYS.includes(e[0]) && Boolean(e[1]))
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <FilterTabs label="Period" className="shrink-0" tabs={keys.map((k) => ({ href: href(k), label: PERIOD_LABELS[k], active: period.key === k }))} />
      {period.key === 'custom' ? (
        <form action={base} method="get" className="flex flex-wrap items-center gap-2">
          {carried.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="period" value="custom" />
          <DateInput name="from" aria-label="From" defaultValue={period.from ?? undefined} inputSize="sm" className="w-40" />
          <span className="text-[13px] text-fg-2">to</span>
          <DateInput name="to" aria-label="To" defaultValue={period.to ?? undefined} inputSize="sm" className="w-40" />
          <button type="submit" className={buttonClass('secondary', 'sm')}>
            <CalendarRange className="size-4" /> Apply
          </button>
        </form>
      ) : (
        <span className="text-[13px] text-fg-2">{period.key === 'all' ? 'Every date' : period.window}</span>
      )}
    </div>
  )
}
