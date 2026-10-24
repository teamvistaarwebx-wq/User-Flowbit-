import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ChevronLeft, Clock3, FolderOpen, Layers, Link2, Paperclip, Users } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { timeAgo } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress, SegmentedBar } from '@/components/ui/progress'
import { Swatch } from '@/components/ui/swatch'
import { LinkTabs } from '@/components/ui/tabs'
import { STATUS_LABEL, TASK_STATUSES } from '@/modules/work/tasks/constants'
import { canManageSpace, hasFullSpaceAccess } from '@/modules/work/spaces/access'
import { findSpace, spaceFolders, spaceOverview, type FolderRow } from '@/modules/work/spaces/queries'
import { parseTaskQuery } from '@/modules/work/tasks/filters'
import { taskData } from '@/modules/work/tasks/options'
import { peopleIndex } from '@/modules/work/tasks/people'
import { getViewer } from '@/modules/work/tasks/viewer'
import { FolderList } from '@/components/work/spaces/folder-list'
import { SpaceTile } from '@/components/work/spaces/space-icon'
import { SpaceMembers } from '@/components/work/spaces/space-members'
import { SpaceMenu } from '@/components/work/spaces/space-menu'
import { StatusIcon } from '@/components/work/tasks/task-bits'
import { TaskWorkspace } from '@/components/work/tasks/task-workspace'
import { PanelHeader } from '@/components/work/shared/table'

export const metadata: Metadata = { title: 'Space' }

/** Status fills for the space's thick bar (Figma: in progress #6160FF, blocked #FAB5E8, completed #08AD93). */
const STATUS_FILL: Record<(typeof TASK_STATUSES)[number], string> = { todo: '#5A585B', in_progress: '#6160FF', in_review: '#8B6CC4', blocked: '#FAB5E8', done: '#08AD93' }

