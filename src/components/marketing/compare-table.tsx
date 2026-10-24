import { Check, Minus } from 'lucide-react'
import { PRODUCT_KEYS, PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { PLAN_CARDS, planIncludes, rupees, unitPrice } from '@/modules/marketing/pricing'
import { ProductIcon } from './product-icon'

/** Order the columns product plans first, Suite last (highlighted). */
const COLUMNS = [...PLAN_CARDS.filter((p) => !p.featured), ...PLAN_CARDS.filter((p) => p.featured)]

/** Features (rows, grouped by product, from the catalog) × plans (columns) with check marks. */
export function CompareTable() {
  return (
    <div className="card-table overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
        <caption className="sr-only">Features included in each Flowbit plan</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="w-[28%] px-5 py-4 align-bottom text-sm font-normal text-white">Feature</th>
            {COLUMNS.map((p) => (
              <th key={p.key} scope="col" className={cn('px-3 py-4 text-center align-bottom', p.featured && 'bg-white/[0.05]')}>
                <span className={cn('block text-[13px] font-medium', p.featured ? 'text-blush' : 'text-white')}>{p.name}</span>
                <span className="block text-[11px] font-normal text-[#979797]">{rupees(unitPrice(p.key, 'monthly'))} / {p.unitLabel}</span>
              </th>
            ))}
          </tr>
        </thead>
        {PRODUCT_KEYS.map((product) => (
          <tbody key={product}>
            <tr>
              <th colSpan={COLUMNS.length + 1} scope="colgroup" className="border-t border-line px-5 pb-2 pt-5 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">
                <span className="inline-flex items-center gap-2"><ProductIcon product={product} />{PRODUCTS[product].name}</span>
              </th>
            </tr>
            {PRODUCTS[product].features.map((f) => (
              <tr key={f.key} className="transition-colors hover:bg-white/[0.03]">
                <th scope="row" className="px-5 py-2.5 font-normal text-white/85">
                  {f.name}
                  {f.requires === 'muster_business' ? <span className="ml-2 text-[11px] text-warning">Business</span> : null}
                </th>
                {COLUMNS.map((p) => (
                  <td key={p.key} className={cn('px-3 py-2.5 text-center', p.featured && 'bg-white/[0.05]')}>
                    {planIncludes(p.key, f.key) ? (
                      <Check className="mx-auto size-4 text-white" aria-label="Included" />
                    ) : (
                      <Minus className="mx-auto size-4 text-white/20" aria-label="Not included" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
