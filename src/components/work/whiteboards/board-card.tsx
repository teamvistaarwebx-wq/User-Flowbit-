'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Copy, Pencil, PenTool, Trash2, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAction } from '@/components/ui/action-form'
import { TimeAgo } from '@/components/ui/time-ago'
import { deleteWhiteboard, duplicateWhiteboard } from '@/modules/work/whiteboards/actions'
import type { PickPerson } from '../teams/people-picker'
import { RenameBoardDialog, ShareBoardDialog } from './board-dialogs'

export type BoardCardData = { id: string; title: string; owner: string; updatedAt: string; thumbnail?: string; sharedWith: string[]; isOwner: boolean; canEdit: boolean; canWrite: boolean; canDelete: boolean }

/** Grid card: SVG preview, title, owner, last edit, and quick actions. */
export function BoardCard({ board, people }: { board: BoardCardData; people: PickPerson[] }) {
  const [duplicate, duplicating] = useAction(duplicateWhiteboard)
  return (
    <article className="glass lift group relative overflow-hidden rounded-[10px] p-0">
      <Link href={`/app/work/whiteboards/${board.id}`} className="block aspect-[16/10] border-b border-white/[0.08] bg-[#121212]" aria-label={`Open ${board.title}`}>
        {board.thumbnail ? (
          <Image src={board.thumbnail} alt="" width={320} height={200} unoptimized className="size-full object-contain p-3" />
        ) : (
          <span className="flex size-full items-center justify-center text-icon-muted">
            <PenTool className="size-8 stroke-[1.25]" />
          </span>
        )}
      </Link>
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link href={`/app/work/whiteboards/${board.id}`} className="block truncate text-sm font-semibold text-white transition-colors hover:text-blush">{board.title}</Link>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#979797]">
            <Avatar name={board.owner} size="xs" /> {board.owner} · <TimeAgo value={board.updatedAt} />
            {board.sharedWith.length ? <span className="inline-flex items-center gap-0.5"><UsersRound className="size-3" />{board.sharedWith.length}</span> : null}
          </p>
        </div>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 rounded-full border border-white/[0.12] bg-menu/95 p-1 opacity-0 backdrop-blur transition-opacity focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">
        {board.canEdit ? <RenameBoardDialog id={board.id} title={board.title} trigger={<IconButton label="Rename" size="sm"><Pencil className="size-4" /></IconButton>} /> : null}
        {board.isOwner ? <ShareBoardDialog id={board.id} title={board.title} sharedWith={board.sharedWith} people={people} trigger={<IconButton label="Share" size="sm"><UsersRound className="size-4" /></IconButton>} /> : null}
        {board.canWrite ? (
          <IconButton label="Duplicate" size="sm" loading={duplicating} onClick={() => duplicate({ id: board.id })}>
            <Copy className="size-4" />
          </IconButton>
        ) : null}
        {board.canDelete ? (
          <ConfirmDialog trigger={<IconButton label="Delete" size="sm"><Trash2 className="size-4" /></IconButton>} title={`Delete '${board.title}'?`} description="The board disappears for everyone it is shared with." confirmLabel="Delete" onConfirm={() => deleteWhiteboard({ id: board.id })} />
        ) : null}
      </div>
    </article>
  )
}
