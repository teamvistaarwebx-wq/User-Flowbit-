import type { Metadata } from 'next'
import { UsersRound } from 'lucide-react'
import { ROLE_PERMS, STAFF_ROLE_LABEL, STAFF_ROLES, isStaffRole } from '@/lib/console/roles'
import { requireStaff } from '@/lib/console/session'
import { formatDateTime } from '@/lib/dates'
import { PageHeader } from '@/components/ui/page-header'
import { TableCard } from '@/components/settings/surface'
import { AddStaffButton, SendSetupLinksButton, StaffRowActions } from '@/components/console/staff-admin'
import { Staff } from '@/models/console/Staff'

export const metadata: Metadata = { title: 'Staff' }

const ROLE_SUMMARY: Record<(typeof STAFF_ROLES)[number], string> = {
  admin: 'Everything: staff, account types, plans, disable and restore, settings.',
  sales: 'View accounts, extend a trial once, run imports and setup, request support access.',
  accounts: 'View accounts, invoices and payments; cancel invoices.',
}

/** Staff and roles (console spec 7.1), Admin only. */
export default async function ConsoleStaffPage() {
  const p = await requireStaff('staff.manage')
  const staff = await p.raw(Staff).find({}).sort({ status: 1, name: 1 }).lean()
  const waiting = staff.filter((s) => s.status === 'active' && !s.passwordHash && String(s._id) !== String(p.staff.id)).length
  return (
    <>
      <PageHeader title="Staff" description="Everyone who can sign in to the Console. Two-factor sign-in is required for all." actions={<span className="flex flex-wrap gap-2"><SendSetupLinksButton count={waiting} /><AddStaffButton /></span>} />
      <TableCard icon={<UsersRound strokeWidth={1.5} />} label="Staff" description={`${staff.length} ${staff.length === 1 ? 'person' : 'people'}`}>
        <ul className="border-t border-line py-1.5">
          {staff.map((s) => (
            <li key={String(s._id)} className="flex flex-wrap items-center gap-3 px-[23px] py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-white">{s.name}{s.isFounder ? ' · founder' : ''}{s.status === 'disabled' ? ' · disabled' : ''}</span>
                <span className="block text-xs text-[#979797]">{s.email} · {s.totp?.enabledAt ? '2FA on' : '2FA not set up'} · {s.passwordHash ? (s.lastLoginAt ? `last sign-in ${formatDateTime(s.lastLoginAt)}` : 'never signed in') : 'waiting for the setup link'}</span>
              </span>
              <StaffRowActions staffId={String(s._id)} role={isStaffRole(s.role) ? s.role : 'sales'} active={s.status === 'active'} self={String(s._id) === String(p.staff.id)} />
            </li>
          ))}
        </ul>
      </TableCard>
      <TableCard className="mt-5" icon={<UsersRound strokeWidth={1.5} />} label="Roles">
        <ul className="border-t border-line py-1.5 text-sm">
          {STAFF_ROLES.map((r) => (
            <li key={r} className="px-[23px] py-2.5"><span className="text-white">{STAFF_ROLE_LABEL[r]}</span> <span className="text-fg-2">· {ROLE_SUMMARY[r]} ({ROLE_PERMS[r].size} permissions)</span></li>
          ))}
        </ul>
      </TableCard>
    </>
  )
}
