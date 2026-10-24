'use client'

import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Archive, ArchiveRestore, Folder, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import { deleteFolder, reorderFolders, setFolderArchived } from '@/modules/work/spaces/folder-actions'
import type { FolderRow } from '@/modules/work/spaces/queries'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { FolderFormDialog } from './folder-form-dialog'

const DRAG_DISTANCE = 6

function FolderItem({ folder, href, active, canEdit, spaceId }: { folder: FolderRow; href: string; active: boolean; canEdit: boolean; spaceId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id, disabled: !canEdit || folder.archived })
  const [editing, setEditing] = useState(false)
  const [archive] = useAction(setFolderArchived)
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-white/[0.04]', active && 'bg-white/[0.06]', isDragging && 'opacity-40')}>
      {canEdit && !folder.archived ? (
        <button type="button" aria-label={`Reorder ${folder.name}`} className="hit-area relative cursor-grab touch-none rounded p-1 text-fg-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100" {...attributes} {...listeners}>
          <GripVertical className="size-3.5" />
        </button>
      ) : <span className="w-5" />}
      <Link href={href} scroll={false} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-sm">
        <Folder className="size-3.5 shrink-0" style={{ color: folder.color }} aria-hidden />
        <span className={cn('truncate', active ? 'text-white' : 'text-white/80', folder.archived && 'text-fg-3 line-through')}>{folder.name}</span>
        <span className="ml-auto text-xs tabular-nums text-[#979797]">{folder.open}</span>
      </Link>
      {canEdit ? (
        <>
          <DropdownMenu
            trigger={<IconButton label={`Actions for ${folder.name}`} size="sm" className="size-7 opacity-0 group-hover:opacity-100 touch:opacity-100 focus:opacity-100"><MoreHorizontal className="size-3.5" /></IconButton>}
            items={[
              { label: 'Edit list', icon: <Pencil />, onSelect: () => setEditing(true) },
              folder.archived
                ? { label: 'Restore', icon: <ArchiveRestore />, onSelect: () => void archive({ id: folder.id, archived: false }) }
                : { label: 'Archive', icon: <Archive />, onSelect: () => void archive({ id: folder.id, archived: true }) },
            ]}
          />
          <ConfirmDialog
            trigger={<IconButton label={`Delete ${folder.name}`} size="sm" className="size-7 opacity-0 group-hover:opacity-100 touch:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></IconButton>}
            title={`Delete list '${folder.name}' permanently?`}
            description={folder.total ? `Its ${folder.total} tasks stay in the space without a list. Archive instead to keep the list.` : 'The list is empty.'}
            confirmLabel="Delete list"
            onConfirm={() => deleteFolder({ id: folder.id })}
          />
          <FolderFormDialog spaceId={spaceId} folder={folder} open={editing} onOpenChange={setEditing} />
        </>
      ) : null}
    </li>
  )
}

/** Lists of a space: drag to reorder, open one in the Tasks tab, manage, and archived lists on demand. */
export function FolderList({ spaceId, basePath, folders, archived, activeFolderId, canEdit }: { spaceId: string; basePath: string; folders: FolderRow[]; archived: FolderRow[]; activeFolderId: string | null; canEdit: boolean }) {
  const [order, setOrder] = useState(folders)
  const [showArchived, setShowArchived] = useState(false)
  const [save] = useAction(reorderFolders, { noRefresh: true })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }))
  const dndId = useId()
  useEffect(() => setOrder(folders), [folders])

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = order.findIndex((f) => f.id === active.id)
    const to = order.findIndex((f) => f.id === over.id)
    const next = arrayMove(order, from, to)
    setOrder(next)
    const res = await save({ spaceId, ids: next.map((f) => f.id) })
    if (!res.ok) {
      setOrder(folders)
      toast.error(res.error)
    }
  }
  const params = useSearchParams()
  /** On the Tasks tab, picking a list keeps the view, filters and sort; only the list (and page) change. */
  const href = (id: string | null) => {
    const next = new URLSearchParams(params.get('tab') === 'tasks' ? params.toString() : '')
    next.set('tab', 'tasks')
    if (id) next.set('folder', id)
    else next.delete('folder')
    next.delete('page')
    return `${basePath}?${next.toString()}`
  }

  return (
    <div className="space-y-2">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            <li>
              <Link href={href(null)} scroll={false} className={cn('flex min-h-8 items-center gap-2 rounded-lg px-6 text-sm transition-colors hover:bg-white/[0.04]', !activeFolderId ? 'bg-white/[0.06] text-white' : 'text-white/80')}>
                All lists
              </Link>
            </li>
            {order.map((f) => <FolderItem key={f.id} folder={f} href={href(f.id)} active={activeFolderId === f.id} canEdit={canEdit} spaceId={spaceId} />)}
          </ul>
        </SortableContext>
        {archived.length ? (
          <div>
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="px-2 text-xs text-fg-2 transition-colors hover:text-white">
              {showArchived ? 'Hide' : 'Show'} archived lists ({archived.length})
            </button>
            {showArchived ? <ul className="mt-1 space-y-0.5">{archived.map((f) => <FolderItem key={f.id} folder={f} href={href(f.id)} active={activeFolderId === f.id} canEdit={canEdit} spaceId={spaceId} />)}</ul> : null}
          </div>
        ) : null}
      </DndContext>
      {order.length === 0 ? <p className="px-2 text-[13px] text-fg-2">No lists yet. Tasks live inside a list.</p> : null}
      {canEdit ? <FolderFormDialog spaceId={spaceId} trigger={<Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} className="w-full justify-start">New list</Button>} /> : null}
    </div>
  )
}
