'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { draftBreakdown, draftOutline, draftProgress } from '@/modules/work/arc/actions'

export type ArcPickers = { tasks: SelectOption[]; projects: SelectOption[]; teams: SelectOption[] }

/** Quick actions the Home Arc card links to with /app/arc?action=… */
export type ArcAction = 'outline' | 'breakdown' | 'progress'

export function OutlineDialog({ trigger, pickers, today, defaultOpen }: { trigger: ReactNode; pickers: ArcPickers; today: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [projectId, setProjectId] = useState<string>()
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="Outline a project" description="Arc drafts milestones and tasks. Nothing is created until you click Apply.">
      <ActionForm action={draftOutline} onDone={() => setOpen(false)} className="grid gap-4">
        {pickers.projects.length ? (
          <FormField name="projectId" label="Add to an existing project" help="Optional. Leave empty to draft a new project.">
            <Select name="projectId" options={pickers.projects} value={projectId} onValueChange={setProjectId} placeholder="New project" />
          </FormField>
        ) : null}
        <FormField name="name" label="Project name" required>
          <Input id="name" name="name" maxLength={100} placeholder="Acme website revamp" defaultValue={projectId ? pickers.projects.find((p) => p.value === projectId)?.label : undefined} key={projectId ?? 'new'} />
        </FormField>
        <FormField name="goal" label="Goal in one line" required>
          <Textarea id="goal" name="goal" rows={2} maxLength={300} placeholder="Launch a faster, mobile-first site before Diwali" />
        </FormField>
        <FormField name="startDate" label="Start date">
          <DateInput id="startDate" name="startDate" defaultValue={today} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Drafting…">Draft outline</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

export function BreakdownDialog({ trigger, pickers, defaultOpen }: { trigger: ReactNode; pickers: ArcPickers; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="Break down a task" description="Arc suggests subtasks with estimates. You review them before anything is created.">
      <ActionForm action={draftBreakdown} onDone={() => setOpen(false)} className="grid gap-4">
        <FormField name="taskId" label="Task" required>
          <Select name="taskId" options={pickers.tasks} placeholder={pickers.tasks.length ? 'Pick an open task' : 'No open tasks you can see'} disabled={!pickers.tasks.length} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Thinking…" disabled={!pickers.tasks.length}>Suggest subtasks</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

export function ProgressDialog({ trigger, pickers, defaultOpen }: { trigger: ReactNode; pickers: ArcPickers; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [scope, setScope] = useState('me')
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="Progress update" description="Built only from real tasks, time and meetings in the period.">
      <ActionForm action={draftProgress} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        <FormField name="period" label="Period">
          <Select name="period" defaultValue="this_week" options={[{ value: 'this_week', label: 'This week' }, { value: 'last_week', label: 'Last week' }]} />
        </FormField>
        <FormField name="scope" label="About">
          <Select name="scope" value={scope} onValueChange={setScope} options={[{ value: 'me', label: 'My work' }, ...(pickers.projects.length ? [{ value: 'project', label: 'A project' }] : []), ...(pickers.teams.length ? [{ value: 'team', label: 'A team' }] : [])]} />
        </FormField>
        {scope !== 'me' ? (
          <FormField name="scopeId" label={scope === 'project' ? 'Project' : 'Team'} required className="sm:col-span-2">
            <Select name="scopeId" key={scope} options={scope === 'project' ? pickers.projects : pickers.teams} placeholder={scope === 'project' ? 'Pick a project' : 'Pick a team'} />
          </FormField>
        ) : null}
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton pendingLabel="Writing…">Write update</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
