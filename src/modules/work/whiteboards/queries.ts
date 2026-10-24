import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { escapeRegex } from '@/lib/utils'
import { Whiteboard } from '@/models/work/Whiteboard'
import { peopleMap } from '../teams/people'
import { boardScope, canEditBoard, isOwner } from './access'

export const BOARD_TABS = ['mine', 'shared', 'all'] as const
export type BoardTab = (typeof BOARD_TABS)[number]
export const BOARDS_PAGE_SIZE = 24

export async function listBoards(ctx: Ctx, opts: { tab: BoardTab; q: string; sort: 'updated' | 'created'; page: number }) {
  const me = ctx.memberId
  const tabFilter = opts.tab === 'mine' ? { ownerId: me } : opts.tab === 'shared' ? { sharedWith: me } : boardScope(ctx)
  const filter = { archivedAt: null, ...tabFilter, ...(opts.q ? { title: new RegExp(escapeRegex(opts.q), 'i') } : {}) }
  const [rows, total] = await Promise.all([
    ctx.db(Whiteboard).find(filter, { scene: 0 }).sort(opts.sort === 'created' ? { createdAt: -1 } : { updatedAt: -1 }).skip((opts.page - 1) * BOARDS_PAGE_SIZE).limit(BOARDS_PAGE_SIZE).lean(),
    ctx.db(Whiteboard).countDocuments(filter),
  ])
  const people = await peopleMap(ctx, rows.map((r) => r.ownerId))
  return {
    total,
    boards: rows.map((b) => ({
      id: String(b._id),
      title: b.title,
      owner: people.get(String(b.ownerId))?.name ?? 'Former member',
      updatedAt: b.updatedAt.toISOString(),
      thumbnail: b.thumbnail ?? undefined,
      sharedWith: b.sharedWith.map(String),
      isOwner: isOwner(ctx, b),
      canEdit: canEditBoard(ctx, { ownerId: b.ownerId, sharedWith: b.sharedWith }),
      canWrite: ctx.can('whiteboards.write'),
      canDelete: isOwner(ctx, b) || ctx.can('tasks.manage'),
    })),
  }
}
