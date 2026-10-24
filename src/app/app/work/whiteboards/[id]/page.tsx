import type { Metadata } from 'next'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/ctx'
import { BoardWorkspace } from '@/components/work/whiteboards/board-workspace'
import { Whiteboard } from '@/models/work/Whiteboard'
import { listPeople, nameOf, peopleMap } from '@/modules/work/teams/people'
import { boardScope, canEditBoard, isOwner } from '@/modules/work/whiteboards/access'

export const metadata: Metadata = { title: 'Whiteboard' }

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ product: 'work' })
  if (!isValidObjectId(id)) notFound()
  const board = await ctx.db(Whiteboard).findOne({ _id: id, archivedAt: null, ...boardScope(ctx) }).lean()
  if (!board) notFound()
  const [people, owners] = await Promise.all([listPeople(ctx), peopleMap(ctx, [board.ownerId])])
  const scene = board.scene ?? { elements: [], appState: {}, files: {} }
  return (
    <BoardWorkspace
      board={{
        id: String(board._id),
        title: board.title,
        owner: nameOf(owners, board.ownerId),
        sharedWith: board.sharedWith.map(String),
        version: board.version,
        scene: JSON.parse(JSON.stringify({ elements: scene.elements ?? [], appState: scene.appState ?? {}, files: scene.files ?? {} })),
      }}
      editable={canEditBoard(ctx, board)}
      isOwner={isOwner(ctx, board)}
      people={people.filter((p) => p.id !== String(ctx.memberId)).map((p) => ({ id: p.id, name: p.name, title: p.title }))}
    />
  )
}
