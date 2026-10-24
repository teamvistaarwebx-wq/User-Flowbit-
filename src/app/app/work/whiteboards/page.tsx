import type { Metadata } from 'next'
import { PenTool } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { buildHref, parseListParams, type SearchParams } from '@/lib/list'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { PillLinks } from '@/components/work/teams/pill-links'
import { BoardCard } from '@/components/work/whiteboards/board-card'
import { NewBoardButton } from '@/components/work/whiteboards/new-board-button'
import { listPeople } from '@/modules/work/teams/people'
import { BOARDS_PAGE_SIZE, BOARD_TABS, listBoards, type BoardTab } from '@/modules/work/whiteboards/queries'

export const metadata: Metadata = { title: 'Whiteboards' }
const BASE = '/app/work/whiteboards'
const TAB_LABELS: Record<BoardTab, string> = { mine: 'Mine', shared: 'Shared with me', all: 'All' }

export default async function WhiteboardsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work' })
  const p = parseListParams(sp, { pageSize: BOARDS_PAGE_SIZE })
  const tabs = BOARD_TABS.filter((t) => t !== 'all' || ctx.can('tasks.manage'))
  const tab = (tabs as readonly string[]).includes(p.get('tab') ?? '') ? (p.get('tab') as BoardTab) : 'mine'
  const sort = p.get('sort') === 'created' ? 'created' : 'updated'
  const [{ boards, total }, people] = await Promise.all([listBoards(ctx, { tab, q: p.q, sort, page: p.page }), listPeople(ctx)])
  const pick = people.filter((x) => x.id !== String(ctx.memberId)).map((x) => ({ id: x.id, name: x.name, title: x.title }))
  const canWrite = ctx.can('whiteboards.write')

  return (
    <>
      <PageHeader title="Whiteboards" description="Sketch flows and ideas; boards save with the workspace as you draw." breadcrumb={breadcrumbFor(BASE)} icon={<PenTool />} actions={<><SearchInput placeholder="Search boards" />{canWrite ? <NewBoardButton /> : null}</>}>
        <div className="flex flex-wrap items-center gap-3">
          <PillLinks active={tab} items={tabs.map((t) => ({ key: t, label: TAB_LABELS[t], href: buildHref(BASE, sp, { tab: t === 'mine' ? undefined : t, page: undefined }) }))} />
          <PillLinks active={sort} items={[{ key: 'updated', label: 'Last updated', href: buildHref(BASE, sp, { sort: undefined, page: undefined }) }, { key: 'created', label: 'Date created', href: buildHref(BASE, sp, { sort: 'created', page: undefined }) }]} />
        </div>
      </PageHeader>
      {boards.length === 0 ? (
        <div className="card-solid">
          <EmptyState
            icon={<PenTool />}
            title={p.q ? `No boards match "${p.q}"` : tab === 'shared' ? 'Nothing shared with you yet' : 'No whiteboards yet'}
            description={tab === 'shared' ? 'Boards people share with you show up here.' : 'Start a board to map a flow, plan a launch or think out loud.'}
            action={canWrite && tab !== 'shared' ? <NewBoardButton /> : undefined}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards.map((b) => <BoardCard key={b.id} board={b} people={pick} />)}
          </div>
          <Pagination page={p.page} pageSize={BOARDS_PAGE_SIZE} total={total} basePath={BASE} params={sp} />
        </>
      )}
    </>
  )
}
