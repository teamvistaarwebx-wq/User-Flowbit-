import type { Metadata } from 'next'
import Link from 'next/link'
import { MailQuestion, Users } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { isResendConfigured } from '@/lib/env'
import { buildHref, parseListParams, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { BUILTIN_ROLE_KEYS, BUILTIN_ROLES } from '@/lib/permissions'
import { kindAllowsRole, workspaceKindOf } from '@/lib/workspace-kind'
import { Avatar } from '@/components/ui/avatar'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { FilterPills } from '@/components/settings/filter-pills'
import { flushTable, Notice, StatusWord, TableCard, tableHead, tableRow, td, th } from '@/components/settings/surface'
import { InviteDialog } from '@/components/settings/invite-dialog'
import { InvitationActions, MemberActionsMenu } from '@/components/settings/member-actions-menu'
import { UrlSelect } from '@/components/settings/url-select'
import { assignableRoles, linkableEmployees, listInvitations, listMembers, managerOptions, type InviteRow, type MemberRow } from '@/modules/settings/members-query'
import { capacityOf } from '@/modules/subscription/usage'

export const metadata: Metadata = { title: 'Members' }
const BASE = '/app/settings/members'

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ perm: 'members.manage' })
  const p = parseListParams(sp, { pageSize: 50 })
  const status = p.get('status')
  const role = p.get('role')
  const showInvites = !status || status === 'invited'
  const [{ rows, total, pageSize }, invites, { options: roles, customRoles }, employees, managers, cap] = await Promise.all([
    status === 'invited' ? Promise.resolve({ rows: [] as MemberRow[], total: 0, pageSize: 50 }) : listMembers(ctx, { q: p.q, status, role, page: p.page }),
    showInvites ? listInvitations(ctx) : Promise.resolve([] as InviteRow[]),
    assignableRoles(ctx),
    linkableEmployees(ctx),
    managerOptions(ctx),
    capacityOf(ctx),
  ])
  const seatRow = cap.rows.find((r) => r.key === 'logins' || r.key === 'persons')
  // Only the seat row means "no seats left"; other limits (Folio firms) have their own notice on Subscription.
  const full = seatRow?.limit != null && seatRow.used >= seatRow.limit
  const subtitle = seatRow?.limit != null ? `${seatRow.used} of ${seatRow.limit} seats used` : `${cap.usage.members} ${cap.usage.members === 1 ? 'member' : 'members'} · trial, no seat limit`
  const filtered = Boolean(p.q || status || role)
  const roleFilterOptions = [
    { value: 'all', label: 'All roles' },
    ...BUILTIN_ROLE_KEYS.filter((k) => kindAllowsRole(workspaceKindOf(ctx.org), k)).map((k) => ({ value: k, label: BUILTIN_ROLES[k].label })),
    ...customRoles.map((r) => ({ value: String(r._id), label: r.label })),
  ]

  const columns: Column<MemberRow>[] = [
    {
      key: 'name',
      header: 'Person',
      cell: (m) => (
        <span className="flex items-center gap-3">
          <Avatar name={m.name} src={m.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-white">
              {m.name}
              {m.isYou ? <span className="text-xs text-fg-3">(you)</span> : null}
            </span>
            <span className="hidden truncate text-xs text-[#979797] sm:block">{m.email}</span>
            {/* Phones drop the Role column so Status and the actions menu stay on screen; the role rides here. */}
            <span className={cn('block truncate text-xs sm:hidden', m.isOwner ? 'text-blush' : 'text-[#979797]')}>{m.roleLabel}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', hideOnMobile: true, cell: (m) => <span className={m.isOwner ? 'font-medium text-blush' : 'text-white'}>{m.roleLabel}</span> },
    { key: 'title', header: 'Title', hideOnMobile: true, cell: (m) => m.title || '—' },
    { key: 'department', header: 'Department', hideOnMobile: true, cell: (m) => m.department || '—' },
    {
      key: 'employee',
      header: 'Employee',
      hideOnMobile: true,
      cell: (m) =>
        m.employee ? (
          ctx.can('people.read') ? (
            <Link href={`/app/hr/people/${m.employee.id}`} className="text-link hover:underline">{m.employee.code}</Link>
          ) : (
            m.employee.code
          )
        ) : (
          '—'
        ),
    },
    { key: 'lastActive', header: 'Last active', hideOnMobile: true, cell: (m) => <span className="whitespace-nowrap text-[#979797]">{m.lastActive}</span> },
    { key: 'status', header: 'Status', cell: (m) => <StatusWord status={m.status} /> },
    { key: 'actions', header: '', align: 'right', cell: (m) => <MemberActionsMenu member={m} roles={roles} managers={managers} viewerIsOwner={ctx.isOwner} workspaceName={ctx.org.name} /> },
  ]

  return (
    <>
      <PageHeader title="Members" help="login-vs-employee" description={`Logins: who can sign in to this workspace. Employee records live in Muster → People. ${subtitle}.`} breadcrumb={breadcrumbFor(BASE)} actions={<InviteDialog roles={roles} employees={employees} emailConfigured={isResendConfigured()} />} />

      {full ? (
        <Notice tone="warning" className="mb-4">
          No seats left on your plan.{' '}
          {ctx.can('billing.manage') ? (
            <>
              Add seats in <Link href="/app/settings/subscription" className="text-link hover:underline">Settings → Plan & billing</Link>, or disable someone.
            </>
          ) : (
            'Ask the workspace owner to add seats, or disable someone.'
          )}
        </Notice>
      ) : null}

      <TableCard
        icon={<Users strokeWidth={1.5} />}
        label="People"
        description={status === 'invited' ? 'Invitations that are still open' : `${total} ${total === 1 ? 'person' : 'people'}${filtered ? ' match' : ' in this workspace'}`}
        actions={
          <FilterPills
            label="Filter members"
            items={[
              { href: buildHref(BASE, sp, { status: undefined, page: undefined }), label: 'All', active: !status },
              { href: buildHref(BASE, sp, { status: 'active', page: undefined }), label: 'Active', active: status === 'active' },
              { href: buildHref(BASE, sp, { status: 'invited', page: undefined }), label: 'Invited', active: status === 'invited', count: invites.length || undefined },
              { href: buildHref(BASE, sp, { status: 'disabled', page: undefined }), label: 'Disabled', active: status === 'disabled' },
            ]}
          />
        }
        toolbar={
          status !== 'invited' ? (
            <>
              <SearchInput placeholder="Search name or email" />
              <UrlSelect param="role" label="Filter by role" options={roleFilterOptions} />
            </>
          ) : undefined
        }
      >
        {status !== 'invited' ? (
          <DataTable
            className={flushTable}
            columns={columns}
            rows={rows}
            rowKey={(m) => m.id}
            basePath={BASE}
            params={sp}
            empty={
              filtered ? (
                <EmptyState compact icon={<Users />} title={p.q ? `No one matches "${p.q}".` : 'No one matches these filters.'} action={<Link href={BASE} className={buttonClass('secondary')}>Clear filters</Link>} />
              ) : (
                <EmptyState compact icon={<Users />} title="It's just you so far" description={`Invite your team. They'll get an email with a link to join ${ctx.org.name}.`} />
              )
            }
          />
        ) : !invites.length ? (
          <div className="border-t border-line">
            <EmptyState compact icon={<MailQuestion />} title="No pending invitations" description="Everyone you invited has joined." />
          </div>
        ) : null}
        {status === 'invited' && invites.length ? <InvitesTable invites={invites} /> : null}
      </TableCard>
      {status !== 'invited' ? <Pagination page={p.page} pageSize={pageSize} total={total} basePath={BASE} params={sp} /> : null}

      {!status && invites.length ? (
        <TableCard className="mt-5" icon={<MailQuestion strokeWidth={1.5} />} label="Invitations" description="People who haven't joined yet. Each pending invitation holds a seat.">
          <InvitesTable invites={invites} />
        </TableCard>
      ) : null}
    </>
  )
}

/** Open invitations, in the same ruled table as the members list. */
function InvitesTable({ invites }: { invites: InviteRow[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={tableHead}>
            <th scope="col" className={th}>Email</th>
            <th scope="col" className={cn(th, 'hidden sm:table-cell')}>Role</th>
            <th scope="col" className={cn(th, 'hidden md:table-cell')}>Invited by</th>
            <th scope="col" className={cn(th, 'hidden md:table-cell')}>Sent</th>
            <th scope="col" className={th}>Expires</th>
            <th scope="col" className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {invites.map((i) => (
            <tr key={i.memberId} className={tableRow}>
              <td className={td}>
                <span className="block text-white">{i.email}</span>
                {i.name ? <span className="text-xs text-fg-3">{i.name}</span> : null}
              </td>
              <td className={cn(td, 'hidden text-[#979797] sm:table-cell')}>{i.roleLabel}</td>
              <td className={cn(td, 'hidden text-[#979797] md:table-cell')}>{i.invitedBy}</td>
              <td className={cn(td, 'hidden text-[#979797] md:table-cell')}>{i.sent}</td>
              <td className={cn(td, i.expired ? 'text-[#FF2D31]' : 'text-[#979797]')}>{i.expired ? `${i.expires}, expired` : i.expires}</td>
              <td className={td}>
                <InvitationActions memberId={i.memberId} email={i.email} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
