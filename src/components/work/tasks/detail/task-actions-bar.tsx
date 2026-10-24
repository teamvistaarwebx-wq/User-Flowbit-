'use client'

import { Copy, Eye, EyeOff, Share2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteTask, shareTask, toggleWatch } from '@/modules/work/tasks/actions'
import { NEXT_STEPS } from '@/modules/work/tasks/constants'
import { useAction } from '@/components/ui/action-form'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { BlockedDialog } from '../blocked-dialog'
import { PeoplePicker } from '../people-picker'
import { copyTaskLink } from '../task-row-menu'
import { useTaskData } from '../task-data'
import type { TaskRow } from '../types'
import { useTaskPatch } from './use-patch'

/** Next-step buttons, watch, share (personal tasks), copy link and delete. */
export function TaskActionsBar({ task, watching, canShare }: { task: TaskRow; watching: boolean; canShare: boolean }) {
  const data = useTaskData()
  const router = useRouter()
  const [patch, pending] = useTaskPatch(task.id)
  const [watch, watchPending] = useAction(toggleWatch)
  const [share] = useAction(shareTask)
  const [shared, setShared] = useState(task.sharedWith)
  const [blocking, setBlocking] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {task.canEdit
        ? NEXT_STEPS[task.status].map((step) => (
            <Button key={step.label} size="sm" variant={step.to === 'done' ? 'primary' : 'secondary'} loading={pending} onClick={() => void patch({ status: step.to })}>
              {step.label}
            </Button>
          ))
        : null}
      {task.canEdit && task.status !== 'blocked' && task.status !== 'done' ? (
        <Button size="sm" variant="ghost" onClick={() => setBlocking(true)}>
          Mark blocked
        </Button>
      ) : null}
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
      <Button size="sm" variant="ghost" loading={watchPending} icon={watching ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} onClick={() => void watch({ id: task.id })}>
        {watching ? 'Unwatch' : 'Watch'}
      </Button>
      {canShare ? (
        <PeoplePicker
          people={data.activePeople.filter((p) => p.id !== data.me)}
          value={shared}
          onChange={setShared}
          onOpenChange={(open) => {
            if (open) setShared(task.sharedWith)
            else if (shared.join() !== task.sharedWith.join()) void share({ id: task.id, memberIds: shared })
          }}
          trigger={
            <Button size="sm" variant="ghost" icon={<Share2 className="size-3.5" />}>
              {task.sharedWith.length ? <AvatarStack size="xs" max={3} people={task.sharedWith.map((id) => ({ name: data.nameOf(id) }))} /> : 'Share'}
            </Button>
          }
        />
      ) : null}
      <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void copyTaskLink(task.id)}>
        Copy link
      </Button>
      {task.canEdit ? (
        <ConfirmDialog
          trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} className="text-[#FF6A66] hover:text-[#FF6A66]">Delete</Button>}
          title={`Delete task '${task.title}'?`}
          description="Subtasks, comments and time entries go with it."
          confirmLabel="Delete task"
          onConfirm={async () => {
            const res = await deleteTask({ id: task.id, from: 'detail' })
            if (res.ok && res.redirect) {
              router.push(res.redirect)
              // Clears the client router cache, so Back does not bring the deleted task's page back.
              router.refresh()
            }
            return res
          }}
        />
      ) : null}
      <BlockedDialog
        open={blocking}
        taskTitle={task.title}
        pending={pending}
        onCancel={() => setBlocking(false)}
        onConfirm={({ reason, mentionIds }) => {
          setBlocking(false)
          void patch({ status: 'blocked', blockedReason: reason, blockedMentionIds: mentionIds })
        }}
      />
    </div>
  )
}
