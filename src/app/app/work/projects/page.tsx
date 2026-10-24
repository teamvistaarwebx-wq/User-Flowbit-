import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpDown, FolderKanban, LayoutGrid, Table2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { AvatarStack } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button-styles'
import { DataTable, type Column } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { Progress } from '@/components/ui/progress'
import { SearchInput } from '@/components/ui/search-input'
import { HEALTH_LABEL, PROJECT_HEALTH, PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from '@/modules/work/projects/constants'
import { parseProjectQuery, PROJECT_SORT_LABEL, PROJECT_SORTS } from '@/modules/work/projects/filters'
import { listProjects, type ProjectSummary } from '@/modules/work/projects/queries'
import { clientOptions } from '@/modules/work/tasks/options'
import { getPeople } from '@/modules/work/tasks/people'
import { PillLinks } from '@/components/work/tasks/pill-links'
import { NewProjectDialog } from '@/components/work/projects/new-project-dialog'
import { HealthPill, ProjectCard, ProjectTile } from '@/components/work/projects/project-card'

export const metadata: Metadata = { title: 'Projects' }

const BASE = '/app/work/projects'

/** Filter chips: the #171717 pill with a translucent hairline; the chosen one is the Figma violet. */
const chip = (active: boolean) =>
  `press inline-flex h-7 items-center rounded-full border px-3 transition-colors duration-150 ${active ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.12] bg-control text-white/80 hover:border-white/25 hover:text-white'}`
const FILTER_LABEL = 'text-xs font-semibold uppercase tracking-[0.06em] text-fg-2'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'projects.read' })
  const q = parseProjectQuery(sp)
  const [{ rows, total, pageSize }, people, clients] = await Promise.all([listProjects(ctx, q), getPeople(ctx), clientOptions(ctx)])
  const nameOf = new Map(people.map((p) => [p.id, p]))
  const canCreate = ctx.can('projects.write')
  const canDelete = ctx.can('org.manage')
  const href = (patch: Record<string, string | undefined>) => buildHref(BASE, sp, { ...patch, page: undefined })
  const filtered = Boolean(q.q || q.status || q.health || q.client || q.mine)
  const newButton = canCreate ? <NewProjectDialog people={people} clients={clients} me={String(ctx.memberId)} canCreateClient={ctx.can('clients.write')} /> : null

  const columns: Column<ProjectSummary>[] = [
    { key: 'name', header: 'Name', cell: (p) => <span className="flex items-center gap-2"><ProjectTile name={p.name} color={p.color} logoUrl={p.logoUrl} /><span><span className="block text-white">{p.name}</span><span className="text-xs tabular-nums text-[#979797]">{p.code}</span></span></span> },
    { key: 'client', header: 'Client', hideOnMobile: true, cell: (p) => p.clientName ?? 'Internal' },
    { key: 'lead', header: 'Lead', hideOnMobile: true, cell: (p) => nameOf.get(p.leadId)?.name ?? '—' },
    { key: 'status', header: 'Status', cell: (p) => <StatusPill status={p.status} label={PROJECT_STATUS_LABEL[p.status as ProjectStatus]} /> },
    { key: 'health', header: 'Health', cell: (p) => <HealthPill health={p.health} /> },
    { key: 'progress', header: 'Progress', cell: (p) => <Progress value={p.progress} className="w-32" label={`${p.counts.completed}/${p.counts.total}`} /> },
    { key: 'due', header: 'Due', hideOnMobile: true, cell: (p) => formatDate(p.endDate) },
    { key: 'members', header: 'Members', hideOnMobile: true, cell: (p) => <AvatarStack size="xs" max={4} people={p.memberIds.map((id) => ({ name: nameOf.get(id)?.name }))} /> },
  ]

  return (
    <>
      <PageHeader title="Projects" help="work-structure" description="Deliverables with dates, owners and health, for clients or internal work. Ongoing work without an end date fits a space." icon={<FolderKanban />} breadcrumb={breadcrumbFor(BASE)} actions={newButton}>
        <div className="flex flex-wrap items-center gap-2">
          <PillLinks items={[{ href: href({ view: undefined }), label: 'Cards', icon: <LayoutGrid />, active: q.view === 'cards' }, { href: href({ view: 'table' }), label: 'Table', icon: <Table2 />, active: q.view === 'table' }]} />
          <PillLinks items={[{ href: href({ archived: undefined }), label: 'Active', active: !q.archived }, { href: href({ archived: '1' }), label: 'Archived', active: q.archived }]} />
          <PillLinks items={[{ href: href({ mine: undefined }), label: 'All projects', active: !q.mine }, { href: href({ mine: '1' }), label: 'My projects', active: q.mine }]} />
          <SearchInput placeholder="Search name or code" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className={FILTER_LABEL}>Status</span>
          {[undefined, ...PROJECT_STATUSES].map((s) => (
            <Link key={s ?? 'all'} href={href({ status: s })} aria-current={q.status === (s ?? null) ? 'true' : undefined} className={chip(q.status === (s ?? null))}>{s ? PROJECT_STATUS_LABEL[s] : 'Any'}</Link>
          ))}
          <span className={`${FILTER_LABEL} ml-3`}>Health</span>
          {[undefined, ...PROJECT_HEALTH].map((h) => (
            <Link key={h ?? 'all'} href={href({ health: h })} aria-current={q.health === (h ?? null) ? 'true' : undefined} className={chip(q.health === (h ?? null))}>{h ? HEALTH_LABEL[h] : 'Any'}</Link>
          ))}
          {clients.length ? (
            <form action={BASE} className="ml-3 flex items-center gap-1.5">
              {Object.entries(sp).filter(([k]) => !['client', 'page'].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={Array.isArray(v) ? v[0] : (v ?? '')} />)}
              <select name="client" defaultValue={q.client ?? ''} className="h-7 rounded-full border border-white/[0.18] bg-white/[0.06] px-2.5 text-[13px] text-white transition-colors hover:border-white/[0.28] focus:border-white/45 focus:outline-none" aria-label="Client">
                <option value="">Any client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="submit" className={buttonClass('secondary', 'sm', 'h-7 px-3')}>Apply</button>
            </form>
          ) : null}
          <span className="ml-auto flex max-w-full flex-wrap items-center gap-1.5">
            <span className={`${FILTER_LABEL} inline-flex items-center gap-1.5`}><ArrowUpDown className="size-3" />Sort</span>
            <span className="flex h-[33px] max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px] [scrollbar-width:none]">
              {PROJECT_SORTS.map((s) => (
                <Link key={s} href={href({ sort: s, dir: q.sort === s && q.dir === 'desc' ? 'asc' : 'desc' })} aria-current={q.sort === s ? 'true' : undefined} className={`press inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-3 transition-colors duration-150 ${q.sort === s ? 'bg-control-active text-white' : 'text-white/75 hover:bg-white/[0.05] hover:text-white'}`}>
                  {PROJECT_SORT_LABEL[s]}{q.sort === s ? (q.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </Link>
              ))}
            </span>
          </span>
        </div>
      </PageHeader>

      {rows.length === 0 ? (
        <div className="card-solid">
          <EmptyState
            icon={<FolderKanban />}
            title={filtered ? 'No projects match these filters' : q.archived ? 'No archived projects' : 'No projects yet'}
            description={filtered ? undefined : q.archived ? undefined : 'Projects hold tasks, milestones and files for one piece of work.'}
            action={filtered ? <Link href={BASE} className={buttonClass('secondary')}>Clear filters</Link> : !q.archived && canCreate ? <Link href={`${BASE}?new=1`} scroll={false} className={buttonClass('primary')}>Create your first project</Link> : undefined}
          />
        </div>
      ) : q.view === 'table' ? (
        <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} rowHref={(p) => `${BASE}/${p.id}`} basePath={BASE} params={sp} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => <ProjectCard key={p.id} project={p} people={people} canDelete={canDelete} />)}
        </div>
      )}
      <Pagination page={q.page} pageSize={pageSize} total={total} basePath={BASE} params={sp} />
    </>
  )
}
