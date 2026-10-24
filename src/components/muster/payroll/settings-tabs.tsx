import { Landmark, Layers } from 'lucide-react'
import type { Ctx } from '@/lib/ctx'
import { formatDate, formatDateTime, todayIST } from '@/lib/dates'
import { stateLabel } from '@/lib/india-states'
import { formatINR } from '@/lib/money'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { CALCULATION_LABELS, COMPONENT_TYPE_LABELS, isProtectedCode } from '@/modules/muster/payroll/components'
import { statutoryVersions } from '@/modules/muster/payroll/queries'
import { blockingSections, DEFAULT_STATUTORY, EPF_WAGE_CEILING, outdatedPfCeiling, readStatutory } from '@/modules/muster/payroll/statutory'
import { LIST_FLUSH, ListCard } from '../ui/list-card'
import { Callout } from './callout'

const RATE_LABEL = 'text-[13px] font-semibold uppercase tracking-[0.04em] text-white'
import { ComponentActiveToggle, ComponentDialog, LoadStandardComponents } from './component-controls'
import { AddStatutoryVersion, ConfirmVersion, SetPayrollMonth } from './statutory-controls'

/** What a component counts towards, as plain words (a column of pills shouts). */
const countsFor = (c: { countsForPf?: boolean | null; countsForEsi?: boolean | null; countsForWages?: boolean | null; prorateOnLop?: boolean | null }) =>
  [c.countsForPf && 'PF', c.countsForEsi && 'ESI', c.countsForWages && 'Wages', c.prorateOnLop && 'LOP'].filter(Boolean).join(' · ') || '—'

export async function ComponentsTab({ ctx }: { ctx: Ctx }) {
  const rows = await ctx.db(SalaryComponent).find({}).sort({ isActive: -1, displayOrder: 1 }).lean()
  const canEdit = ctx.can('hr.settings')
  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    { key: 'code', header: 'Code', cell: (c) => <span className="font-mono text-xs text-fg-2">{c.code}</span> },
    { key: 'name', header: 'Name', cell: (c) => <span className="text-white">{c.name}</span> },
    { key: 'type', header: 'Type', cell: (c) => COMPONENT_TYPE_LABELS[c.componentType] },
    { key: 'basis', header: 'Basis', hideOnMobile: true, cell: (c) => `${CALCULATION_LABELS[c.calculationType]}${c.calculationType.startsWith('percent') ? ` · ${c.defaultValue}%` : c.calculationType === 'fixed' && c.defaultValue ? ` · ${formatINR(c.defaultValue, { decimals: 0 })}` : ''}` },
    { key: 'flags', header: 'Counts for', hideOnMobile: true, cell: (c) => <span className="text-[#979797]">{countsFor(c)}</span> },
    { key: 'status', header: 'Status', cell: (c) => <StatusPill status={c.isActive ? 'active' : 'inactive'} label={c.isActive ? (isProtectedCode(c.code) || c.isSystem ? 'System' : 'In use') : 'Retired'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) =>
        canEdit ? (
          <span className="inline-flex gap-1">
            <ComponentDialog component={{ id: String(c._id), code: c.code, name: c.name, componentType: c.componentType, calculationType: c.calculationType, defaultValue: String(c.calculationType === 'fixed' ? c.defaultValue / 100 : c.defaultValue), countsForPf: c.countsForPf, countsForEsi: c.countsForEsi, countsForWages: c.countsForWages, prorateOnLop: c.prorateOnLop, isTaxable: c.isTaxable, isRecurring: c.isRecurring, displayOrder: c.displayOrder, locked: isProtectedCode(c.code) || c.isSystem }} />
            <ComponentActiveToggle id={String(c._id)} name={c.name} active={c.isActive} locked={isProtectedCode(c.code) || c.isSystem} />
          </span>
        ) : null,
    },
  ]
  return (
    <ListCard
      label="Components"
      icon={<Layers />}
      description="The parts pay is split into, and what each counts towards"
      actions={
        canEdit ? (
          <>
            <LoadStandardComponents />
            <ComponentDialog />
          </>
        ) : null
      }
    >
      <DataTable className={LIST_FLUSH} columns={columns} rows={rows} rowKey={(c) => String(c._id)} empty={<EmptyState compact icon={<Layers />} title="No salary components yet" description="Load the standard set: Basic, HRA, Special allowance, PF, ESI, PT and the rest." action={canEdit ? <LoadStandardComponents /> : undefined} />} />
    </ListCard>
  )
}

/** A PF or ESI section that could not be read: said plainly, never shown as the standard rates it fell back to. */
const Unreadable = () => (
  <>
    <p className="mt-1 text-danger">Could not be read</p>
    <p className="text-xs text-fg-2">Payroll is blocked for months that use these rates.</p>
  </>
)

