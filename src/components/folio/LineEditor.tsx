'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { FormField } from '@/components/ui/action-form'
import { Input, NativeSelect } from '@/components/ui/input'
import { formatINR } from '@/lib/money'
import { sgstLabel } from '@/modules/folio/engine/states'
import type { BuilderService } from '@/modules/folio/invoices/builder-data'
import type { PricedLine } from '@/modules/folio/invoices/pricing'
import { newLine, type LineState } from './line-state'
import { INSET } from './ui'

/** Editable line rows of the document builder. State lives in the parent (immutable updates). */

type Props = {
  lines: LineState[]
  onChange: (lines: LineState[]) => void
  priced: PricedLine[]
  isTax: boolean
  taxRates: number[]
  services: BuilderService[]
  defaultGstRate: number
  placeCode: string | null
}

export function LineEditor({ lines, onChange, priced, isTax, taxRates, services, defaultGstRate, placeCode }: Props) {
  const update = (index: number, patch: Partial<LineState>) => onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  const pickService = (index: number, id: string) => {
    const item = services.find((s) => s.id === id)
    if (!item) return update(index, { serviceItemId: '' })
    update(index, { serviceItemId: id, description: item.description || item.name, hsnSac: item.hsnSac, unit: item.unit, rate: (item.ratePaise / 100).toFixed(2), gstRatePercent: String(isTax ? item.gstRatePercent : 0) })
  }
  const serviceOptions = [{ value: '', label: 'Free text' }, ...services.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))]
  const rateOptions = taxRates.map((r) => ({ value: String(r), label: `${r}%` }))
  const sgst = sgstLabel(placeCode)

  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        const p = priced[i]
        const name = (field: string) => `lines.${i}.${field}`
        return (
          <div key={line.key} className={`${INSET} p-3.5 animate-fade-in`}>
            <div className="grid grid-cols-12 gap-2">
              <FormField name={name('serviceItemId')} label="Service" className="col-span-12 sm:col-span-3">
                <NativeSelect name={name('serviceItemId')} value={line.serviceItemId} onChange={(e) => pickService(i, e.target.value)} options={serviceOptions} />
              </FormField>
              <FormField name={name('description')} label="Description" required className="col-span-8 sm:col-span-7">
                <Input id={name('description')} name={name('description')} value={line.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="What you are billing for" maxLength={500} />
              </FormField>
              <FormField name={name('hsnSac')} label="SAC" className="col-span-4 sm:col-span-2">
                <Input id={name('hsnSac')} name={name('hsnSac')} value={line.hsnSac} onChange={(e) => update(i, { hsnSac: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={8} placeholder="998314" />
              </FormField>
              <FormField name={name('quantity')} label="Qty" className="col-span-4 sm:col-span-2">
                <Input id={name('quantity')} name={name('quantity')} value={line.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" type="number" step="0.001" min="0" />
              </FormField>
              <FormField name={name('unit')} label="Unit" className="col-span-4 sm:col-span-2">
                <Input id={name('unit')} name={name('unit')} value={line.unit} onChange={(e) => update(i, { unit: e.target.value })} maxLength={20} />
              </FormField>
              <FormField name={name('rate')} label="Rate ₹" className="col-span-4 sm:col-span-4">
                <Input id={name('rate')} name={name('rate')} value={line.rate} onChange={(e) => update(i, { rate: e.target.value })} inputMode="decimal" type="number" step="0.01" min="0" placeholder="0.00" />
              </FormField>
              <FormField name={name('discountPercent')} label="Disc %" className="col-span-4 sm:col-span-2">
                <Input id={name('discountPercent')} name={name('discountPercent')} value={line.discountPercent} onChange={(e) => update(i, { discountPercent: e.target.value })} inputMode="decimal" type="number" step="0.01" min="0" max="100" placeholder="0" />
              </FormField>
              {isTax ? (
                <FormField name={name('gstRatePercent')} label="GST %" className="col-span-4 sm:col-span-2">
                  <NativeSelect name={name('gstRatePercent')} value={line.gstRatePercent} onChange={(e) => update(i, { gstRatePercent: e.target.value })} options={rateOptions} />
                </FormField>
              ) : (
                <input type="hidden" name={name('gstRatePercent')} value="0" />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs tabular-nums text-fg-2">
                {p ? (
                  <>
                    Taxable {formatINR(p.taxablePaise)}
                    {p.cgstPaise ? ` · CGST ${formatINR(p.cgstPaise)} · ${sgst} ${formatINR(p.sgstPaise)}` : ''}
                    {p.igstPaise ? ` · IGST ${formatINR(p.igstPaise)}` : ''}
                    {' · '}
                    <span className="font-medium text-white">{formatINR(p.lineTotalPaise)}</span>
                  </>
                ) : null}
              </p>
              <IconButton label="Remove line" size="sm" disabled={lines.length <= 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        )
      })}
      <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...lines, newLine(isTax ? defaultGstRate : 0)])} disabled={lines.length >= 100}>
        Add line
      </Button>
      {!isTax ? <p className="text-xs text-fg-2">This is a sale invoice, so no tax is charged and none will appear on the document.</p> : null}
    </div>
  )
}
