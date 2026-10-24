'use client'

import { useState, type ReactNode } from 'react'
import { createTask } from '@/modules/work/tasks/actions'
import { uploadAttachment } from '@/modules/work/tasks/attachment-actions'
import { ATTACHMENT_ACCEPT, ESTIMATE_PRESETS, PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from '@/modules/work/tasks/constants'
import { toast } from '@/lib/toast'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PeoplePicker } from './people-picker'
import { TagsInput } from './tags-input'
import { leaveWarning } from '@/modules/work/presence-core'
import { useTaskData } from './task-data'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

export type TaskDefaults = { status?: TaskStatus; dueDate?: string; projectId?: string; clientId?: string; spaceId?: string; folderId?: string; personal?: boolean; assigneeIds?: string[] }

const MINUTES_LABEL = (m: number) => (m % 480 === 0 && m >= 480 ? `${m / 480}d` : m % 60 === 0 ? `${m / 60}h` : `${m}m`)

async function uploadAll(taskId: string, files: File[]): Promise<number> {
  let failed = 0
  for (const file of files) {
    const data = new FormData()
    data.set('taskId', taskId)
    data.set('file', file)
    const res = await uploadAttachment(data).catch(() => ({ ok: false as const, error: 'Upload failed' }))
    if (!res.ok) failed++
  }
  return failed
}

/** Full "New task" form. Personal context (from the Personal view) keeps it private to the creator. */
export function CreateTaskDialog({ trigger, defaults = {}, open, onOpenChange }: { trigger?: ReactNode; defaults?: TaskDefaults; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next)
    onOpenChange?.(next)
  }
  const personal = Boolean(defaults.personal)
  return (
    <Dialog trigger={trigger} open={isOpen} onOpenChange={setOpen} title={personal ? 'New personal task' : 'New task'} description={personal ? 'Only you (and people you share it with) will see it.' : undefined} size="lg">
      <CreateTaskForm defaults={defaults} onClose={() => setOpen(false)} />
    </Dialog>
  )
}

