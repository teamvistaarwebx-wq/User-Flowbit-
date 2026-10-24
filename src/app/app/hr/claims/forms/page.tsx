import type { Metadata } from 'next'
import { ClipboardList, FileText, Tags } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { addDays, formatMonth, monthOf, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { Badge, StatusPill } from '@/components/ui/badge'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { CategoryActiveToggle, CategoryDialog, FormStatusButton, LoadStandardCategories } from '@/components/muster/claims/category-controls'
import { CopyLink } from '@/components/muster/claims/copy-link'
import { ClaimFormDialog } from '@/components/muster/claims/form-dialog'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { Employee } from '@/models/muster/Employee'
import { FORM_STATE_LABEL, FORM_STATE_TONE, claimFormState, formWindowLabel } from '@/modules/muster/claims/rules'
import { PAYROLL_STATUSES } from '@/modules/muster/people/lifecycle'

export const metadata: Metadata = { title: 'Claim forms' }
const BASE = '/app/hr/claims/forms'

export default async function ClaimFormsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'claims.forms' })
  const tab = first(sp.tab) === 'categories' ? 'categories' : 'forms'
  const [forms, categories, employees, counts] = await Promise.all([
    ctx.db(ClaimForm).find({}).sort({ createdAt: -1 }).lean(),
    ctx.db(ClaimCategory).find({}).sort({ isActive: -1, displayOrder: 1, code: 1 }).lean(),
    ctx.db(Employee).find({ deletedAt: null, status: { $in: PAYROLL_STATUSES } }, { fullName: 1, code: 1 }).sort({ fullName: 1 }).lean(),
    ctx.db(Claim).aggregate<{ _id: unknown; n: number }>([{ $match: { formId: { $ne: null } } }, { $group: { _id: '$formId', n: { $sum: 1 } } }]),
  ])
  const claimsOn = new Map(counts.map((c) => [String(c._id), c.n]))
  const today = todayIST()
  type FormRow = (typeof forms)[number]
  const formColumns: Column<FormRow>[] = [
    { key: 'name', header: 'Form', cell: (f) => <span className="text-white">{f.name}</span> },
    { key: 'link', header: 'Link', cell: (f) => <CopyLink slug={f.slugLower} compact /> },
    { key: 'window', header: 'Window', hideOnMobile: true, cell: (f) => <span className="text-[#979797]">{formWindowLabel(f)}</span> },
    { key: 'payroll', header: 'Payroll month', hideOnMobile: true, cell: (f) => (f.includeInPayroll && f.payrollYear && f.payrollMonth ? formatMonth(`${f.payrollYear}-${String(f.payrollMonth).padStart(2, '0')}`) : 'Paid separately') },
    { key: 'claims', header: 'Claims', align: 'right', cell: (f) => <span className="tabular-nums">{claimsOn.get(String(f._id)) ?? 0}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (f) => {
        const state = claimFormState(f)
        return <Badge tone={FORM_STATE_TONE[state]}>{FORM_STATE_LABEL[state]}</Badge>
      },
    },
    { key: 'actions', header: '', align: 'right', cell: (f) => <FormStatusButton id={String(f._id)} name={f.name} open={f.status === 'open'} /> },
  ]
  type CategoryRow = (typeof categories)[number]
  const categoryColumns: Column<CategoryRow>[] = [
    { key: 'code', header: 'Code', cell: (c) => <span className="font-mono text-xs text-fg-2">{c.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'maxAmount', header: 'Ceiling per claim', align: 'right', cell: (c) => (c.maxAmount ? <span className="tabular-nums">{formatINR(c.maxAmount)}</span> : <span className="text-[#979797]">No ceiling</span>) },
    { key: 'displayOrder', header: 'Order', align: 'right', hideOnMobile: true },
    { key: 'isActive', header: 'Status', cell: (c) => <StatusPill status={c.isActive ? 'active' : 'inactive'} label={c.isActive ? 'In use' : 'Retired'} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <span className="inline-flex items-center gap-1">
          <CategoryDialog category={{ id: String(c._id), code: c.code, name: c.name, maxRupees: c.maxAmount ? String(c.maxAmount / 100) : '', displayOrder: c.displayOrder }} />
          <CategoryActiveToggle id={String(c._id)} name={c.name} active={c.isActive} />
        </span>
      ),
    },
  ]
  const activeCategories = categories.filter((c) => c.isActive).map((c) => ({ value: String(c._id), label: c.name }))

  return (
    <>
      <PageHeader
        title="Claim forms"
        help="claims-vs-expenses"
        description="Shareable links where people file expenses, and the categories they can claim under."
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/claims', label: 'Claims' }}
        actions={
          tab === 'forms' ? (
            <ClaimFormDialog categories={activeCategories} employees={employees.map((e) => ({ value: String(e._id), label: `${e.fullName} (${e.code})` }))} today={today} payrollMonth={monthOf(today)} orgSlug={ctx.org.slug} deadline={addDays(today, 9)} />
          ) : (
            <>
              <LoadStandardCategories />
              <CategoryDialog />
            </>
          )
        }
      >
        <LinkTabs tabs={[{ href: BASE, label: 'Forms', count: forms.length, icon: <FileText /> }, { href: `${BASE}?tab=categories`, label: 'Categories', count: categories.filter((c) => c.isActive).length, icon: <Tags /> }]} />
      </PageHeader>
      {tab === 'forms' ? (
        <ListCard label="Forms" icon={<FileText />} description="Each form is a link people open to file claims">
          <DataTable
            className={LIST_FLUSH}
            columns={formColumns}
            rows={forms}
            rowKey={(f) => String(f._id)}
            rowHref={(f) => `${BASE}/${f._id}`}
            empty={<EmptyState compact icon={<ClipboardList />} title="No claim forms yet" description="Create a claim form and share its link so the team can submit expenses." />}
          />
        </ListCard>
      ) : (
        <ListCard label="Categories" icon={<Tags />} description="What people can claim under, with an optional ceiling per claim">
          <DataTable
            className={LIST_FLUSH}
            columns={categoryColumns}
            rows={categories}
            rowKey={(c) => String(c._id)}
            empty={<EmptyState compact icon={<Tags />} title="No categories yet" description="Load the standard set (Travel, Fuel, Food, Client Meeting…) or add your own." action={<LoadStandardCategories />} />}
          />
        </ListCard>
      )}
    </>
  )
}