function Overview({ overview, folders }: { overview: Awaited<ReturnType<typeof spaceOverview>>; folders: FolderRow[] }) {
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name
  const total = TASK_STATUSES.reduce((sum, s) => sum + (overview.byStatus[s] ?? 0), 0)
  return (
    <div className="grid grid-cols-12 gap-3">
      {/* Hero strip, like Home's workday timeline: the space's tasks by status as one thick bar. */}
      <section className="glass col-span-12 rounded-[16px] bg-white/[0.05] px-[17px] pb-4 pt-3.5">
        <SegmentedBar showLegend={false} segments={TASK_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: overview.byStatus[s] ?? 0, tone: 'neutral' as const, color: STATUS_FILL[s] }))} />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white">
          {TASK_STATUSES.map((s) => (
            <li key={s} className="inline-flex items-center gap-2">
              <Swatch color={STATUS_FILL[s]} shape="round" />
              {STATUS_LABEL[s]}
              <span className="font-semibold tabular-nums">{overview.byStatus[s] ?? 0}</span>
            </li>
          ))}
          <li className="ml-auto text-[13px] tabular-nums text-[#959596]">{total} {total === 1 ? 'task' : 'tasks'}</li>
        </ul>
      </section>
      <section className="card-table col-span-12 overflow-hidden lg:col-span-7">
        <PanelHeader icon={<Clock3 />} title="Recent" subtitle="Tasks changed most recently" className="px-[23px] pb-3 pt-[17px]" />
        {overview.recent.length === 0 ? <div className="border-t border-line"><EmptyState compact icon={<Clock3 />} title="No tasks yet" description="Add a list, then tasks inside it." /></div> : null}
        {overview.recent.length ? (
          <ul className="border-t border-line px-2.5 py-2">
            {overview.recent.map((t) => (
              <li key={t.id}>
                <Link href={`/app/work/tasks/${t.id}`} className="group flex h-9 items-center gap-[11px] rounded-lg px-3 text-sm transition-colors hover:bg-white/[0.04]">
                  <StatusIcon status={t.status as (typeof TASK_STATUSES)[number]} />
                  <span className="min-w-0 flex-1 truncate text-white transition-colors group-hover:text-blush">{t.title}</span>
                  {folderName(t.folderId) ? <span className="hidden text-[13px] text-[#979797] sm:inline">{folderName(t.folderId)}</span> : null}
                  <span className="w-20 text-right text-[13px] text-[#979797]">{timeAgo(t.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <Card variant="solid" className="col-span-12 lg:col-span-5">
        <CardHeader label="Lists" icon={<Layers />} description="Done out of all tasks in each list" />
        {folders.length === 0 ? <p className="text-[13px] text-fg-2">No lists yet.</p> : null}
        <ul className="space-y-4">
          {folders.map((f) => (
            <li key={f.id}>
              <Progress value={f.total ? (f.done / f.total) * 100 : 0} label={`${f.name} · ${f.done}/${f.total}`} />
            </li>
          ))}
        </ul>
      </Card>
      <Card variant="solid" className="col-span-12">
        <CardHeader label="Resources" icon={<Paperclip />} description="Files and links on this space's tasks." />
        {overview.resources.length === 0 ? <p className="text-[13px] text-fg-2">No files or links yet.</p> : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {overview.resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/[0.16]">
              {r.kind === 'link' ? <Link2 className="size-4 shrink-0 text-icon-muted" /> : <Paperclip className="size-4 shrink-0 text-icon-muted" />}
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-white transition-colors hover:text-blush">{r.title}</a>
              <Link href={`/app/work/tasks/${r.taskId}`} className="text-xs tabular-nums text-[#979797] transition-colors hover:text-white">{r.taskKey}</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

export default async function SpacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ product: 'work', perm: 'tasks.read' })
  const viewer = await getViewer(ctx)
  const space = await findSpace(ctx, id)
  if (!space) notFound()
  const me = viewer.memberId
  const full = hasFullSpaceAccess(me, ctx.can('spaces.manage'), space)
  const [folders, archivedFolders] = await Promise.all([
    spaceFolders(ctx, viewer, space, { full, archived: false }),
    full ? spaceFolders(ctx, viewer, space, { full, archived: true }) : Promise.resolve([] as FolderRow[]),
  ])
  if (!full && folders.length === 0) redirect('/app/work/spaces')
  const tab = first(sp.tab) ?? (full ? 'overview' : 'tasks')
  const base = `/app/work/spaces/${id}`
  const folderId = first(sp.folder) ?? null
  const data = await taskData(ctx, viewer)
  const people = peopleIndex(data.people)
  const memberIds = [...new Set([String(space.createdById), ...(space.members ?? []).map((m) => String(m.memberId))])]
  const canManage = canManageSpace(me, ctx.can('spaces.manage'), space)

  let body: ReactNode
  if (tab === 'tasks') {
    const query = { ...parseTaskQuery(sp), space: id, personal: false }
    body = <TaskWorkspace ctx={ctx} viewer={viewer} data={data} query={query} basePath={`${base}?tab=tasks`} pathname={base} sp={sp} locked={['space', 'personal']} />
  } else if (tab === 'members') {
    body = <Card variant="solid"><SpaceMembers spaceId={id} spaceName={space.name} memberIds={memberIds} creatorId={String(space.createdById)} people={data.people} me={me} canManage={canManage} /></Card>
  } else {
    body = <Overview overview={await spaceOverview(ctx, viewer, space, { full, folderId })} folders={folders} />
  }

  return (
    <>
      <header className="mb-6 animate-slide-up space-y-4">
        <Link href="/app/work/spaces" className="inline-flex items-center gap-1 text-[13px] text-fg-2 transition-colors hover:text-white"><ChevronLeft className="size-3.5" /> Spaces</Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <SpaceTile icon={space.icon ?? 'folder'} color={space.color ?? '#818CF8'} size="lg" />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-xl font-medium leading-7 text-white">
                {space.name} {space.archivedAt ? <Badge tone="warning">Archived</Badge> : null}
              </h1>
              <p className="mt-0.5 text-sm text-white/70">{space.description ?? (full ? 'Lists of tasks for this area.' : 'You see your own tasks in this space.')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`${base}?tab=members`} className="flex items-center gap-2 text-[13px] text-fg-2 transition-colors hover:text-white">
              <AvatarStack size="sm" max={5} people={people.many(memberIds).map((p) => ({ name: p.name, src: p.avatarUrl }))} />
              <Users className="size-3.5" /> Share
            </Link>
            {canManage ? <SpaceMenu space={{ id, name: space.name, description: space.description ?? null, color: space.color ?? '#818CF8', icon: space.icon ?? 'folder' }} archived={Boolean(space.archivedAt)} variant="button" /> : null}
          </div>
        </div>
        <LinkTabs tabs={[...(full ? [{ href: base, label: 'Overview' }] : []), { href: `${base}?tab=tasks`, label: 'Tasks' }, { href: `${base}?tab=members`, label: 'Members', count: memberIds.length }]} />
      </header>
      <div className="grid grid-cols-12 gap-3">
        <aside className="col-span-12 lg:col-span-3">
          <Card variant="solid" className="rounded-[10px] p-3">
            <CardHeader label="Lists" icon={<FolderOpen />} className="mb-2 px-2 pt-1" />
            <FolderList spaceId={id} basePath={base} folders={folders} archived={archivedFolders} activeFolderId={tab === 'tasks' ? folderId : null} canEdit={full && ctx.can('tasks.write')} />
          </Card>
        </aside>
        <div className="col-span-12 min-w-0 lg:col-span-9">{body}</div>
      </div>
    </>
  )
}