/** The form itself; mounted fresh each time the dialog opens. */
function CreateTaskForm({ defaults, onClose }: { defaults: TaskDefaults; onClose: () => void }) {
  const data = useTaskData()
  const personal = Boolean(defaults.personal)
  const [assignees, setAssignees] = useState<string[]>(defaults.assigneeIds?.length ? defaults.assigneeIds : [data.me])
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? 'todo')
  const [projectId, setProjectId] = useState(defaults.projectId ?? '')
  const [clientId, setClientId] = useState(() => defaults.clientId ?? data.projects.find((p) => p.id === defaults.projectId)?.clientId ?? '')
  const [spaceId, setSpaceId] = useState(defaults.spaceId ?? '')
  const [folderId, setFolderId] = useState(defaults.folderId ?? '')
  const [tags, setTags] = useState<string[]>([])
  const [estimate, setEstimate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [due, setDue] = useState(defaults.dueDate ?? '')
  const away = leaveWarning(data.people, assignees, due || null)
  const folders = data.spaces.find((s) => s.id === spaceId)?.folders ?? []
  const people = data.activePeople

  const onDone = async (result: { ok: true; data?: { id: string } }) => {
    onClose()
    const id = result.data?.id
    if (!id || !files.length) return
    const failed = await uploadAll(id, files)
    if (failed) toast.error(`Task created, but ${failed} attachment${failed === 1 ? '' : 's'} failed to upload`)
  }

  return (
      <ActionForm action={createTask} onDone={(r) => void onDone(r as { ok: true; data?: { id: string } })} className="grid gap-4 sm:grid-cols-2">
        {personal ? <input type="hidden" name="personal" value="on" /> : null}
        <FormField name="title" label="Title" required className="sm:col-span-2">
          <Input id="title" name="title" autoFocus placeholder="Homepage copy for Sharma Organics" maxLength={200} />
        </FormField>
        <FormField name="description" label="Description" className="sm:col-span-2">
          <Textarea id="description" name="description" rows={3} placeholder="What needs to happen, links, acceptance notes" />
        </FormField>
        <FormField name="status" label="Status">
          <Select name="status" value={status} onValueChange={(v) => setStatus(v as TaskStatus)} options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        </FormField>
        <FormField name="priority" label="Priority">
          <Select name="priority" defaultValue="medium" options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </FormField>
        {status === 'blocked' ? (
          <FormField name="blockedReason" label="Why is it blocked?" required className="sm:col-span-2">
            <Input id="blockedReason" name="blockedReason" placeholder="Waiting for the client's logo files" />
          </FormField>
        ) : null}
        <FormField name="assigneeIds" label="Assignees" required className="sm:col-span-2">
          {assignees.map((id) => <input key={id} type="hidden" name="assigneeIds[]" value={id} />)}
          {personal ? (
            <p className="text-sm text-fg-2">Assigned to you</p>
          ) : (
            <PeoplePicker
              people={people}
              value={assignees}
              onChange={setAssignees}
              trigger={
                <Button variant="secondary" className="w-full justify-start">
                  <AvatarStack people={assignees.map(data.avatar)} size="xs" max={5} />
                  <span className="truncate">{assignees.length ? assignees.map((id) => data.nameOf(id)).join(', ') : 'Pick people'}</span>
                </Button>
              }
            />
          )}
          {away ? <p role="status" className="mt-1.5 text-xs text-warning">{away}. You can still assign them.</p> : null}
        </FormField>
        <FormField name="startDate" label="Start date">
          <DateInput id="startDate" name="startDate" />
        </FormField>
        <FormField name="dueDate" label="Due date">
          <DateInput id="dueDate" name="dueDate" defaultValue={defaults.dueDate} onChange={(e) => setDue(e.target.value)} />
        </FormField>
        {!personal ? (
          <>
            <FormField name="projectId" label="Project">
              <NativeSelect
                id="projectId"
                name="projectId"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  const client = data.projects.find((p) => p.id === e.target.value)?.clientId
                  if (client && !clientId) setClientId(client)
                }}
                placeholder="No project"
                options={data.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              />
            </FormField>
            <FormField name="clientId" label="Client">
              <NativeSelect id="clientId" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="No client" options={data.clients.map((c) => ({ value: c.id, label: c.name }))} />
            </FormField>
            <FormField name="spaceId" label="Space">
              <NativeSelect
                id="spaceId"
                name="spaceId"
                value={spaceId}
                onChange={(e) => {
                  setSpaceId(e.target.value)
                  setFolderId('')
                }}
                placeholder="No space"
                options={data.spaces.map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormField>
            <FormField name="folderId" label="List" help={spaceId && !folders.length ? 'This space has no lists yet. Add one on the space page.' : undefined}>
              <NativeSelect id="folderId" name="folderId" value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder={spaceId ? 'Pick a list' : 'Pick a space first'} disabled={!spaceId} options={folders.map((f) => ({ value: f.id, label: f.name }))} />
            </FormField>
          </>
        ) : null}
        <FormField name="tags" label="Tags">
          <TagsInput name="tags" value={tags} onChange={setTags} />
        </FormField>
        <FormField name="estimate" label="Estimate" help="1 day = 8 h">
          <Input id="estimate" name="estimate" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="e.g. 2h 30m" />
          <div className="mt-2 flex flex-wrap gap-1">
            {ESTIMATE_PRESETS.slice(0, 8).map((p) => (
              <button key={p.label} type="button" onClick={() => setEstimate(MINUTES_LABEL(p.minutes))} className="press rounded-full border border-white/[0.12] bg-control px-2.5 py-0.5 text-xs text-fg-2 transition-colors hover:border-white/25 hover:text-white">
                {p.label}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Attachments" className="sm:col-span-2">
          {/* No name: files are not sent with the create request; they upload once the task exists. */}
          <FileUpload name="" multiple accept={ATTACHMENT_ACCEPT} hint={`Uploaded after the task is created · ${MAX_UPLOAD_LABEL} each`} onFiles={setFiles} />
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pendingLabel="Creating…">Create task</SubmitButton>
        </div>
      </ActionForm>
  )
}
