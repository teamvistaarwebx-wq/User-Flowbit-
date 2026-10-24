import type { Metadata } from 'next'
import Link from 'next/link'
import { Types } from 'mongoose'
import { FilePen, FileText, Lock, Mail, MailX, Plus, ScrollText } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref, first, parseListParams, type SearchParams } from '@/lib/list'
import { cn, escapeRegex } from '@/lib/utils'
import { Badge, StatusPill, TONE_TEXT } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { LinkTabs } from '@/components/ui/tabs'
import { FilterChips, SegmentLinks } from '@/components/muster/ui/filter-chips'
import { LIST_FLUSH, ListCard } from '@/components/muster/ui/list-card'
import { TemplateEditor } from '@/components/muster/letters/template-editor'
import { Letter } from '@/models/muster/Letter'
import { CATEGORY_LABELS, LETTERS, LETTERS_BY_CODE, type LetterCategory } from '@/modules/muster/letters/catalogue'
import { customisedCodes, templateWording } from '@/modules/muster/letters/queries'
import { placeholderReference } from '@/modules/muster/letters/render'
import { mayDecideOwn, ownEmployeeId, visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'

export const metadata: Metadata = { title: 'Letters' }
const BASE = '/app/hr/letters'
const STATUSES = ['all', 'draft', 'issued', 'revoked'] as const

export default async function LettersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'letters.read' })
  const tab = first(sp.tab) === 'templates' && ctx.can('letters.templates') ? 'templates' : 'letters'
  const tabs = [{ href: BASE, label: 'Letters', icon: <FileText /> }, ...(ctx.can('letters.templates') ? [{ href: `${BASE}?tab=templates`, label: 'Templates', icon: <ScrollText /> }] : [])]

  return (
    <>
      <PageHeader
        title="Letters"
        description="Offer, experience, relieving and 17 more, numbered and filed on each person's record. Issued letters are never deleted."
        breadcrumb={breadcrumbFor(BASE)}
        actions={ctx.can('letters.write') ? <Button variant="primary" icon={<Plus className="size-4" />} href={`${BASE}/new`}>New letter</Button> : null}
      >
        <LinkTabs tabs={tabs} />
      </PageHeader>
      {tab === 'templates' ? <Templates code={first(sp.code)} canSeePay={ctx.can('payroll.read')} ctx={ctx} /> : <LetterList ctx={ctx} sp={sp} />}
    </>
  )
}

