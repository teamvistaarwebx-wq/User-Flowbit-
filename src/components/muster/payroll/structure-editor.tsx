'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { CALCULATION_LABELS, CALCULATION_TYPES, type CalculationType } from '@/modules/muster/payroll/components'
import { saveSalaryStructure } from '@/modules/muster/payroll/structure-actions'
import { previewStructure, type ComponentLike } from '@/modules/muster/payroll/structure-lines'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { TONE_TEXT } from '@/components/ui/badge'
import { Note } from '../ui/note'

export type EditorLine = { code: string; calculationType: CalculationType; value: string }
type Props = {
  employeeId: string
  components: (ComponentLike & { code: string; name: string })[]
  initial: { monthlyGross: string; ctcAnnual: string; lines: EditorLine[] }
  defaultEffectiveFrom: string
  canEdit: boolean
}

const BASIS_OPTIONS = CALCULATION_TYPES.filter((t) => t !== 'computed').map((t) => ({ value: t, label: CALCULATION_LABELS[t] }))

/** Salary structure form with a live preview computed by the payroll engine's own resolver. */
export function StructureEditor({ employeeId, components, initial, defaultEffectiveFrom, canEdit }: Props) {
  const [gross, setGross] = useState(initial.monthlyGross)
  const [ctc, setCtc] = useState(initial.ctcAnnual)
  const [lines, setLines] = useState<EditorLine[]>(initial.lines)
  const byCode = useMemo(() => new Map(components.map((c) => [c.code, c])), [components])
  const grossPaise = rupeesToPaise(gross || '0')
  const ctcPaise = ctc ? rupeesToPaise(ctc) : grossPaise * 12
  const preview = useMemo(
    () => previewStructure(grossPaise, ctcPaise, lines.map((l) => ({ code: l.code, calculationType: l.calculationType, value: l.calculationType === 'fixed' ? rupeesToPaise(l.value || '0') : Number(l.value || 0) })), byCode),
    [grossPaise, ctcPaise, lines, byCode],
  )
  const unused = components.filter((c) => !lines.some((l) => l.code === c.code))
  const update = (i: number, patch: Partial<EditorLine>) => setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const closeGap = () => {
    const i = lines.findIndex((l) => l.code === 'SPECIAL' && l.calculationType === 'fixed')
    if (i < 0) return
    const current = rupeesToPaise(lines[i].value || '0')
    update(i, { value: String((current + preview.gap) / 100) })
  }

  return (
    <ActionForm action={saveSalaryStructure} className="space-y-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="effectiveFrom" label="Effective from" required>
          <DateInput id="effectiveFrom" name="effectiveFrom" defaultValue={defaultEffectiveFrom} disabled={!canEdit} />
        </FormField>
        <FormField name="monthlyGross" label="Monthly gross (₹)" required>
          <Input id="monthlyGross" name="monthlyGross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} disabled={!canEdit} />
        </FormField>
        <FormField name="ctcAnnual" label="Annual CTC (₹)" help={ctc ? undefined : `Defaults to 12 × gross: ${formatINR(grossPaise * 12, { decimals: 0 })}`}>
          <Input id="ctcAnnual" name="ctcAnnual" inputMode="decimal" value={ctc} onChange={(e) => setCtc(e.target.value)} placeholder="12 × gross" disabled={!canEdit} />
        </FormField>
      </div>
      <div className="overflow-x-auto border-y border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="h-[33px] px-3 text-left text-sm font-normal text-white">Component</th>
              <th className="h-[33px] px-3 text-left text-sm font-normal text-white">Basis</th>
              <th className="h-[33px] px-3 text-left text-sm font-normal text-white">Value</th>
              <th className="h-[33px] px-3 text-right text-sm font-normal text-white">Per month</th>
              <th className="h-[33px] px-3" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.code} className="transition-colors duration-150 hover:bg-white/[0.03]">
                <td className="px-3 py-2">
                  <input type="hidden" name={`lines.${i}.code`} value={l.code} />
                  <span className="text-white">{byCode.get(l.code)?.name ?? l.code}</span> <span className="font-mono text-xs text-fg-2">{l.code}</span>
                </td>
                <td className="px-3 py-2">
                  <NativeSelect name={`lines.${i}.calculationType`} options={BASIS_OPTIONS} value={l.calculationType} onChange={(e) => update(i, { calculationType: e.target.value as CalculationType })} disabled={!canEdit} className="h-8 min-w-[8.5rem] text-xs" aria-label="Basis" />
                </td>
                <td className="px-3 py-2">
                  <FormField name={`lines.${i}.value`}>
                    <Input name={`lines.${i}.value`} inputMode="decimal" inputSize="sm" value={l.value} onChange={(e) => update(i, { value: e.target.value })} trailing={l.calculationType === 'fixed' ? '₹' : '%'} disabled={!canEdit} aria-label="Value" />
                  </FormField>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-white">{formatINR(preview.amounts.get(l.code) ?? 0)}</td>
                <td className="px-3 py-2 text-right">
                  {canEdit && l.code !== 'BASIC' ? (
                    <IconButton label={`Remove ${l.code}`} size="sm" type="button" onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/[0.12] font-semibold text-white">
              <td className="px-3 py-2.5" colSpan={3}>Total of components</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${preview.gap === 0 ? TONE_TEXT.success : TONE_TEXT.warning}`}>{formatINR(preview.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {preview.gap !== 0 && grossPaise > 0 ? (
        <Note
          compact
          tone="warning"
          action={
            canEdit && lines.some((l) => l.code === 'SPECIAL' && l.calculationType === 'fixed') ? (
              <Button type="button" size="sm" variant="secondary" onClick={closeGap}>
                Close the gap
              </Button>
            ) : null
          }
        >
          The components are {formatINR(Math.abs(preview.gap))} {preview.gap > 0 ? 'short of' : 'over'} the monthly gross. Adjust the Special Allowance by {formatINR(Math.abs(preview.gap))} to close the gap.
        </Note>
      ) : null}
      {canEdit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {unused.length ? (
              <NativeSelect
                aria-label="Add a component"
                options={unused.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
                placeholder="Add a component…"
                value=""
                onChange={(e) => {
                  const c = byCode.get(e.target.value)
                  if (!c) return
                  const basis = (c.calculationType && c.calculationType !== 'computed' ? c.calculationType : 'fixed') as CalculationType
                  setLines((cur) => [...cur, { code: c.code, calculationType: basis, value: String(basis === 'fixed' ? (c.defaultValue ?? 0) / 100 : (c.defaultValue ?? 0)) }])
                }}
                className="w-64"
              />
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-fg-3">
              <Plus className="size-3" /> Percentages of basic use the BASIC line.
            </span>
          </div>
          <FormField name="notes" label="Notes">
            <Textarea id="notes" name="notes" rows={2} placeholder="Annual revision, October 2026" />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Saving…">Save structure</SubmitButton>
          </div>
        </>
      ) : null}
    </ActionForm>
  )
}
