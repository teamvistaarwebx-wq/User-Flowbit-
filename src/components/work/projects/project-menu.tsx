'use client'

import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { archiveProject, deleteProject, restoreProject } from '@/modules/work/projects/actions'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/** Edit / archive / restore / delete for a project (cards and the detail header). */
export function ProjectMenu({ id, name, archived, canDelete, variant = 'icon' }: { id: string; name: string; archived: boolean; canDelete: boolean; variant?: 'icon' | 'buttons' }) {
  const router = useRouter()
  const small = variant === 'icon'
  return (
    <div className="flex items-center gap-1">
      {small ? (
        <IconButton label={`Edit ${name}`} size="sm" href={`/app/work/projects/${id}?tab=settings`}><Pencil className="size-4" /></IconButton>
      ) : (
        <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} href={`/app/work/projects/${id}?tab=settings`}>Edit</Button>
      )}
      {archived ? (
        <ConfirmDialog
          tone="primary"
          trigger={small ? <IconButton label={`Restore ${name}`} size="sm"><ArchiveRestore className="size-4" /></IconButton> : <Button variant="secondary" size="sm" icon={<ArchiveRestore className="size-3.5" />}>Restore</Button>}
          title={`Restore '${name}'?`}
          description="It comes back to the projects list."
          confirmLabel="Restore"
          onConfirm={() => restoreProject({ id })}
        />
      ) : (
        <ConfirmDialog
          trigger={small ? <IconButton label={`Archive ${name}`} size="sm"><Archive className="size-4" /></IconButton> : <Button variant="secondary" size="sm" icon={<Archive className="size-3.5" />}>Archive</Button>}
          title={`Archive '${name}'?`}
          description="It disappears from the list; you can restore it from Archived. Projects with open tasks can't be archived."
          confirmLabel="Archive"
          onConfirm={() => archiveProject({ id })}
        />
      )}
      {canDelete ? (
        <ConfirmDialog
          trigger={small ? <IconButton label={`Delete ${name}`} size="sm"><Trash2 className="size-4" /></IconButton> : <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />}>Delete</Button>}
          title={`Delete '${name}' permanently?`}
          description="Milestones, files and the activity trail go with it. Projects that still have tasks can't be deleted."
          confirmLabel="Delete project"
          onConfirm={async () => {
            const res = await deleteProject({ id })
            if (res.ok && res.redirect) {
              router.push(res.redirect)
              router.refresh()
            }
            return res
          }}
        />
      ) : null}
    </div>
  )
}
