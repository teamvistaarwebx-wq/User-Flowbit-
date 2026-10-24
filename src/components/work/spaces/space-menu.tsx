'use client'

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteSpace, setSpaceArchived } from '@/modules/work/spaces/actions'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { SpaceFormDialog, type SpaceFormValue } from './space-form-dialog'

/** Edit, archive/restore and delete for space owners (cards and the space header). */
export function SpaceMenu({ space, archived, variant = 'icon' }: { space: SpaceFormValue; archived: boolean; variant?: 'icon' | 'button' }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [archive] = useAction(setSpaceArchived)
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu
        trigger={
          variant === 'icon' ? (
            <IconButton label={`Actions for ${space.name}`} size="sm"><MoreHorizontal className="size-4" /></IconButton>
          ) : (
            <Button variant="secondary" size="sm" icon={<MoreHorizontal className="size-4" />}>Manage</Button>
          )
        }
        items={[
          { label: 'Edit name, colour, icon', icon: <Pencil />, onSelect: () => setEditing(true) },
          archived
            ? { label: 'Restore', icon: <ArchiveRestore />, onSelect: () => void archive({ id: space.id, archived: false }) }
            : { label: 'Archive', icon: <Archive />, onSelect: () => void archive({ id: space.id, archived: true }) },
        ]}
      />
      <ConfirmDialog
        trigger={<IconButton label={`Delete ${space.name}`} size="sm"><Trash2 className="size-4" /></IconButton>}
        title={`Delete space '${space.name}'?`}
        description="An empty space is deleted. A space that still has tasks is archived instead, so nothing is lost."
        confirmLabel="Delete space"
        onConfirm={async () => {
          const res = await deleteSpace({ id: space.id })
          if (res.ok && res.redirect) router.push(res.redirect)
          return res
        }}
      />
      <SpaceFormDialog space={space} open={editing} onOpenChange={setEditing} />
    </div>
  )
}
