import type { Metadata } from 'next'
import { CircleCheck, Download, FileUp, Laptop, Plus, TriangleAlert, Unlink, Users } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { redirect } from 'next/navigation'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge, TONE_TEXT } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { LinkTabs } from '@/components/ui/tabs'
import { FilterChips } from '@/components/muster/ui/filter-chips'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { LinkLoginsDialog } from '@/components/muster/people/link-logins-dialog'
import { WorkModeDialog } from '@/components/muster/people/work-mode-dialog'
import { EMPLOYMENT_TYPE_LABEL, statusLabelOf, statusToneOf, WORK_MODE_LABEL, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { listPeople, peopleOptions, type DirectoryRow } from '@/modules/muster/people/queries'
import { workModeRows } from '@/modules/muster/people/work-mode'
import { loginLinkPlan } from '@/modules/muster/people/login-links'
import { mayManageLogins } from '@/modules/muster/people/scope'

export const metadata: Metadata = { title: 'People' }

const BASE = '/app/hr/people'
const STATUS_TABS = [
  { key: 'current', label: 'Current' },
  { key: 'probation', label: 'Probation' },
  { key: 'notice_period', label: 'Serving notice' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'Everyone' },
]

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'people.read' })
  const p = parseListParams(sp, { pageSize: 25, sort: 'fullName', dir: 'asc' })
  const [{ rows, total, status }, options] = await Promise.all([listPeople(ctx, p), peopleOptions(ctx)])
  const modeRows = ctx.can('people.write') ? await workModeRows(ctx, new Map(options.departments.map((d) => [d.value, d.label]))) : null
  const linkPlan = mayManageLogins(ctx) ? await loginLinkPlan(ctx) : null
  // A stale ?page= past the end (an old bookmark) goes to the last page instead of an empty one.
  if (!rows.length && total > 0 && p.page > 1) redirect(buildHref(BASE, sp, { page: Math.ceil(total / p.pageSize) }))
  const dept = p.get('dept')
  const incomplete = p.get('filter') === 'incomplete'
  const noLogin = p.get('filter') === 'nologin'
  const remoteOnly = p.get('mode') === 'remote'
  const filtered = Boolean(p.q || dept || incomplete || noLogin || remoteOnly || status !== 'current')

  const columns: Column<DirectoryRow>[] = [
    {
      key: 'fullName',
      header: 'Person',
      sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-3">
          <Avatar name={r.fullName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-white">{r.fullName}</span>
            <span className="block truncate text-xs text-fg-2">{r.designation ?? 'No designation'}</span>
          </span>
        </span>
      ),
    },
    { key: 'code', header: 'Code', sortable: true, hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => <span className="font-mono text-xs text-fg-2">{r.code}</span> },
    { key: 'department', header: 'Department', hideOnMobile: true, cell: (r) => r.department ?? <span className="text-[#979797]">—</span> },
    { key: 'status', header: 'Status', cell: (r) => <Badge tone={statusToneOf(r.status)}>{statusLabelOf(r.status)}</Badge> },
    { key: 'type', header: 'Type', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => EMPLOYMENT_TYPE_LABEL[r.employmentType as EmploymentType] ?? r.employmentType },
    { key: 'workMode', header: 'Work mode', hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => (r.workMode === 'remote' ? WORK_MODE_LABEL.remote : <span className="text-[#979797]">{WORK_MODE_LABEL.office}</span>) },
    { key: 'joinDate', header: 'Joined', sortable: true, hideOnMobile: true, className: 'whitespace-nowrap', cell: (r) => <span className="text-[#979797]">{formatDate(r.joinDate)}</span> },
    {
      key: 'missing',
      header: 'Payroll ready',
      hideOnMobile: true,
      cell: (r) =>
        // Coloured words, as the Figma's priority column: a column of filled pills shouts.
        r.missing.length ? (
          <span className={cn('inline-flex items-center gap-1.5 text-[13px]', TONE_TEXT.danger)}>
            <TriangleAlert className="size-3.5 shrink-0" /> No {r.missing.join(', ')}
          </span>
        ) : (
          <span className={cn('inline-flex items-center gap-1.5 text-[13px]', TONE_TEXT.success)}>
            <CircleCheck className="size-3.5 shrink-0" /> Ready
          </span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="People"
        help="login-vs-employee"
        description={`Employee records for HR and payroll; logins are in Settings → Members. ${total} ${total === 1 ? 'person' : 'people'} ${status === 'current' ? 'on the board' : 'in this view'}.`}
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <>
            <a className={buttonClass('secondary')} href={`/api/muster/people/export?${new URLSearchParams({ status, ...(dept ? { dept } : {}) }).toString()}`} download><Download className="size-4" /> Export</a>
            {linkPlan && (linkPlan.matches.length || linkPlan.withoutLogin.length) ? <LinkLoginsDialog plan={linkPlan} defaultOpen={first(sp.link) === '1'} /> : null}
            {modeRows ? <WorkModeDialog rows={modeRows} /> : null}
            {ctx.can('people.import') ? <Button variant="secondary" icon={<FileUp className="size-4" />} href="/app/settings/import/employees?from=people">Import</Button> : null}
            {ctx.can('people.write') ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>Add employee</Button> : null}
          </>
        }
      />
      <ListCard
        label="Directory"
        icon={<Users />}
        description={incomplete ? 'Showing people missing payroll details' : dept ? `Showing ${options.departments.find((d) => d.value === dept)?.label ?? 'one team'}` : 'Showing every team'}
        actions={
          <>
            <LinkTabs tabs={STATUS_TABS.map((t) => ({ href: buildHref(BASE, sp, { status: t.key === 'current' ? undefined : t.key, page: undefined }), label: t.label }))} />
            <SearchInput placeholder="Search name, code or email" className="w-full sm:w-72" />
          </>
        }
        toolbar={
          <FilterChips
            label="Team"
            items={[
              { key: 'all', href: buildHref(BASE, sp, { dept: undefined, page: undefined }), label: 'All teams', active: !dept },
              ...options.departments.map((d) => ({ key: d.value, href: buildHref(BASE, sp, { dept: d.value, page: undefined }), label: d.label, active: dept === d.value })),
              { key: 'remote', href: buildHref(BASE, sp, { mode: remoteOnly ? undefined : 'remote', page: undefined }), label: 'Remote', active: remoteOnly, icon: <Laptop /> },
              ...(ctx.can('people.write') ? [{ key: 'incomplete', href: buildHref(BASE, sp, { filter: incomplete ? undefined : 'incomplete', page: undefined }), label: 'Missing payroll details', active: incomplete, icon: <TriangleAlert /> }] : []),
              ...(ctx.can('people.write') ? [{ key: 'nologin', href: buildHref(BASE, sp, { filter: noLogin ? undefined : 'nologin', page: undefined }), label: 'Missing login', active: noLogin, icon: <Unlink /> }] : []),
            ]}
          />
        }
      >
        <DataTable
          className={LIST_FLUSH}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `${BASE}/${r.id}`}
          basePath={BASE}
          params={sp}
          empty={
            filtered ? (
              <EmptyState compact icon={<Users />} title="Nobody matches those filters" description="Clear the search, or widen the team and status filters." action={<Button variant="secondary" href={BASE}>Clear filters</Button>} />
            ) : (
              <EmptyState
                compact
                icon={<Users />}
                title="No one here yet"
                description="Add your first employee, or import everyone from a spreadsheet."
                action={ctx.can('people.write') ? <div className="flex gap-2"><Button variant="primary" href={`${BASE}/new`}>Add employee</Button><Button variant="secondary" href={`${BASE}/import`}>Import CSV</Button></div> : undefined}
              />
            )
          }
        />
      </ListCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}
