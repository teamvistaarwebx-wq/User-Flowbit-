import type { ReactNode } from 'react'
import { CalendarRange } from 'lucide-react'
import { first, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { DateInput } from '@/components/ui/input'

type RangeFormProps = {
  /** Page path the form submits to (GET). */
  path: string
  params: SearchParams
  /** Params carried through unchanged as hidden fields. */
  keep: string[]
  /** Extra controls (selects) rendered before the dates. */
  children?: ReactNode
  defaults?: { from?: string; to?: string }
  max?: string
}

/** Server-rendered GET filter: from/to dates plus any extra controls; works without JavaScript. */
export function RangeForm({ path, params, keep, children, defaults, max }: RangeFormProps) {
  return (
    <form action={path} method="get" className="flex flex-wrap items-end gap-2">
      {keep.map((k) => {
        const v = first(params[k])
        return v ? <input key={k} type="hidden" name={k} value={v} /> : null
      })}
      {children}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-white/80">From</span>
        <DateInput name="from" defaultValue={first(params.from) ?? defaults?.from} max={max} inputSize="sm" className="w-40" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-white/80">To</span>
        <DateInput name="to" defaultValue={first(params.to) ?? defaults?.to} max={max} inputSize="sm" className="w-40" />
      </label>
      <button type="submit" className={buttonClass('secondary', 'sm')}>
        <CalendarRange className="size-4" /> Apply
      </button>
    </form>
  )
}
