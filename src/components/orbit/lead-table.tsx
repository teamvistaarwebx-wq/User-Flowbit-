'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Repeat2, Building2, CalendarClock, Clock, Download, IndianRupee, Layers, ShoppingBag, UserRound, UserRoundCog, Waypoints } from 'lucide-react'
import { buildHref, type SearchParams } from '@/lib/list'
import { formatINRCompact } from '@/lib/money'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { bulkAssignLeads, bulkDisqualifyLeads } from '@/modules/orbit/leads.actions'
import type { LeadCardData, Option } from '@/modules/orbit/record-types'
import { KeyLabel } from './icons'
import { EnrollDialog } from './sequence-enroll'
import { LeadStageBadge } from './stage-badge'
import { Td, Th, dueTone } from './parts'
import { dayDiff, dueLabel } from './time'

const BASE = '/app/orbit/leads'

function SortHeader({ label, sortKey, params }: { label: string; sortKey: string; params: SearchParams }) {
  const active = params.sort === sortKey
  const dir = active && params.dir === 'asc' ? 'desc' : 'asc'
  return (
    <Link href={buildHref(BASE, params, { sort: sortKey, dir, page: undefined })} className={cn('inline-flex items-center gap-1 transition-colors hover:text-white', active ? 'text-white' : 'text-white/90')}>
      {label}
      {active ? params.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 text-[#797779]" />}
    </Link>
  )
}

export function NextStepCell({ title, due, today }: { title: string | null; due: string | null; today: string }) {
  if (!due) return <span className="text-[13px] text-[#979797]">No next step</span>
  const late = dayDiff(due, today)
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-white">{title || 'Follow up'}</p>
      <span className={cn('text-xs', dueTone(late))}>{late > 0 ? `Overdue ${late}d` : late === 0 ? 'Today' : dueLabel(due)}</span>
    </div>
  )
}

export function TouchCell({ days, stale }: { days: number; stale: boolean }) {
  if (stale) return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[#FF2D31]" title="Nothing has happened on this for a while"><Clock className="size-3" />Stale {days}d</span>
  return <span className="whitespace-nowrap text-xs text-[#979797]">{days <= 0 ? 'Today' : `${days}d ago`}</span>
}

function BulkBar({ ids, owners, reviewers, reasons, sequences, canClose, onClear }: { ids: string[]; owners: Option[]; reviewers: Option[]; reasons: Option[]; sequences: Option[]; canClose: boolean; onClear: () => void }) {
  const [assignOpen, setAssignOpen] = useState(false)
  const [dqOpen, setDqOpen] = useState(false)
  const hidden = ids.map((id) => <input key={id} type="hidden" name="ids[]" value={id} />)
  return (
    <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-full border border-white/[0.12] bg-menu/95 py-1.5 pl-5 pr-2 backdrop-blur-xl animate-slide-up">
      <span className="text-sm text-white"><span className="font-semibold tabular-nums">{ids.length}</span> selected</span>
      <span className="flex-1" />
      {canClose ? (
        <Dialog open={assignOpen} onOpenChange={setAssignOpen} title={`Reassign ${ids.length} leads`} size="sm" trigger={<Button size="sm" variant="secondary" icon={<UserRoundCog className="size-4" />}>Assign</Button>}>
          <ActionForm action={bulkAssignLeads} className="space-y-4" onDone={() => { setAssignOpen(false); onClear() }}>
            {hidden}
            <FormField name="ownerId" label="Owner"><Select id="bulk-owner" name="ownerId" options={owners} placeholder="Keep current" /></FormField>
            <FormField name="reviewerId" label="Reviewer"><Select id="bulk-reviewer" name="reviewerId" options={reviewers} placeholder="Keep current" /></FormField>
            <div className="flex justify-end"><SubmitButton>Reassign</SubmitButton></div>
          </ActionForm>
        </Dialog>
      ) : null}
      <EnrollDialog ids={ids} options={sequences} onDone={onClear} trigger={<Button size="sm" variant="secondary" icon={<Repeat2 className="size-4" />}>Enroll in sequence</Button>} />
      <Dialog open={dqOpen} onOpenChange={setDqOpen} title={`Disqualify ${ids.length} leads?`} description="Closed leads and leads that aren't yours are skipped." size="sm" trigger={<Button size="sm" variant="secondary" icon={<Ban className="size-4" />}>Disqualify</Button>}>
        <ActionForm action={bulkDisqualifyLeads} className="space-y-4" onDone={() => { setDqOpen(false); onClear() }}>
          {hidden}
          <FormField name="reasonCode" label="Reason" required><Select id="bulk-reason" name="reasonCode" options={reasons} placeholder="Pick the closest reason" /></FormField>
          <FormField name="reasonNote" label="Detail" help="Required for 'Other'"><Textarea id="bulk-note" name="reasonNote" rows={2} maxLength={300} /></FormField>
          <div className="flex justify-end"><SubmitButton variant="danger">Disqualify</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <Button size="sm" variant="ghost" icon={<Download className="size-4" />} href={`/api/orbit/leads/export?ids=${ids.join(',')}`}>Export</Button>
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  )
}

export type LeadTableProps = { rows: LeadCardData[]; params: SearchParams; today: string; owners: Option[]; reviewers: Option[]; reasons: Option[]; sequences?: Option[]; canWrite: boolean; canClose: boolean }

/** Leads table with selection and bulk actions. */
export function LeadTable({ rows, params, today, owners, reviewers, reasons, sequences = [], canWrite, canClose }: LeadTableProps) {
  const [picked, setSelected] = useState<string[]>([])
  // The table stays mounted across pages, filters and sorts, so only ticked rows still on screen count.
  const selected = picked.filter((id) => rows.some((r) => r.id === id))
  const all = rows.length > 0 && rows.every((r) => selected.includes(r.id))
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <>
      {selected.length && canWrite ? <BulkBar ids={selected} owners={owners} reviewers={reviewers} reasons={reasons} sequences={sequences} canClose={canClose} onClear={() => setSelected([])} /> : null}
      <div className="card-table overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="h-[33px] w-[52px] pl-[23px] pr-1 text-left">
                  {canWrite ? <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSelected(all ? [] : rows.map((r) => r.id))} className="size-4 accent-[#56397D]" /> : null}
                </th>
                <Th icon={<Building2 strokeWidth={1.5} />} className="!pl-3"><SortHeader label="Company" sortKey="company" params={params} /></Th>
                <Th icon={<ShoppingBag strokeWidth={1.5} />}>Sector</Th>
                <Th icon={<Waypoints strokeWidth={1.5} />}>Source</Th>
                <Th icon={<Layers strokeWidth={1.5} />}>Stage</Th>
                <Th icon={<UserRound strokeWidth={1.5} />}>Owner</Th>
                <Th icon={<CalendarClock strokeWidth={1.5} />}><SortHeader label="Next step" sortKey="due" params={params} /></Th>
                <Th icon={<Clock strokeWidth={1.5} />}><SortHeader label="Last touch" sortKey="touch" params={params} /></Th>
                <Th icon={<IndianRupee strokeWidth={1.5} />} align="right"><SortHeader label="Value" sortKey="value" params={params} /></Th>
              </tr>
            </thead>
            <tbody>
              <tr aria-hidden className="h-1.5" />
              {rows.map((r) => {
                const isSelected = selected.includes(r.id)
                return (
                  <tr key={r.id} className={cn('h-12 transition-colors', isSelected ? 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]' : 'hover:bg-white/[0.04]')}>
                    <td className="pl-[23px] pr-1">{canWrite ? <input type="checkbox" aria-label={`Select ${r.companyName}`} checked={isSelected} onChange={() => toggle(r.id)} className="size-4 accent-[#56397D]" /> : null}</td>
                    <Td className="!pl-3">
                      <div className="max-w-52">
                        <Link href={`${BASE}/${r.id}`} className="block truncate text-sm text-white transition-colors hover:text-blush" title={r.companyName}>{r.companyName}</Link>
                        {r.contactName ? <p className="truncate text-xs text-[#979797]">{r.contactName}{r.designation ? ` · ${r.designation}` : ''}</p> : null}
                      </div>
                    </Td>
                    <Td><KeyLabel kind="sector" value={r.sector} label={r.sectorLabel} className="whitespace-nowrap" /></Td>
                    <Td><KeyLabel kind="source" value={r.source} label={r.sourceLabel} className="whitespace-nowrap" /></Td>
                    <Td><LeadStageBadge stage={r.stage} /></Td>
                    <Td><span className="inline-flex items-center gap-2 whitespace-nowrap text-white"><Avatar name={r.ownerName} size="xs" />{r.ownerName}</span></Td>
                    <Td className="max-w-44"><NextStepCell title={r.nextTitle} due={r.nextDue} today={today} /></Td>
                    <Td><TouchCell days={r.daysSinceTouch} stale={r.stale} /></Td>
                    <Td align="right" className="tabular-nums">{r.valuePaise ? formatINRCompact(r.valuePaise) : <span className="text-[#979797]">—</span>}</Td>
                  </tr>
                )
              })}
              <tr aria-hidden className="h-2" />
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
