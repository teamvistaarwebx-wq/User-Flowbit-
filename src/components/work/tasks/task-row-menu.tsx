'use client'

import { Copy, ExternalLink, FolderKanban, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { deleteTask, updateTask } from '@/modules/work/tasks/actions'
import { toast } from '@/lib/toast'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/ui/input'
import { useTaskData } from './task-data'
import type { TaskRow } from './types'

export async function copyTaskLink(id: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/app/work/tasks/${id}`)
    toast.success('Link copied')
  } catch {
    toast.error('Could not copy the link. Copy it from the address bar instead.')
  }
}

/** Row actions: copy link, open, move to a project, delete (with confirmation). */
export function TaskRowMenu({ task }: { task: TaskRow }) {
  const data = useTaskData()
  const [moving, setMoving] = useState(false)
  const [projectId, setProjectId] = useState(task.projectId ?? '')
  const [run, pending] = useAction(updateTask, { onDone: () => setMoving(false) })
  return (
    <div className="flex items-center justify-end gap-0.5">
      <DropdownMenu
        trigger={
          <IconButton label={`Actions for ${task.title}`} size="sm">
            <MoreHorizontal className="size-4" />
          </IconButton>
        }
        items={[
          { label: 'Open', icon: <ExternalLink />, href: `/app/work/tasks/${task.id}` },
          { label: 'Copy link', icon: <Copy />, onSelect: () => void copyTaskLink(task.id) },
          ...(task.canEdit && !task.isPersonal ? [{ label: 'Move to project…', icon: <FolderKanban />, onSelect: () => setMoving(true) }] : []),
        ]}
      />
      {/* Delete stays one click away from sm up; on a phone it moves to the task page so titles keep their width. */}
      {task.canEdit ? (
        <span className="hidden sm:inline-flex">
          <ConfirmDialog
            trigger={
              <IconButton label={`Delete ${task.title}`} size="sm">
                <Trash2 className="size-4" />
              </IconButton>
            }
            title={`Delete task '${task.title}'?`}
            description="Subtasks, comments and time entries go with it."
            confirmLabel="Delete task"
            onConfirm={() => deleteTask({ id: task.id, from: 'list' })}
          />
        </span>
      ) : null}
      <Dialog
        open={moving}
        onOpenChange={setMoving}
        title="Move to project"
        description={`${task.key} · ${task.title}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={() => void run({ id: task.id, projectId: projectId || null })}>
              Move
            </Button>
          </>
        }
      >
        <NativeSelect aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="No project" options={data.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
      </Dialog>
    </div>
  )
}
