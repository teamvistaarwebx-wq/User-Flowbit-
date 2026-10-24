'use client'

import { Flag, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createMilestone, deleteMilestone, setMilestoneDone, updateMilestone } from '@/modules/work/projects/milestone-actions'
import type { MilestoneRow } from '@/modules/work/projects/detail'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { PanelHeader } from '../shared/table'

function MilestoneForm({ projectId, milestone, onClose }: { projectId: string; milestone?: MilestoneRow; onClose: () => void }) {
  return (
    <ActionForm action={milestone ? updateMilestone : createMilestone} onDone={onClose} className="space-y-4">
      {milestone ? <input type="hidden" name="id" value={milestone.id} /> : <input type="hidden" name="projectId" value={projectId} />}
      <FormField name="title" label="Title" required>
        <Input id="title" name="title" defaultValue={milestone?.title} placeholder="Design sign-off" maxLength={120} autoFocus />
      </FormField>
      <FormField name="dueDate" label="Due date" required>
        <DateInput id="dueDate" name="dueDate" defaultValue={milestone?.dueDate} />
      </FormField>
      <FormField name="description" label="Description">
        <Textarea id="description" name="description" defaultValue={milestone?.description ?? ''} rows={2} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <SubmitButton>{milestone ? 'Save milestone' : 'Add milestone'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/**
 * Milestones by due date, as rows in one card (no box per row): a header like Home's cards with the add button on
 * the right, then hairline-divided rows with a 16px bar of linked-task progress.
 */
export function MilestonesPanel({ projectId, milestones, canEdit }: { projectId: string; milestones: MilestoneRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<MilestoneRow | 'new' | null>(null)
  const [toggle] = useAction(setMilestoneDone)
  const doneCount = milestones.filter((m) => m.status === 'done').length
  return (
    <div>
      <PanelHeader
        icon={<Flag />}
        title="Milestones"
        subtitle={milestones.length ? `${doneCount} of ${milestones.length} reached` : 'The big moments in this project'}
        actions={canEdit ? <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add milestone</Button> : undefined}
        className="mb-2"
      />
      {milestones.length === 0 ? (
        <EmptyState compact icon={<Flag />} title="No milestones yet" description="Milestones mark the big moments in a project." />
      ) : (
        <ul className="divide-y divide-white/[0.08]">
          {milestones.map((m) => (
            <li key={m.id} className="group flex items-start gap-3 py-4">
              <Checkbox aria-label={`Complete ${m.title}`} disabled={!canEdit} checked={m.status === 'done'} onCheckedChange={(done) => void toggle({ id: m.id, done })} className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-sm font-semibold text-white', m.status === 'done' && 'text-fg-2 line-through decoration-white/30')}>{m.title}</span>
                  <span className={cn('text-[13px] tabular-nums', m.overdue ? 'text-[#FF2D31]' : 'text-[#979797]')}>{formatDate(m.dueDate)}</span>
                  {m.overdue ? <Badge tone="danger">Overdue</Badge> : m.status === 'done' ? <Badge tone="success">Done</Badge> : null}
                </div>
                {m.description ? <p className="text-[13px] text-white/75">{m.description}</p> : null}
                <Progress value={m.progress} label={m.linked ? `${m.done} of ${m.linked} linked tasks done` : 'No tasks linked yet. Pick this milestone on a task.'} />
              </div>
              {canEdit ? (
                <div className="flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                  <IconButton label={`Edit ${m.title}`} size="sm" onClick={() => setEditing(m)}><Pencil className="size-3.5" /></IconButton>
                  <ConfirmDialog
                    trigger={<IconButton label={`Delete ${m.title}`} size="sm"><Trash2 className="size-3.5" /></IconButton>}
                    title={`Delete milestone '${m.title}'?`}
                    description={m.linked ? `Its ${m.linked} linked tasks stay in the project, just unlinked.` : undefined}
                    confirmLabel="Delete milestone"
                    onConfirm={() => deleteMilestone({ id: m.id })}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title={editing === 'new' ? 'New milestone' : 'Edit milestone'} size="sm">
        {editing ? <MilestoneForm projectId={projectId} milestone={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      </Dialog>
    </div>
  )
}
