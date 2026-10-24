import Link from 'next/link'
import { STAFF_ROLE_LABEL } from '@/lib/console/roles'
import { initials } from '@/lib/utils'
import { requireStaff } from '@/lib/console/session'
import { Logo } from '@/components/ui/logo'
import { ConsoleNav, type ConsoleLink } from '@/components/console/console-nav'
import { ConsoleSignOut } from '@/components/console/sign-out-button'
import { StaffAlert } from '@/models/console/StaffAlert'

/** The signed-in Console frame. Every page and action still checks the role on the server. */
export default async function ConsoleStaffLayout({ children }: { children: React.ReactNode }) {
  const p = await requireStaff()
  const alerts = await p.raw(StaffAlert).countDocuments({ readAt: null, $or: [{ staffId: p.staff.id }, { staffId: null }] })
  const links: ConsoleLink[] = [
    { href: '/console', label: 'Home', exact: true, badge: alerts },
    { href: '/console/accounts', label: 'Accounts' },
    { href: '/console/setup', label: 'Setup' },
    ...(p.can('billing.view') ? [{ href: '/console/billing', label: 'Billing' }] : []),
    { href: '/console/messages', label: 'Messages' },
    ...(p.can('reports.view') ? [{ href: '/console/reports', label: 'Reports' }] : []),
    ...(p.can('staff.manage') ? [{ href: '/console/staff', label: 'Staff' }, { href: '/console/audit', label: 'Audit' }] : []),
    ...(p.can('breach.notify') ? [{ href: '/console/incidents', label: 'Incidents' }] : []),
    ...(p.can('settings.edit') ? [{ href: '/console/settings', label: 'Settings' }] : []),
  ]
  return (
    <>
      {/* The app's plum glow, behind the top of the content (DESIGN 3.4). */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(48%_80%_at_58%_0%,rgba(58,40,62,0.85)_0%,rgba(42,32,44,0.55)_35%,rgba(23,23,23,0)_75%)]" />
      <header className="sticky top-0 z-30 border-b border-line bg-[#1A1A1A]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center gap-5 px-4 sm:px-7">
          <Link href="/console" className="flex shrink-0 items-center gap-3">
            <Logo size={30} />
            <span aria-hidden className="h-6 w-px bg-line" />
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-white/70">Console</span>
          </Link>
          <div className="hidden min-w-0 lg:block">
            <ConsoleNav links={links} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {/* Name and role on one line on wide screens; initials alone below xl, so the bar never wraps. */}
            <span title={`${p.staff.name} · ${STAFF_ROLE_LABEL[p.staff.role]}`} className="hidden max-w-[240px] truncate whitespace-nowrap text-[13px] text-[#979797] xl:inline">{p.staff.name} · {STAFF_ROLE_LABEL[p.staff.role]}</span>
            <span role="img" aria-label={`${p.staff.name}, ${STAFF_ROLE_LABEL[p.staff.role]}`} title={`${p.staff.name} · ${STAFF_ROLE_LABEL[p.staff.role]}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[11px] font-semibold text-white/80 ring-1 ring-inset ring-white/10 xl:hidden">{initials(p.staff.name)}</span>
            <ConsoleSignOut />
          </div>
        </div>
        <div className="px-4 pb-3 lg:hidden">
          <ConsoleNav links={links} />
        </div>
      </header>
      <main className="relative mx-auto max-w-[1280px] px-4 py-6 sm:px-7 lg:pb-12 lg:pt-8">{children}</main>
    </>
  )
}