export async function StatutoryTab({ ctx }: { ctx: Ctx }) {
  const versions = await statutoryVersions(ctx)
  const latest = versions[0] ? readStatutory(versions[0].settings) : { settings: DEFAULT_STATUTORY, unreadable: [] }
  const canEdit = ctx.can('hr.settings')
  const proposals = versions.filter((v) => !v.confirmedAt).length
  const today = todayIST()
  const staleCeiling = outdatedPfCeiling(latest.settings, today)
  const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
  return (
    <div className="space-y-3">
      {staleCeiling !== null ? (
        <Callout tone="warning" title={`The EPF wage ceiling is now ${rupees(EPF_WAGE_CEILING.rupees)}`}>
          It took effect on {formatDate(EPF_WAGE_CEILING.effectiveFrom)} ({EPF_WAGE_CEILING.notification}). Your latest rates still cap PF at {rupees(staleCeiling)}, and payroll keeps using them until rates with the new ceiling are confirmed. Add a version with a {rupees(EPF_WAGE_CEILING.rupees)} ceiling and agree the payroll month with your CA.
        </Callout>
      ) : null}
      {proposals ?<Callout tone="warning" title={`${proposals} set${proposals === 1 ? '' : 's'} of rates awaiting confirmation`}>Payroll for a month covered by unconfirmed rates is blocked until they are confirmed.</Callout> : null}
      {!versions.length ? <Callout tone="danger" title="Payroll is blocked">No statutory rates are recorded yet. Add the first version.</Callout> : null}
      {canEdit ? (
        <div className="flex justify-end">
          <AddStatutoryVersion base={latest.settings} fromVersion={versions.length > 0} unreadable={blockingSections(latest.unreadable)} today={today} />
        </div>
      ) : null}
      {versions.map((v) => {
        const { settings: s, unreadable } = readStatutory(v.settings)
        return (
          <Card key={String(v._id)} className={v.confirmedAt ? undefined : 'lit-edge-bright'}>
            <CardHeader
              label={`Effective ${formatDate(v.effectiveFrom)}`}
              icon={<Landmark />}
              title={`Payroll from ${formatDate(v.payrollFrom)}`}
              description={v.note ?? undefined}
              actions={
                v.confirmedAt ? (
                  <Badge tone="success" className="h-auto min-h-6 whitespace-normal py-1 leading-snug">Confirmed{v.confirmedByName ? ` by ${v.confirmedByName}` : ''} · {formatDateTime(v.confirmedAt)}</Badge>
                ) : (
                  <>
                    <Badge tone="warning">Proposal</Badge>
                    {canEdit ? <SetPayrollMonth id={String(v._id)} current={v.payrollFrom} /> : null}
                    {canEdit ? <ConfirmVersion id={String(v._id)} label={formatDate(v.effectiveFrom)} /> : null}
                  </>
                )
              }
            />
            <div className="grid gap-x-5 gap-y-4 border-t border-white/[0.12] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4 lg:[&>*+*]:border-l lg:[&>*+*]:border-white/[0.12] lg:[&>*+*]:pl-5">
              <div>
                <p className={RATE_LABEL}>PF</p>
                {unreadable.includes('pf') ? (
                  <Unreadable />
                ) : (
                  <>
                    <p className="mt-1 text-white">{s.pf.enabled ? `${s.pf.employeeRatePercent}% + ${s.pf.employerRatePercent}%` : 'Off'}</p>
                    <p className="text-xs text-fg-2">{s.pf.applyCeiling ? `Ceiling ₹${s.pf.wageCeiling.toLocaleString('en-IN')}${s.pf.prorateCeiling ? ', prorated' : ''}` : 'No ceiling'}</p>
                  </>
                )}
              </div>
              <div>
                <p className={RATE_LABEL}>ESI</p>
                {unreadable.includes('esi') ? (
                  <Unreadable />
                ) : (
                  <>
                    <p className="mt-1 text-white">{s.esi.enabled ? `${s.esi.employeeRatePercent}% + ${s.esi.employerRatePercent}%` : 'Off'}</p>
                    <p className="text-xs text-fg-2">Gross up to ₹{s.esi.grossEligibilityLimit.toLocaleString('en-IN')}</p>
                  </>
                )}
              </div>
              <div>
                <p className={RATE_LABEL}>Professional tax</p>
                {s.pt.length ? s.pt.map((p) => <p key={p.state} className="mt-1 text-xs text-white/80">{stateLabel(p.state)}: {p.enabled ? p.slabs.map((sl) => `${sl.upTo === null ? 'above' : `≤₹${sl.upTo.toLocaleString('en-IN')}`} ₹${sl.amount}`).join(', ') : 'off'}{p.monthOverrides.length ? ` · ${p.monthOverrides.map((o) => `month ${o.month}: ₹${o.amount}`).join(', ')}` : ''}</p>) : <p className="mt-1 text-xs text-fg-2">No states</p>}
              </div>
              <div>
                <p className={RATE_LABEL}>LWF</p>
                {s.lwf.length ? s.lwf.map((l) => <p key={l.state} className="mt-1 text-xs text-white/80">{stateLabel(l.state)}: {l.enabled ? `₹${l.employeeAmount} + ₹${l.employerAmount} in months ${l.remittanceMonths.join(', ')}` : 'off'}</p>) : <p className="mt-1 text-xs text-fg-2">No states</p>}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
