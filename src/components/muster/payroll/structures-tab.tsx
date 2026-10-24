import Link from 'next/link'
import { History, Search, UserRound } from 'lucide-react'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { addDays, formatDate, todayIST } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { cn, escapeRegex } from '@/lib/utils'
import { TONE_TEXT } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchInput } from '@/components/ui/search-input'
import { Employee } from '@/models/muster/Employee'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { PAYROLL_STATUSES, statusLabelOf } from '@/modules/muster/people/lifecycle'
import { currentStructures } from '@/modules/muster/payroll/queries'
import { defaultLines } from '@/modules/muster/payroll/structure-lines'
import { ListCard, ListRow, ListRows } from '../ui/list-card'
import { StructureEditor, type EditorLine } from './structure-editor'

const BASE = '/app/hr/payroll/structures'

/** People on payroll with their current structure; `?employee=` opens the editor and history. */
export async function StructuresTab({ ctx, sp, employeeId, q }: { ctx: Ctx; sp: SearchParams; employeeId?: string; q?: string }) {
  const people = await ctx.db(Employee).find({ deletedAt: null, status: { $in: PAYROLL_STATUSES }, ...(q ? { $or: [{ fullName: new RegExp(escapeRegex(q), 'i') }, { code: new RegExp(escapeRegex(q), 'i') }] } : {}) }, { fullName: 1, code: 1, designation: 1, status: 1 }).sort({ fullName: 1 }).lean()
  const current = await currentStructures(ctx, people.map((p) => p._id))
  const selected = employeeId && isValidObjectId(employeeId) ? await ctx.db(Employee).findById(employeeId, { fullName: 1, code: 1, joinDate: 1 }).lean() : null

  return (
    <div className="grid grid-cols-12 gap-4">
      <ListCard className="col-span-12 self-start lg:col-span-5" label="Employee structures" icon={<UserRound />} description={`${people.length} on payroll`} actions={<SearchInput placeholder="Search people" className="w-full sm:w-52" />}>
        {people.length ? (
          <ul className="scroll-fade-y max-h-[640px] overflow-y-auto py-1.5">
            {people.map((p) => {
              const s = current.get(String(p._id))
              const active = String(p._id) === employeeId
              return (
                <li key={String(p._id)}>
                  <Link href={buildHref(BASE, sp, { employee: String(p._id) })} scroll={false} aria-current={active ? 'true' : undefined} className={cn('flex items-center justify-between gap-3 px-5 py-2.5 transition-colors duration-150 hover:bg-white/[0.04] sm:px-[23px]', active && 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]')}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{p.fullName}</span>
                      <span className="block text-xs text-fg-2">{p.code} · {p.designation ?? statusLabelOf(p.status)}</span>
                    </span>
                    {s ? (
                      <span className="text-right">
                        <span className="block text-sm tabular-nums text-white">{formatINR(s.monthlyGross, { decimals: 0 })}</span>
                        <span className="block text-xs text-[#979797]">from {formatDate(s.effectiveFrom, { short: true })}</span>
                      </span>
                    ) : (
                      <span className={cn('text-[13px]', TONE_TEXT.danger)}>No structure</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState compact icon={<Search />} title={q ? `Nobody matches "${q}"` : 'Nobody is on payroll yet'} description={q ? undefined : 'Add people in HR → People first.'} />
        )}
      </ListCard>
      <div className="col-span-12 lg:col-span-7">{selected ? <EditorPanel ctx={ctx} employee={selected} /> : <Card variant="solid"><EmptyState icon={<UserRound />} title="Pick someone to set their salary" description="Their structure is split into components; the preview shows exactly what payroll will compute." /></Card>}</div>
    </div>
  )
}

async function EditorPanel({ ctx, employee }: { ctx: Ctx; employee: { _id: unknown; fullName: string; code: string; joinDate: string } }) {
  const [components, history] = await Promise.all([
    ctx.db(SalaryComponent).find({ isActive: true, componentType: 'earning' }).sort({ displayOrder: 1 }).lean(),
    ctx.db(SalaryStructure).find({ employeeId: employee._id }).sort({ effectiveFrom: -1 }).lean(),
  ])
  const open = history.find((h) => h.effectiveTo === null) ?? null
  const today = todayIST()
  const firstOfMonth = `${today.slice(0, 7)}-01`
  const defaultStart = open && open.effectiveFrom >= firstOfMonth ? addDays(open.effectiveFrom, 1) : open ? firstOfMonth : employee.joinDate > firstOfMonth ? employee.joinDate : firstOfMonth
  const toEditor = (lines: { code: string; calculationType: EditorLine['calculationType']; value: number }[]): EditorLine[] => lines.map((l) => ({ code: l.code, calculationType: l.calculationType, value: String(l.calculationType === 'fixed' ? l.value / 100 : l.value) }))
  const initial = open
    ? { monthlyGross: String(open.monthlyGross / 100), ctcAnnual: String(open.ctcAnnual / 100), lines: toEditor(open.lines) }
    : { monthlyGross: '', ctcAnnual: '', lines: toEditor(defaultLines(0)) }

  return (
    <div className="space-y-4">
      <Card variant="solid">
        <CardHeader icon={<UserRound />} title={`${open ? 'Revise salary' : 'Set salary'}: ${employee.fullName} · ${employee.code}`} description={open ? `Current: ${formatINR(open.monthlyGross)} a month, ${formatINR(open.ctcAnnual, { decimals: 0 })} a year, since ${formatDate(open.effectiveFrom)}.` : 'No salary yet, so payroll skips this person.'} />
        <StructureEditor
          key={String(employee._id)}
          employeeId={String(employee._id)}
          components={components.map((c) => ({ code: c.code, name: c.name, componentType: c.componentType, calculationType: c.calculationType, defaultValue: c.defaultValue, countsForPf: c.countsForPf, countsForEsi: c.countsForEsi, countsForWages: c.countsForWages, prorateOnLop: c.prorateOnLop, displayOrder: c.displayOrder }))}
          initial={initial}
          defaultEffectiveFrom={defaultStart}
          canEdit={ctx.can('people.salary')}
        />
        {components.length === 0 ? <p className={cn('mt-3 text-sm', TONE_TEXT.warning)}>No earning components are set up. Load the standard set on the Components tab first.</p> : null}
      </Card>
      {history.length ? (
        <ListCard label="Revision history" icon={<History />} description="Every structure, latest first">
          <ListRows>
            {history.map((h) => (
              <ListRow key={String(h._id)} className="flex-nowrap justify-between">
                <span className="min-w-0 text-white/85">
                  {formatDate(h.effectiveFrom)} – {h.effectiveTo ? formatDate(h.effectiveTo) : 'now'}
                  {h.notes ? <span className="text-fg-2"> · {h.notes}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-white">{formatINR(h.monthlyGross)} / month</span>
              </ListRow>
            ))}
          </ListRows>
        </ListCard>
      ) : null}
    </div>
  )
}