async function LetterList({ ctx, sp }: { ctx: Awaited<ReturnType<typeof requireMember>>; sp: SearchParams }) {
  const p = parseListParams(sp, { pageSize: 25 })
  const status = STATUSES.includes(first(sp.status) as (typeof STATUSES)[number]) ? (first(sp.status) as (typeof STATUSES)[number]) : 'all'
  const category = first(sp.category) as LetterCategory | undefined
  const own = ownEmployeeId(ctx)
  const ownDraftsHidden = own && !mayDecideOwn(ctx) ? own : null
  const filter: Record<string, unknown> = {
    ...visibleFilter(await visibleEmployeeIds(ctx), 'employeeId'),
    ...(status !== 'all' ? { status } : {}),
    ...(category && CATEGORY_LABELS[category] ? { category } : {}),
    ...(ownDraftsHidden ? { $nor: [{ employeeId: new Types.ObjectId(ownDraftsHidden), status: 'draft' }] } : {}),
    ...(p.q ? { $or: [{ employeeName: new RegExp(escapeRegex(p.q), 'i') }, { referenceNumber: new RegExp(escapeRegex(p.q), 'i') }, { templateName: new RegExp(escapeRegex(p.q), 'i') }] } : {}),
  }
  const [rows, total] = await Promise.all([ctx.db(Letter).find(filter, { body: 0, variables: 0, inputs: 0 }).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(), ctx.db(Letter).countDocuments(filter)])
  const canSeePay = ctx.can('payroll.read')
  type Row = (typeof rows)[number]
  const locked = (r: Row) => r.statesPay && !canSeePay
  const columns: Column<Row>[] = [
    { key: 'referenceNumber', header: 'Reference', cell: (r) => <span className="font-mono text-xs text-fg-2">{r.referenceNumber}</span> },
    { key: 'employeeName', header: 'Employee', cell: (r) => <span className="text-white">{r.employeeName}</span> },
    { key: 'templateName', header: 'Letter', cell: (r) => (locked(r) ? <span className="inline-flex items-center gap-1 text-fg-2"><Lock className="size-3" /> Pay letter</span> : r.templateName) },
    { key: 'category', header: 'Category', hideOnMobile: true, cell: (r) => <span className="text-[#979797]">{CATEGORY_LABELS[r.category as LetterCategory] ?? r.category}</span> },
    { key: 'issueDate', header: 'Date', hideOnMobile: true, cell: (r) => <span className="text-[#979797]">{formatDate(r.issueDate)}</span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
    { key: 'emailed', header: 'Emailed', hideOnMobile: true, cell: (r) => (r.emailedAt ? <span className={cn('inline-flex items-center gap-1', TONE_TEXT.success)}><Mail className="size-3" /> {formatDate(r.emailedAt)}</span> : r.emailError ? <span className={cn('inline-flex items-center gap-1', TONE_TEXT.danger)} title={r.emailError}><MailX className="size-3" /> Failed</span> : <span className="text-fg-3">—</span>) },
  ]
  return (
    <>
      <ListCard
        label="Letters"
        icon={<FileText />}
        description={`${total} ${total === 1 ? 'letter' : 'letters'}${category ? ` · ${CATEGORY_LABELS[category]}` : ''}`}
        actions={
          <>
            <SegmentLinks label="Status" items={STATUSES.map((s) => ({ key: s, href: buildHref(BASE, sp, { status: s === 'all' ? undefined : s, page: undefined }), label: s === 'all' ? 'All' : s === 'draft' ? 'Drafts' : s === 'issued' ? 'Issued' : 'Revoked', active: status === s }))} />
            <SearchInput placeholder="Person or reference" className="w-full sm:w-64" />
          </>
        }
        toolbar={<FilterChips label="Category" items={(Object.keys(CATEGORY_LABELS) as LetterCategory[]).map((c) => ({ key: c, href: buildHref(BASE, sp, { category: category === c ? undefined : c, page: undefined }), label: CATEGORY_LABELS[c], active: category === c }))} />}
      >
        <DataTable
          className={LIST_FLUSH}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r._id)}
          rowHref={(r) => (locked(r) ? '' : `${BASE}/${r._id}`)}
          empty={<EmptyState compact icon={<FilePen />} title={p.q || status !== 'all' || category ? 'No letters match those filters' : 'No letters yet'} description={p.q || status !== 'all' || category ? undefined : 'Draft the first from a person’s profile or here.'} action={ctx.can('letters.write') && !p.q ? <Button variant="primary" href={`${BASE}/new`}>New letter</Button> : undefined} />}
        />
      </ListCard>
      <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath={BASE} params={sp} className="mt-4" />
    </>
  )
}

async function Templates({ ctx, code, canSeePay }: { ctx: Awaited<ReturnType<typeof requireMember>>; code?: string; canSeePay: boolean }) {
  const customised = await customisedCodes(ctx)
  const selected = code ? LETTERS_BY_CODE.get(code) : undefined
  const wording = selected ? await templateWording(ctx, selected.code) : null
  return (
    <div className="grid grid-cols-12 gap-3">
      <ListCard className="col-span-12 self-start lg:col-span-4" label="Templates" icon={<ScrollText />} description={`${LETTERS.length} letters · ${customised.size} customised`}>
        <ul className="scroll-fade-y max-h-[720px] overflow-y-auto py-1.5">
          {LETTERS.map((l) => (
            <li key={l.code}>
              <Link href={`${BASE}?tab=templates&code=${l.code}`} scroll={false} aria-current={code === l.code ? 'true' : undefined} className={cn('flex items-center justify-between gap-2 px-5 py-2.5 transition-colors duration-150 hover:bg-white/[0.04] sm:px-[23px]', code === l.code && 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]')}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{l.name}</span>
                  <span className="block text-xs text-fg-2">{CATEGORY_LABELS[l.category]}</span>
                </span>
                {customised.has(l.code) ? <Badge tone="violet">Customised</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      </ListCard>
      <Card variant="solid" className="col-span-12 lg:col-span-8">
        {selected && wording ? (
          <>
            <CardHeader icon={<ScrollText />} title={selected.name} description={selected.purpose} />
            <TemplateEditor code={selected.code} subject={wording.subject} body={wording.body} customised={wording.customised} reference={placeholderReference(canSeePay)} />
          </>
        ) : (
          <EmptyState icon={<ScrollText />} title="Pick a template to edit its wording" description="New drafts use your wording; letters already written keep theirs." />
        )}
      </Card>
    </div>
  )
}
