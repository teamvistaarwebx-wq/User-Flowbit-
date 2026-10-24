import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { Building2, Lock, Users } from 'lucide-react'
import { maskEmployee, maskPan } from '@/lib/console/mask'
import { requireStaff } from '@/lib/console/session'
import { activeGrant, internalLocked as isInternalLocked } from '@/lib/console/support-access'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { Client } from '@/models/Client'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { SupportAccess } from '@/models/console/SupportAccess'
import { Employee } from '@/models/muster/Employee'
import { SalaryStructure } from '@/models/muster/SalaryStructure'

export const metadata: Metadata = { title: 'Support view' }
const LIMIT = 100

/**
 * Read-only support view (console spec 8): opens only while an approved,
 * unexpired read grant exists. Salary, bank and PAN are masked for every
 * staff role, Admin included (D3). Every visit is audited per staff member and in the workspace log.
 */
export default async function SupportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await requireStaff('accounts.view')
  if (!isValidObjectId(id)) notFound()
  const org = await p.raw(Org).findById(id, { name: 1, subscription: 1 }).lean()
  if (!org) notFound()
  const db = p.forOrg(org._id).db
  const grant = activeGrant(await db(SupportAccess).find({ mode: 'read', staffId: p.staff.id }).lean(), 'read')
  const internalLocked = isInternalLocked(org.subscription?.accountType, p.staff.isFounder)
  if (!grant || internalLocked) {
    return (
      <>
        <PageHeader title={`Support view · ${org.name}`} back={{ href: `/console/accounts/${id}`, label: org.name }} />
        <EmptyState icon={<Lock />} title={internalLocked ? 'Only the founder can open the Internal workspace.' : 'No approved read-only access'} description={internalLocked ? undefined : 'Request access from the account page; the owner must approve it.'} />
      </>
    )
  }
  await p.audit({ orgId: org._id, action: 'console.support_viewed', entity: 'SupportAccess', entityId: grant._id, summary: `${p.staff.name} opened the read-only support view` })
  const [members, employees, clients] = await Promise.all([
    db(Member).find({}, { userId: 1, role: 1, status: 1, title: 1, department: 1 }).limit(LIMIT).lean(),
    db(Employee).find({ deletedAt: null }, { code: 1, fullName: 1, status: 1, pan: 1, bank: 1 }).sort({ code: 1 }).limit(LIMIT).lean(),
    db(Client).find({}, { name: 1, gstin: 1, pan: 1, state: 1, status: 1 }).sort({ name: 1 }).limit(LIMIT).lean(),
  ])
  const [users, salaries] = await Promise.all([
    p.raw(User).find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean(),
    // Only whether a salary is set: staff never read the figure (D3).
    db(SalaryStructure).find({ employeeId: { $in: employees.map((e) => e._id) }, effectiveTo: null }, { employeeId: 1 }).lean(),
  ])
  const hasSalary = new Set(salaries.map((s) => String(s.employeeId)))
  const userOf = (uid: unknown) => users.find((u) => String(u._id) === String(uid))
  return (
    <>
      <PageHeader
        title={`Support view · ${org.name}`}
        description={`Read-only until ${formatDateTime(grant.expiresAt!)} (approved by the owner). Salary, bank and PAN stay masked for every Flowbit role, Admin included. This visit is logged.`}
        back={{ href: `/console/accounts/${id}`, label: org.name }}
      />
      <div className="space-y-4">
        <TableCard icon={<Users strokeWidth={1.5} />} label="Members" description={`${members.length} shown`}>
          <SimpleTable head={['Person', 'Role', 'Status', 'Department']} rows={members.map((m) => [userOf(m.userId) ? `${userOf(m.userId)!.name} · ${userOf(m.userId)!.email}` : '—', m.role, m.status, m.department ?? '—'])} />
        </TableCard>
        <TableCard icon={<Users strokeWidth={1.5} />} label="Employees" description={`${employees.length} shown`}>
          <SimpleTable head={['Code', 'Name', 'Status', 'PAN', 'Bank account', 'IFSC', 'Monthly gross']} rows={employees.map((e) => {
            const m = maskEmployee({ pan: e.pan, bank: e.bank, monthlyGrossPaise: hasSalary.has(String(e._id)) ? 0 : null })
            return [e.code, e.fullName, e.status, m.pan, m.bankAccount, m.ifsc, m.salary]
          })} />
        </TableCard>
        <TableCard icon={<Building2 strokeWidth={1.5} />} label="Clients" description={`${clients.length} shown`}>
          <SimpleTable head={['Name', 'GSTIN', 'PAN', 'State', 'Status']} rows={clients.map((c) => [c.name, c.gstin ?? '—', maskPan(c.pan), c.state ?? '—', c.status])} />
        </TableCard>
      </div>
    </>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | null | undefined)[][] }) {
  if (!rows.length) return <div className="border-t border-line"><EmptyState compact title="Nothing here" /></div>
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr className={tableHead}>{head.map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={tableRow}>{r.map((c, j) => <td key={j} className={cn(td, j === 0 ? 'text-white' : 'text-[#c9c9c9]')}>{c ?? '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
