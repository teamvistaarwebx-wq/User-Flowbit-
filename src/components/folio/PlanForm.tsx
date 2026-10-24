'use client'

import { useState } from 'react'
import { Layers, Lock, Plus, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatINR } from '@/lib/money'
import { savePlan } from '@/modules/folio/recurring/actions'
import { allocatedOf } from '@/modules/folio/recurring/plan-math'
import { PLAN_STATUSES } from '@/modules/folio/types'
import { INSET } from './ui'

export type PhaseValues = { key: string; id: string; name: string; description: string; mode: 'percent' | 'amount'; percent: string; amount: string; dueOn: string; locked: boolean }

export type PlanValues = {
  id?: string
  clientId: string
  entityId: string
  workProjectId: string
  name: string
  description: string
  hsnSac: string
  totalValue: string
  gstRatePercent: string
  startDate: string
  targetEndDate: string
  status: string
  notes: string
  milestones: PhaseValues[]
}

type Option = { value: string; label: string }

const blankPhase = (): PhaseValues => ({ key: Math.random().toString(36).slice(2), id: '', name: '', description: '', mode: 'percent', percent: '', amount: '', dueOn: '', locked: false })

/** Create or edit a billing plan with its phases (share of value or flat amount). */
export function PlanForm({ values, clients, entities, projects, taxRates }: { values: PlanValues; clients: Option[]; entities: (Option & { kind: string })[]; projects: Option[]; taxRates: number[] }) {
  const [entityId, setEntityId] = useState(values.entityId)
  const [total, setTotal] = useState(values.totalValue)
  const [phases, setPhases] = useState<PhaseValues[]>(values.milestones.length ? values.milestones : [blankPhase()])
  const isTax = entities.find((e) => e.value === entityId)?.kind === 'gst'
  const totalPaise = Math.round((Number(total) || 0) * 100)
  const sum = allocatedOf(totalPaise, phases.map((p, i) => ({ position: i + 1, name: p.name, percentOfTotal: p.mode === 'percent' ? Number(p.percent) || 0 : null, amountPaise: p.mode === 'amount' ? Math.round((Number(p.amount) || 0) * 100) : null })))
  const update = (i: number, patch: Partial<PhaseValues>) => setPhases((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <ActionForm action={savePlan} className="space-y-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Card variant="solid">
        <CardHeader label="The engagement" icon={<Layers />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="clientId" label="Client" required>
            <NativeSelect id="clientId" name="clientId" defaultValue={values.clientId} placeholder="Choose a client" options={clients} />
          </FormField>
          <FormField name="entityId" label="Billing from" required>
            <NativeSelect id="entityId" name="entityId" value={entityId} onChange={(e) => setEntityId(e.target.value)} options={entities} />
          </FormField>
          <FormField name="name" label="Plan name" required className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={values.name} placeholder="Shopify replatform" maxLength={160} />
          </FormField>
          <FormField name="description" label="Description" className="sm:col-span-2">
            <Textarea id="description" name="description" rows={2} defaultValue={values.description} maxLength={1000} />
          </FormField>
          <FormField name="totalValue" label="Agreed value before tax (₹)" required>
            <Input id="totalValue" name="totalValue" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          </FormField>
          {isTax ? (
            <FormField name="gstRatePercent" label="GST %">
              <NativeSelect id="gstRatePercent" name="gstRatePercent" defaultValue={values.gstRatePercent} options={taxRates.map((r) => ({ value: String(r), label: `${r}%` }))} />
            </FormField>
          ) : (
            <input type="hidden" name="gstRatePercent" value="0" />
          )}
          <FormField name="hsnSac" label="SAC">
            <Input id="hsnSac" name="hsnSac" defaultValue={values.hsnSac} inputMode="numeric" maxLength={8} placeholder="998314" />
          </FormField>
          <FormField name="status" label="Status">
            <NativeSelect id="status" name="status" defaultValue={values.status} options={PLAN_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) }))} />
          </FormField>
          <FormField name="startDate" label="Start">
            <DateInput id="startDate" name="startDate" defaultValue={values.startDate} />
          </FormField>
          <FormField name="targetEndDate" label="Target end">
            <DateInput id="targetEndDate" name="targetEndDate" defaultValue={values.targetEndDate} />
          </FormField>
          {projects.length ? (
            <FormField name="workProjectId" label="Work project" help="Optional link to the delivery project" className="sm:col-span-2">
              <NativeSelect id="workProjectId" name="workProjectId" defaultValue={values.workProjectId} placeholder="Not linked" options={projects} />
            </FormField>
          ) : null}
        </div>
      </Card>

      <Card variant="solid">
        <CardHeader label="Phases" icon={<Layers />} description={`${sum.percent}% / ${formatINR(sum.amountPaise, { decimals: 0 })} of ${formatINR(totalPaise, { decimals: 0 })} allocated`} actions={<Button type="button" size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setPhases((ps) => [...ps, blankPhase()])}>Add phase</Button>} />
        {totalPaise > 0 ? <Progress className="mb-4" value={Math.min(100, Math.round((sum.amountPaise / totalPaise) * 100))} tone={sum.amountPaise > totalPaise ? 'danger' : undefined} /> : null}
        <div className="space-y-3">
          {phases.map((p, i) => {
            const n = (f: string) => `milestones.${i}.${f}`
            return (
              <div key={p.key} className={`${INSET} p-3.5`}>
                {p.id ? <input type="hidden" name={n('id')} value={p.id} /> : null}
                <input type="hidden" name={n('mode')} value={p.mode} />
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-12 flex items-center gap-2 text-xs tabular-nums text-fg-2 sm:col-span-1 sm:pt-7">#{i + 1}{p.locked ? <Lock className="size-3.5 text-warning" /> : null}</span>
                  <FormField name={n('name')} label="Phase" className="col-span-12 sm:col-span-4"><Input name={n('name')} value={p.name} onChange={(e) => update(i, { name: e.target.value })} /></FormField>
                  <FormField name={n('mode')} label="Billed as" className="col-span-6 sm:col-span-2">
                    <NativeSelect value={p.mode} disabled={p.locked} onChange={(e) => update(i, { mode: e.target.value as PhaseValues['mode'] })} options={[{ value: 'percent', label: '% of value' }, { value: 'amount', label: 'Flat ₹' }]} />
                  </FormField>
                  {p.mode === 'percent' ? (
                    <FormField name={n('percent')} label="Share %" className="col-span-6 sm:col-span-2"><Input name={n('percent')} type="number" step="0.01" min="0" max="100" value={p.percent} readOnly={p.locked} onChange={(e) => update(i, { percent: e.target.value })} /></FormField>
                  ) : (
                    <FormField name={n('amount')} label="Amount ₹" className="col-span-6 sm:col-span-2"><Input name={n('amount')} inputMode="decimal" value={p.amount} readOnly={p.locked} onChange={(e) => update(i, { amount: e.target.value })} /></FormField>
                  )}
                  <FormField name={n('dueOn')} label="Due" className="col-span-10 sm:col-span-2"><DateInput name={n('dueOn')} value={p.dueOn} onChange={(e) => update(i, { dueOn: e.target.value })} /></FormField>
                  <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                    <IconButton label={p.locked ? 'This phase is already invoiced' : 'Remove phase'} size="sm" disabled={p.locked} onClick={() => setPhases((ps) => ps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></IconButton>
                  </div>
                  <FormField name={n('description')} className="col-span-12"><Input name={n('description')} value={p.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="What this phase delivers (optional)" /></FormField>
                </div>
              </div>
            )
          })}
        </div>
        {sum.percent > 100 || sum.amountPaise > totalPaise ? <p className="mt-3 text-xs text-[#FF6A66]">The phases add up to more than the plan value.</p> : sum.amountPaise !== totalPaise && totalPaise > 0 ? <p className="mt-3 text-xs text-warning">{formatINR(totalPaise - sum.amountPaise, { decimals: 0 })} of the value is not in any phase yet.</p> : null}
      </Card>

      <Card variant="solid">
        <FormField name="notes" label="Internal notes"><Textarea id="notes" name="notes" rows={2} defaultValue={values.notes} maxLength={2000} /></FormField>
        <div className="mt-4 flex justify-end"><SubmitButton>{values.id ? 'Save plan' : 'Create plan'}</SubmitButton></div>
      </Card>
    </ActionForm>
  )
}
