import type { Metadata } from 'next'
import Link from 'next/link'
import { LayoutGrid, Plus } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Progress } from '@/components/ui/progress'
import { SearchInput } from '@/components/ui/search-input'
import { listSpaces, type SpaceCard } from '@/modules/work/spaces/queries'
import { getPeople, peopleIndex } from '@/modules/work/tasks/people'
import { getViewer } from '@/modules/work/tasks/viewer'
import { PillLinks } from '@/components/work/tasks/pill-links'
import { SpaceFormDialog } from '@/components/work/spaces/space-form-dialog'
import { SpaceTile } from '@/components/work/spaces/space-icon'
import { SpaceMenu } from '@/components/work/spaces/space-menu'

export const metadata: Metadata = { title: 'Spaces' }

/** A space as a small glass tile (radius 10): tile + name, the open/total as a 16px bar, lists and people. */
function Card({ space, people }: { space: SpaceCard; people: ReturnType<typeof peopleIndex> }) {
  const done = space.total - space.open
  return (
    <div className="glass lift group relative flex flex-col gap-4 rounded-[10px] p-4">
      <div className="flex items-start gap-3">
        <SpaceTile icon={space.icon} color={space.color} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/work/spaces/${space.id}`} className="block truncate text-[15px] font-semibold leading-5 text-white after:absolute after:inset-0 after:rounded-[10px] after:content-['']">
            {space.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-[#959596]">{space.description ?? 'No description'}</p>
        </div>
        {space.canManage ? (
          <div className="relative z-10 opacity-55 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
            <SpaceMenu space={{ id: space.id, name: space.name, description: space.description, color: space.color, icon: space.icon }} archived={space.archived} />
          </div>
        ) : null}
      </div>
      {space.shared || space.access === 'scoped' || space.archived ? (
        <div className="flex flex-wrap gap-1.5">
          {space.shared ? <Badge tone="violet">Shared with you</Badge> : null}
          {space.access === 'scoped' ? <Badge>Your tasks only</Badge> : null}
          {space.archived ? <Badge tone="warning">Archived</Badge> : null}
        </div>
      ) : null}
      <Progress className="mt-auto" value={space.total ? (done / space.total) * 100 : 0} label={`${space.open} open of ${space.total} tasks`} />
      <div className="flex items-center justify-between text-[13px] text-[#979797]">
        <span>{space.folderCount} {space.folderCount === 1 ? 'list' : 'lists'}</span>
        <AvatarStack size="xs" max={4} people={people.many(space.memberIds).map((p) => ({ name: p.name, src: p.avatarUrl }))} />
      </div>
    </div>
  )
}

export default async function SpacesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'tasks.read' })
  const viewer = await getViewer(ctx)
  const archived = first(sp.archived) === '1'
  const q = (first(sp.q) ?? '').trim().slice(0, 100)
  const [spaces, people] = await Promise.all([listSpaces(ctx, viewer, { archived, q }), getPeople(ctx)])
  const index = peopleIndex(people)
  const canCreate = ctx.can('tasks.write')
  const newButton = canCreate ? <SpaceFormDialog trigger={<Button variant="primary" icon={<Plus className="size-4" />}>New space</Button>} /> : null

  return (
    <>
      <PageHeader title="Spaces" help="work-structure" description="Where ongoing work lives, usually one per team or area, as lists of tasks. Projects are for deliverables with dates; both are optional." icon={<LayoutGrid />} breadcrumb={breadcrumbFor('/app/work/spaces')} actions={newButton}>
        <div className="flex flex-wrap items-center gap-3">
          <PillLinks items={[{ href: '/app/work/spaces', label: 'Active', active: !archived }, { href: '/app/work/spaces?archived=1', label: 'Archived', active: archived }]} />
          <SearchInput placeholder="Search spaces" />
        </div>
      </PageHeader>
      {spaces.length === 0 ? (
        <div className="card-solid">
          <EmptyState
            icon={<LayoutGrid />}
            title={q ? `No spaces match "${q}"` : archived ? 'No archived spaces' : 'No spaces yet'}
            description={q || archived ? undefined : 'Spaces group lists of tasks by team or area.'}
            action={!q && !archived ? newButton : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((s) => <Card key={s.id} space={s} people={index} />)}
        </div>
      )}
    </>
  )
}
