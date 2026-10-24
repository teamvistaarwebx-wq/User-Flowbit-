import type { Metadata } from 'next'
import { CalendarDays, Paperclip, Plane, Scale, Undo2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { fileUrl } from '@/lib/files'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { LinkTabs } from '@/components/ui/tabs'
import { FiguresCard } from '@/components/muster/ui/figures'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { ApplyLeaveDialog } from '@/components/muster/leave/apply-leave-dialog'
import { DecideButtons } from '@/components/muster/leave/decide-buttons'
import { ActionButton } from '@/components/muster/people/action-button'
import { cancelLeaveRequest, decideLeaveRequest } from '@/modules/muster/leave/actions'
import { daysLabel, leaveSpanLabel } from '@/modules/muster/leave/days'
import { applicableEmployees, LEAVE_TABS, leaveTypeOptions, listLeaveRequests, type LeaveRow, type LeaveTab } from '@/modules/muster/leave/queries'

export const metadata: Metadata = { title: 'Leave' }

const BASE = '/app/hr/leave'
const TAB_LABEL: Record<LeaveTab, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', all: 'All' }

export default async function LeavePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'leave.read' })
  const tab: LeaveTab = (LEAVE_TABS as readonly string[]).includes(first(sp.status) ?? '') ? (first(sp.status) as LeaveTab) : 'pending'
  const p = parseListParams(sp, { pageSize: 25 })
  const canApply = ctx.can('leave.manage')
  const [data, types, employees] = await Promise.all([
    listLeaveRequests(ctx, tab, p),
    canApply ? leaveTypeOptions(ctx) : Promise.resolve([]),
    canApply ? applicableEmployees(ctx) : Promise.resolve([]),
  ])

  const columns: Column<LeaveRow>[] = [
    { key: 'employee', header: 'Employee', cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.employee} size="xs" /><a href={`/app/hr/people/${r.employeeId}?tab=leave`} className="whitespace-nowrap text-white transition-colors hover:text-blush">{r.employee}</a></span> },
    { key: 'type', header: 'Type', cell: (r) => <span className="whitespace-nowrap text-white">{r.type}</span> },
    { key: 'dates', header: 'Dates', cell: (r) => <span className="whitespace-nowrap text-[#979797]">{leaveSpanLabel(r.startDate, r.endDate, r.isHalfDay)}</span> },
    { key: 'days', header: 'Days', cell: (r) => <span className="whitespace-nowrap tabular-nums">{daysLabel(r.dayCount)}{r.unpaidDays ? <span className="block text-xs text-[#FF6A66]">{r.unpaidDays} loss of pay</span> : null}</span> },
    { key: 'reason', header: 'Reason', hideOnMobile: true, cell: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}{r.attachmentFileId ? <a href={fileUrl(r.attachmentFileId)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-link hover:underline"><Paperclip className="size-3" />proof</a> : null}</span> },
    { key: 'status', header: 'Status', cell: (r) => <span className="flex flex-col items-start gap-1 py-1.5"><StatusPill status={r.status} /><span className="text-xs text-fg-2">{r.where}</span></span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        // Wraps (Withdraw/Cancel under Approve/Reject) so three actions fit the card at 1440 wide.
        <div className="ml-auto flex max-w-[15rem] flex-wrap items-center justify-end gap-1.5">
          {r.decidable ? <DecideButtons action={decideLeaveRequest} id={r.id} subject={`${r.employee}'s ${r.type}`} /> : null}
          {r.cancellable ? (
            <ActionButton
              action={cancelLeaveRequest}
              input={{ id: r.id }}
              label={r.status === 'approved' ? 'Cancel' : 'Withdraw'}
              icon={<Undo2 className="size-3.5" />}
              title={r.status === 'approved' ? `Cancel approved leave for ${r.employee}?` : 'Withdraw this request?'}
              description={r.status === 'approved' ? 'The days go back to what check-ins say, and the balance is restored.' : undefined}
              confirmLabel={r.status === 'approved' ? 'Cancel leave' : 'Withdraw'}
              reason={r.status === 'approved' ? { label: 'Reason', required: true } : undefined}
            />
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Leave"
        description="Requests waiting on you first. Approved leave lands on the attendance register."
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <>
            <Button variant="secondary" icon={<CalendarDays className="size-4" />} href={`${BASE}/calendar`}>Calendar</Button>
            <Button variant="secondary" icon={<Scale className="size-4" />} href={`${BASE}/balances`}>Balances</Button>
            {canApply && types.length ? <ApplyLeaveDialog types={types} employees={employees} today={todayIST()} /> : null}
          </>
        }
      />
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'Waiting on you', value: data.waitingCount, tone: data.waitingCount ? 'warning' : undefined, hint: data.waitingCount ? `${data.waitingDays} days requested` : 'You are all caught up' },
          { label: 'Pending in total', value: data.pendingCount },
        ]}
      />
      <ListCard
        label="Requests"
        icon={<Plane />}
        description={`${data.total} ${data.total === 1 ? 'request' : 'requests'} · ${TAB_LABEL[tab].toLowerCase()}`}
        actions={
          <>
            <LinkTabs tabs={LEAVE_TABS.map((t) => ({ href: buildHref(BASE, sp, { status: t === 'pending' ? undefined : t, page: undefined }), label: TAB_LABEL[t], count: t === 'pending' ? data.pendingCount : undefined }))} />
            <SearchInput placeholder="Search by name" className="w-full sm:w-64" />
          </>
        }
      >
        <DataTable
          className={LIST_FLUSH}
          columns={columns}
          rows={data.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState compact icon={<Plane />} title={tab === 'pending' ? 'Nothing is waiting for a decision' : 'No leave requests here'} description="Requests from My leave, and those HR applies on someone's behalf, show up here." />}
        />
      </ListCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={data.total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
