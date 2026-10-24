'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { STATE_OPTIONS } from '@/lib/india-states'
import type { StatutorySettings } from '@/modules/muster/payroll/statutory'
import { addStatutoryVersion } from '@/modules/muster/payroll/settings-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/card'
import { DateInput, Input, NativeSelect } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const num = (v: string) => (v.trim() === '' ? 0 : Number(v))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Proposes a new set of statutory rates, prefilled from the latest version. Saved unconfirmed. */
export function StatutoryForm({ base, today, onDone }: { base: StatutorySettings; today: string; onDone?: () => void }) {
  const [s, setS] = useState<StatutorySettings>(base)
  const set = <K extends keyof StatutorySettings>(key: K, value: StatutorySettings[K]) => setS((cur) => ({ ...cur, [key]: value }))
  const setPt = (i: number, patch: Partial<StatutorySettings['pt'][number]>) => set('pt', s.pt.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const setLwf = (i: number, patch: Partial<StatutorySettings['lwf'][number]>) => set('lwf', s.lwf.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <ActionForm action={addStatutoryVersion} onDone={onDone} className="space-y-5">
      <input type="hidden" name="settings" value={JSON.stringify(s)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField name="effectiveFrom" label="Took effect on" required help="The legal date; it may fall mid-month">
          <DateInput id="effectiveFrom" name="effectiveFrom" defaultValue={today} />
        </FormField>
        <FormField name="payrollFrom" label="Payroll applies from" required help="The 1st of a month">
          <DateInput id="payrollFrom" name="payrollFrom" defaultValue={`${today.slice(0, 7)}-01`} />
        </FormField>
        <FormField name="note" label="Note">
          <Input id="note" name="note" placeholder="EPF wage ceiling revised" />
        </FormField>
      </div>

      <section className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Provident Fund</SectionLabel>
          <Switch checked={s.pf.enabled} onCheckedChange={(v) => set('pf', { ...s.pf, enabled: v })} label="On" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Employee %"><Input inputMode="decimal" value={String(s.pf.employeeRatePercent)} onChange={(e) => set('pf', { ...s.pf, employeeRatePercent: num(e.target.value) })} /></FormField>
          <FormField label="Employer %"><Input inputMode="decimal" value={String(s.pf.employerRatePercent)} onChange={(e) => set('pf', { ...s.pf, employerRatePercent: num(e.target.value) })} /></FormField>
          <FormField label="Wage ceiling (₹)"><Input inputMode="decimal" value={String(s.pf.wageCeiling)} onChange={(e) => set('pf', { ...s.pf, wageCeiling: num(e.target.value) })} /></FormField>
        </div>
        <div className="flex flex-wrap gap-6">
          <Switch checked={s.pf.applyCeiling} onCheckedChange={(v) => set('pf', { ...s.pf, applyCeiling: v })} label="Cap PF at the ceiling" />
          <Switch checked={s.pf.prorateCeiling} onCheckedChange={(v) => set('pf', { ...s.pf, prorateCeiling: v })} label="Reduce the ceiling in LOP months" />
        </div>
      </section>

      <section className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>ESI</SectionLabel>
          <Switch checked={s.esi.enabled} onCheckedChange={(v) => set('esi', { ...s.esi, enabled: v })} label="On" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Employee %"><Input inputMode="decimal" value={String(s.esi.employeeRatePercent)} onChange={(e) => set('esi', { ...s.esi, employeeRatePercent: num(e.target.value) })} /></FormField>
          <FormField label="Employer %"><Input inputMode="decimal" value={String(s.esi.employerRatePercent)} onChange={(e) => set('esi', { ...s.esi, employerRatePercent: num(e.target.value) })} /></FormField>
          <FormField label="Covers gross up to (₹)"><Input inputMode="decimal" value={String(s.esi.grossEligibilityLimit)} onChange={(e) => set('esi', { ...s.esi, grossEligibilityLimit: num(e.target.value) })} /></FormField>
        </div>
        <Switch checked={s.tds.enabled} onCheckedChange={(v) => set('tds', { ...s.tds, enabled: v })} label="Deduct salary TDS" />
        <Switch
          checked={s.tds.mode === 'auto'}
          disabled={!s.tds.enabled}
          onCheckedChange={(v) => set('tds', { ...s.tds, mode: v ? 'auto' : 'manual' })}
          label="Compute TDS each month from the tax worksheet (off: add it by hand as an adjustment)"
        />
      </section>

      <section className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Professional tax by state</SectionLabel>
          <Button type="button" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => set('pt', [...s.pt, { state: 'MH', enabled: true, slabs: [{ upTo: null, amount: 200 }], monthOverrides: [] }])}>
            Add state
          </Button>
        </div>
        {s.pt.map((p, i) => (
          <div key={i} className="space-y-2 lit-edge rounded-[10px] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <NativeSelect aria-label="State" options={STATE_OPTIONS} value={p.state} onChange={(e) => setPt(i, { state: e.target.value })} className="w-56" />
              <Switch checked={p.enabled} onCheckedChange={(v) => setPt(i, { enabled: v })} label="Levied" />
              <IconButton type="button" label="Remove state" size="sm" onClick={() => set('pt', s.pt.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></IconButton>
            </div>
            {p.slabs.map((slab, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                <span className="w-24">Gross up to</span>
                <Input inputSize="sm" inputMode="decimal" className="w-32" placeholder="and above" value={slab.upTo === null ? '' : String(slab.upTo)} onChange={(e) => setPt(i, { slabs: p.slabs.map((x, m) => (m === k ? { ...x, upTo: e.target.value.trim() === '' ? null : num(e.target.value) } : x)) })} />
                <span>pays ₹</span>
                <Input inputSize="sm" inputMode="decimal" className="w-24" value={String(slab.amount)} onChange={(e) => setPt(i, { slabs: p.slabs.map((x, m) => (m === k ? { ...x, amount: num(e.target.value) } : x)) })} />
                <IconButton type="button" label="Remove slab" size="sm" onClick={() => setPt(i, { slabs: p.slabs.filter((_, m) => m !== k) })}><Trash2 className="size-3.5" /></IconButton>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setPt(i, { slabs: [...p.slabs, { upTo: null, amount: 0 }] })}>Slab</Button>
              <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setPt(i, { monthOverrides: [...p.monthOverrides, { month: 2, amount: 212 }] })}>Month with a different amount</Button>
            </div>
            {p.monthOverrides.map((o, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                <span className="w-24">In</span>
                <NativeSelect aria-label="Month" className="h-8 w-28 text-xs" options={MONTHS.map((m, idx) => ({ value: String(idx + 1), label: m }))} value={String(o.month)} onChange={(e) => setPt(i, { monthOverrides: p.monthOverrides.map((x, m) => (m === k ? { ...x, month: Number(e.target.value) } : x)) })} />
                <span>the top slab pays ₹</span>
                <Input inputSize="sm" inputMode="decimal" className="w-24" value={String(o.amount)} onChange={(e) => setPt(i, { monthOverrides: p.monthOverrides.map((x, m) => (m === k ? { ...x, amount: num(e.target.value) } : x)) })} />
                <IconButton type="button" label="Remove month" size="sm" onClick={() => setPt(i, { monthOverrides: p.monthOverrides.filter((_, m) => m !== k) })}><Trash2 className="size-3.5" /></IconButton>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Labour welfare fund by state</SectionLabel>
          <Button type="button" size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => set('lwf', [...s.lwf, { state: 'MH', enabled: false, employeeAmount: 12, employerAmount: 36, remittanceMonths: [6, 12] }])}>
            Add state
          </Button>
        </div>
        {s.lwf.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 lit-edge rounded-[10px] bg-white/[0.02] p-3 text-sm text-fg-2">
            <NativeSelect aria-label="State" options={STATE_OPTIONS} value={l.state} onChange={(e) => setLwf(i, { state: e.target.value })} className="w-56" />
            <Switch checked={l.enabled} onCheckedChange={(v) => setLwf(i, { enabled: v })} label="Deducted" />
            <span>Employee ₹</span>
            <Input inputSize="sm" inputMode="decimal" className="w-20" value={String(l.employeeAmount)} onChange={(e) => setLwf(i, { employeeAmount: num(e.target.value) })} />
            <span>Employer ₹</span>
            <Input inputSize="sm" inputMode="decimal" className="w-20" value={String(l.employerAmount)} onChange={(e) => setLwf(i, { employerAmount: num(e.target.value) })} />
            <span>Months</span>
            <Input inputSize="sm" className="w-24" value={l.remittanceMonths.join(',')} onChange={(e) => setLwf(i, { remittanceMonths: e.target.value.split(',').map((m) => Number(m.trim())).filter((m) => m >= 1 && m <= 12) })} />
            <IconButton type="button" label="Remove state" size="sm" onClick={() => set('lwf', s.lwf.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></IconButton>
          </div>
        ))}
      </section>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save as proposal</SubmitButton>
      </div>
    </ActionForm>
  )
}
