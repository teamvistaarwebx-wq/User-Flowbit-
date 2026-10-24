'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, Eye, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { renameWhiteboard } from '@/modules/work/whiteboards/actions'
import type { PickPerson } from '../teams/people-picker'
import { ShareBoardDialog } from './board-dialogs'
import { BoardEditor, SaveIndicator, type BoardScene, type SaveStatus } from './board-editor'

type Props = { board: { id: string; title: string; owner: string; sharedWith: string[]; version: number; scene: BoardScene }; editable: boolean; isOwner: boolean; people: PickPerson[] }

/** Editor page chrome: back link, inline title, save state, share. */
export function BoardWorkspace({ board, editable, isOwner, people }: Props) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [title, setTitle] = useState(board.title)
  const [savedTitle, setSavedTitle] = useState(board.title)

  const rename = async () => {
    const next = title.trim()
    if (!next || next === savedTitle) return setTitle(savedTitle)
    const result = await renameWhiteboard({ id: board.id, title: next })
    if (!result.ok) {
      toast.error(result.error)
      setTitle(savedTitle)
      return
    }
    setSavedTitle(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/work/whiteboards" className="inline-flex items-center gap-1 text-[13px] text-fg-2 transition-colors hover:text-white">
          <ChevronLeft className="size-3.5" /> Whiteboards
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          readOnly={!editable}
          maxLength={100}
          aria-label="Whiteboard title"
          className="min-w-0 flex-1 rounded-full border border-transparent bg-transparent px-3 py-1 text-xl font-medium leading-7 text-white transition-[border-color,background-color,box-shadow] hover:border-white/[0.18] focus:border-white/45 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(187,98,165,0.25)] focus:outline-none"
        />
        <span className="text-[13px] text-[#979797]">by {board.owner}</span>
        {editable ? <SaveIndicator status={status} /> : <Badge icon={<Eye className="size-3" />}>View only</Badge>}
        {isOwner ? (
          <ShareBoardDialog id={board.id} title={savedTitle} sharedWith={board.sharedWith} people={people} trigger={<Button variant="secondary" size="sm" icon={<UsersRound className="size-4" />}>Share{board.sharedWith.length ? ` · ${board.sharedWith.length}` : ''}</Button>} />
        ) : null}
      </div>
      <BoardEditor boardId={board.id} initialScene={board.scene} initialVersion={board.version} editable={editable} onStatus={setStatus} />
    </div>
  )
}
