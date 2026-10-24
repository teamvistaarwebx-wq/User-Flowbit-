import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronDown, Download, ScrollText } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatTime } from '@/lib/dates'
import { buildHref, parseListParams, type SearchParams } from '@/lib/list'
import { isBuiltInRole, roleLabel } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { FilterPills } from '@/components/settings/filter-pills'
import { TableCard } from '@/components/settings/surface'
import { UrlDate } from '@/components/settings/url-date'
import { UrlSelect } from '@/components/settings/url-select'
import { AuditLog } from '@/models/AuditLog'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { auditLinks } from '@/modules/settings/audit-links'
import { changeRows, isSensitiveAction } from '@/modules/settings/audit-meta'
import { auditFilter } from '@/modules/settings/audit-query'

export const metadata: Metadata = { title: 'Audit log' }
const BASE = '/app/settings/audit'
const PAGE_SIZE = 50
const FILTER_KEYS = ['q', 'actor', 'entity', 'action', 'product', 'from', 'to']

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ perm: 'audit.read' })
  const p = parseListParams(sp, { pageSize: PAGE_SIZE })
  const filter = auditFilter(p)
  const Logs = ctx.db(AuditLog)
  const [found, entities, actions, members, anyRows] = await Promise.all([
    Logs.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(PAGE_SIZE + 1).lean(),
    Logs.distinct('entity'),
    Logs.distinct('action'),
    ctx.db(Member).find({ status: { $ne: 'invited' } }, { userId: 1 }).lean(),
    Logs.exists({}),
  ])
  const rows = found.slice(0, PAGE_SIZE)
  const links = await auditLinks(ctx, rows)
  const hasOlder = found.length > PAGE_SIZE
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).sort({ name: 1 }).lean()
  const filtered = FILTER_KEYS.some((k) => p.get(k))
  const exportHref = buildHref('/api/settings/audit/export', sp, { page: undefined })

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Entries can't be edited or deleted."
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <a href={exportHref} className={buttonClass('secondary')}>
            <Download className="size-4" strokeWidth={1.5} /> Export CSV
          </a>
        }
      />

      <TableCard
        icon={<ScrollText strokeWidth={1.5} />}
        label="Activity"
        description={filtered ? 'Showing entries that match your filters' : 'Showing every change, newest first'}
        actions={
          <FilterPills
            label="Filter by product"
            items={[
              { href: buildHref(BASE, sp, { product: undefined, page: undefined }), label: 'All', active: !p.get('product') },
              ...(['workspace', 'work', 'muster', 'orbit', 'folio'] as const).map((k) => ({ href: buildHref(BASE, sp, { product: k, page: undefined }), label: k.charAt(0).toUpperCase() + k.slice(1), active: p.get('product') === k })),
            ]}
          />
        }
        toolbar={
          <>
            <SearchInput placeholder="Search summaries" />
            <UrlSelect param="actor" label="Who" className="sm:w-40" options={[{ value: 'all', label: 'Everyone' }, { value: 'support', label: 'Flowbit support' }, { value: 'system', label: 'System' }, ...users.map((u) => ({ value: String(u._id), label: u.name }))]} />
            <UrlSelect param="entity" label="Entity" className="sm:w-40" options={[{ value: 'all', label: 'All entities' }, ...entities.filter(Boolean).sort().map((e) => ({ value: String(e), label: String(e) }))]} />
            <UrlSelect param="action" label="Action" className="sm:w-44" options={[{ value: 'all', label: 'All actions' }, ...actions.filter(Boolean).sort().map((a) => ({ value: String(a), label: String(a) }))]} />
            <div className="flex flex-wrap items-center gap-2">
              <UrlDate param="from" label="From" />
              <UrlDate param="to" label="To" />
            </div>
          </>
        }
      >
        {rows.length ? (
          <div className="border-t border-line">
            <div aria-hidden className="hidden h-[33px] grid-cols-[6.5rem_12rem_1fr_1rem] items-center gap-3 border-b border-line px-[23px] text-sm text-white sm:grid">
              <span>When</span>
              <span>Who</span>
              <span>What changed</span>
              <span />
            </div>
            <div className="py-1.5">
              {rows.map((row) => {
                const changes = changeRows(row.meta)
                const meta = (row.meta ?? {}) as { reason?: string; from?: string; to?: string }
                const href = links.get(`${row.entity}:${row.entityId}`) ?? null
                const who = row.platform ? (row.actorName === 'System' ? 'System' : 'Flowbit support') : (row.actorName ?? 'Unknown')
                return (
                  <details key={String(row._id)} className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[5.5rem_1fr_1rem] items-start gap-3 px-[23px] py-2.5 transition-colors hover:bg-white/[0.04] group-open:bg-white/[0.04] sm:grid-cols-[6.5rem_12rem_1fr_1rem]">
                      <span className="text-xs leading-tight tabular-nums text-[#979797]">
                        {formatDate(row.createdAt, { short: true })}
                        <br />
                        {formatTime(row.createdAt)}
                      </span>
                      <span className="hidden items-center gap-2 sm:flex">
                        <Avatar name={who} size="xs" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-white">{who}</span>
                          {row.actorRole ? <span className="block truncate text-[11px] text-[#979797]">{isBuiltInRole(row.actorRole) ? roleLabel(row.actorRole) : row.actorRole}</span> : null}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] text-white">{row.summary}</span>
                        <span className={cn('mt-0.5 block font-mono text-[11px]', isSensitiveAction(row.action) ? 'text-[#FF6A66]' : 'text-[#979797]')}>
                          {row.action}
                          <span className="font-sans sm:hidden"> · {who}</span>
                        </span>
                      </span>
                      <ChevronDown className="mt-0.5 size-4 text-icon-muted transition-transform group-open:rotate-180" strokeWidth={1.5} />
                    </summary>
                    <div className="space-y-3 border-y border-line/60 bg-black/[0.12] px-[23px] pb-4 pt-3 text-xs text-white/80 sm:pl-[calc(23px+6.5rem+0.75rem)]">
                      <p>
                        Entity:{' '}
                        {href ? <Link href={href} className="text-link hover:underline">{row.entity}</Link> : row.entity}
                        {row.entityId ? <span className="text-[#979797]"> · {row.entityId}</span> : null}
                      </p>
                      {changes.length ? (
                        <div className="overflow-x-auto rounded-[10px] bg-control">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-line text-left text-white">
                                <th scope="col" className="px-3 py-2 font-normal">Field</th>
                                <th scope="col" className="px-3 py-2 font-normal">Before</th>
                                <th scope="col" className="px-3 py-2 font-normal">After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((c) => (
                                <tr key={c.field}>
                                  <td className="px-3 py-2 font-medium text-white">{c.field}</td>
                                  <td className="max-w-xs truncate px-3 py-2 text-[#FF6A66]">{c.before}</td>
                                  <td className="max-w-xs truncate px-3 py-2 text-[#2DCBAF]">{c.after}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {meta.from || meta.to ? <p>From {meta.from ?? '—'} to {meta.to ?? '—'}</p> : null}
                      {meta.reason ? <p>Reason: {meta.reason}</p> : null}
                      <p className="text-[#979797]">
                        {row.ip ? `IP ${row.ip}` : 'IP not recorded'}
                        {row.userAgent ? ` · ${row.userAgent}` : ''}
                      </p>
                    </div>
                  </details>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="border-t border-line">
            {p.page > 1 ? (
              <EmptyState compact icon={<ScrollText />} title={`Nothing as far back as page ${p.page}.`} action={<Link href={buildHref(BASE, sp, { page: undefined })} className={buttonClass('secondary')}>Newest</Link>} />
            ) : filtered && anyRows ? (
              <EmptyState compact icon={<ScrollText />} title="No entries match these filters." action={<Link href={BASE} className={buttonClass('secondary')}>Clear filters</Link>} />
            ) : (
              <EmptyState icon={<ScrollText />} title="Nothing recorded yet" description="Changes to people, salaries, payroll, letters, invoices, roles, members and your subscription appear here as they happen." />
            )}
          </div>
        )}
      </TableCard>

      {rows.length && (p.page > 1 || hasOlder) ? (
        <nav className="mt-4 flex items-center justify-between text-xs text-[#979797]" aria-label="Audit pages">
          {p.page > 1 ? <Link href={buildHref(BASE, sp, { page: p.page - 1 === 1 ? undefined : p.page - 1 })} className={buttonClass('ghost', 'sm')}>← Newer</Link> : <span />}
          <span>Page {p.page}</span>
          {hasOlder ? <Link href={buildHref(BASE, sp, { page: p.page + 1 })} className={buttonClass('ghost', 'sm')}>Older →</Link> : <span />}
        </nav>
      ) : null}
    </>
  )
}
