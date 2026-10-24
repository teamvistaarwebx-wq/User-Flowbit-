import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL } from '@/lib/account-types'
import { requireStaff } from '@/lib/console/session'
import { formatDate, timeAgo } from '@/lib/dates'
import { parseListParams, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { flushTable, StatusWord, TableCard } from '@/components/settings/surface'
import { UrlSelect } from '@/components/settings/url-select'
import { HealthDot } from '@/components/console/health-dot'
import { STATE_TONE } from '@/components/console/state-tone'
import { Staff } from '@/models/console/Staff'
import { listAccounts, type AccountRow } from '@/modules/console/accounts-query'

export const metadata: Metadata = { title: 'Accounts' }
const BASE = '/console/accounts'
const PAGE_SIZE = 50

const STATES = [
  { value: 'all', label: 'Any status' },
  { value: 'trial', label: 'Trial' },
  { value: 'free', label: 'Free' },
  { value: 'house', label: 'Internal or test' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Payment due' },
  { value: 'ending', label: 'Ending' },
  { value: 'read_only', label: 'Read-only' },
  { value: 'locked', label: 'Locked' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'deleted', label: 'Deleted' },
]

function PlanCell({ row }: { row: AccountRow }) {
  if (row.plan !== 'custom') return <span className="text-white">{row.plan === 'suite' ? 'Suite' : row.accountType === 'free' ? 'Free' : 'Trial'}</span>
  const products = (['work', 'muster', 'orbit', 'folio'] as const).filter((k) => row.products[k]).map((k) => k[0].toUpperCase() + k.slice(1))
  return <span><span className="block text-white">Custom</span>{products.length ? <span className="block text-xs text-[#979797]">{products.join(' · ')}</span> : null}</span>
}

export default async function ConsoleAccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const p = await requireStaff('accounts.view')
  const params = parseListParams(sp, { pageSize: PAGE_SIZE })
  const filters = { q: params.q, plan: params.get('plan'), state: params.get('state'), type: params.get('type'), health: params.get('health'), salesperson: params.get('sales'), daysLeft: params.get('days'), sort: params.get('order') }
  const [all, sales] = await Promise.all([listAccounts(p, filters), p.raw(Staff).find({ status: 'active', role: { $in: ['sales', 'admin'] } }, { name: 1 }).sort({ name: 1 }).lean()])
  const rows = all.slice(params.skip, params.skip + PAGE_SIZE)
  const filtered = Object.values(filters).some((v) => v && v !== 'created')
  const mine = filters.salesperson === 'mine'

  const columns: Column<AccountRow>[] = [
    { key: 'name', header: 'Workspace', cell: (r) => <span className="flex items-center gap-2"><HealthDot score={r.health} /><span><span className="block text-white">{r.name}</span><span className="block text-xs font-normal text-[#979797]">{r.owner?.email ?? r.slug}</span></span></span> },
    { key: 'type', header: 'Type', cell: (r) => <span className={r.inMetrics ? 'text-white' : 'text-[#979797]'}>{ACCOUNT_TYPE_LABEL[r.accountType]}</span> },
    { key: 'plan', header: 'Plan', hideOnMobile: true, cell: (r) => <PlanCell row={r} /> },
    { key: 'state', header: 'Status', cell: (r) => <StatusWord status={r.state} tone={STATE_TONE[r.state]} label={r.stateLabel} /> },
    { key: 'seats', header: 'Seats', align: 'right', hideOnMobile: true, cell: (r) => <span className="tabular-nums">{r.seatsUsed} / {r.seatLimit ?? '–'}</span> },
    { key: 'sales', header: 'Salesperson', hideOnMobile: true, cell: (r) => <span className={r.salesperson ? 'text-white' : 'text-[#979797]'}>{r.salesperson?.name ?? 'Unassigned'}</span> },
    { key: 'mrr', header: 'MRR', align: 'right', hideOnMobile: true, cell: (r) => <span className="tabular-nums">{r.mrrPaise ? formatINR(r.mrrPaise) : '—'}</span> },
    { key: 'created', header: 'Signed up', hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-[#979797]">{formatDate(new Date(r.createdAt))}</span> },
    { key: 'active', header: 'Last active', hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-[#979797]">{r.lastActive ? timeAgo(r.lastActive) : 'Never'}</span> },
  ]

  return (
    <>
      <PageHeader
        title={mine ? 'My accounts' : 'Accounts'}
        description={`${all.length} ${all.length === 1 ? 'workspace' : 'workspaces'}${filtered ? ' match' : ''}.`}
        actions={<Link href={mine ? BASE : `${BASE}?sales=mine`} className={buttonClass('secondary', 'sm')}>{mine ? 'All accounts' : 'My accounts'}</Link>}
      />
      <TableCard
        icon={<Building2 strokeWidth={1.5} />}
        label={mine ? 'Assigned to you' : 'All workspaces'}
        description={filtered ? 'Showing workspaces that match your filters' : 'Every workspace on Flowbit, newest first unless sorted'}
        toolbar={
          <>
            <SearchInput placeholder="Name, slug or owner email" />
            <UrlSelect param="type" label="Account type" options={[{ value: 'all', label: 'Any type' }, ...ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] }))]} />
            <UrlSelect param="state" label="Status" options={STATES} />
            <UrlSelect param="health" label="Health" options={[{ value: 'all', label: 'Any health' }, { value: 'green', label: 'Green' }, { value: 'amber', label: 'Amber' }, { value: 'red', label: 'Red' }, { value: 'none', label: 'Not scored' }]} />
            <UrlSelect param="sales" label="Salesperson" options={[{ value: 'all', label: 'Anyone' }, { value: 'mine', label: 'Me' }, { value: 'none', label: 'Unassigned' }, ...sales.map((s) => ({ value: String(s._id), label: s.name }))]} />
            <UrlSelect param="days" label="Days left" options={[{ value: 'all', label: 'Any days left' }, { value: '7', label: '7 days or less' }, { value: '15', label: '15 days or less' }, { value: '30', label: '30 days or less' }]} />
            <UrlSelect param="order" label="Sort" allValue="created" options={[{ value: 'created', label: 'Newest first' }, { value: 'days', label: 'Fewest days left' }, { value: 'mrr', label: 'Highest MRR' }]} />
          </>
        }
      >
        <DataTable
          className={flushTable}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `${BASE}/${r.id}`}
          empty={<EmptyState compact icon={<Building2 />} title={filtered ? 'No workspaces match these filters.' : 'No workspaces yet.'} action={filtered ? <Link href={BASE} className={buttonClass('secondary')}>Clear filters</Link> : undefined} />}
        />
      </TableCard>
      <Pagination page={params.page} pageSize={PAGE_SIZE} total={all.length} basePath={BASE} params={sp} />
    </>
  )
}
