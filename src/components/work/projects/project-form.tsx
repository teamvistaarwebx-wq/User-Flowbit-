'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createProject, updateProject } from '@/modules/work/projects/actions'
import { uploadProjectLogo } from '@/modules/work/projects/logo-actions'
import { toast } from '@/lib/toast'
import { PROJECT_COLORS, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from '@/modules/work/projects/constants'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { AvatarStack } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ColorSwatches } from '../spaces/color-swatches'
import { PeoplePicker } from '../tasks/people-picker'
import { TagsInput } from '../tasks/tags-input'
import { NewProjectLogo } from './new-project-logo'
import type { ClientOption, Person } from '../tasks/types'

export type ProjectFormValue = {
  id: string
  name: string
  code: string
  clientId: string | null
  description: string | null
  status: string
  color: string
  startDate: string | null
  endDate: string | null
  leadId: string
  memberIds: string[]
  tags: string[]
}

/** People pickers look like the other fields in the form (same fill and height), not like buttons. */
const PICKER = 'h-10 w-full justify-start border-white/[0.18] bg-white/[0.06] px-4 font-normal hover:bg-white/[0.08]'

export type ProjectFormProps = { project?: ProjectFormValue; people: Person[]; clients: ClientOption[]; me: string; canCreateClient: boolean; /** Client preselected for a new project (e.g. from a client page). */ defaultClientId?: string; onDone?: () => void; onCancel?: () => void }

/** Create or edit a project: name, code (auto when blank), client, dates, lead, members, colour, tags. */
export function ProjectForm({ project, people, clients, me, canCreateClient, defaultClientId, onDone, onCancel }: ProjectFormProps) {
  const active = people.filter((p) => p.active)
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone'
  const [lead, setLead] = useState(project?.leadId ?? me)
  const [members, setMembers] = useState<string[]>(project?.memberIds.filter((m) => m !== (project?.leadId ?? me)) ?? [])
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0])
  const [tags, setTags] = useState<string[]>(project?.tags ?? [])
  const [logo, setLogo] = useState<File | null>(null)
  const router = useRouter()

  /** A new project's logo goes up once the project exists; the project page refreshes when it lands. */
  const done = (result: { data?: unknown }) => {
    const id = (result.data as { id?: string } | undefined)?.id
    if (!project && logo && id) {
      const form = new FormData()
      form.set('projectId', id)
      form.set('logo', logo)
      void uploadProjectLogo(form)
        .then((res) => (res.ok ? router.refresh() : toast.error(`The project was created, but its logo was not saved: ${res.error}`)))
        .catch(() => toast.error('The project was created, but its logo was not saved. Add it in Settings.'))
    }
    onDone?.()
  }

  return (
    <ActionForm action={project ? updateProject : createProject} onDone={done} className="grid gap-4 sm:grid-cols-2">
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <FormField name="name" label="Project name" required>
        <Input id="name" name="name" defaultValue={project?.name} placeholder="Website revamp" maxLength={100} autoFocus={!project} />
      </FormField>
      <FormField name="code" label="Code" help={project ? undefined : 'Leave blank for PROJ-001, PROJ-002…'}>
        <Input id="code" name="code" defaultValue={project?.code} placeholder="WEB" maxLength={20} className="uppercase" />
      </FormField>
      <FormField name="clientId" label="Client" help={canCreateClient ? <Link href="/app/clients/new" className="text-link transition-opacity hover:opacity-80">New client</Link> : undefined}>
        <NativeSelect id="clientId" name="clientId" defaultValue={project ? (project.clientId ?? '') : (defaultClientId ?? '')} placeholder="Internal (no client)" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
      </FormField>
      <FormField name="status" label="Status">
        <Select name="status" defaultValue={project?.status ?? 'active'} options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s] }))} />
      </FormField>
      <FormField name="description" label="Description" className="sm:col-span-2">
        <Textarea id="description" name="description" defaultValue={project?.description ?? ''} rows={3} maxLength={1000} placeholder="Goal, scope and what done looks like" />
      </FormField>
      <FormField name="startDate" label="Start date">
        <DateInput id="startDate" name="startDate" defaultValue={project?.startDate ?? ''} />
      </FormField>
      <FormField name="endDate" label="End date">
        <DateInput id="endDate" name="endDate" defaultValue={project?.endDate ?? ''} />
      </FormField>
      <FormField name="leadId" label="Lead" required>
        <input type="hidden" name="leadId" value={lead} />
        <PeoplePicker people={active} value={[lead]} single onChange={([id]) => id && setLead(id)} trigger={<Button variant="secondary" className={PICKER}><AvatarStack size="xs" people={[{ name: name(lead) }]} />{name(lead)}</Button>} />
      </FormField>
      <FormField name="memberIds" label="Members">
        {members.map((id) => <input key={id} type="hidden" name="memberIds[]" value={id} />)}
        <PeoplePicker
          people={active.filter((p) => p.id !== lead)}
          value={members}
          onChange={setMembers}
          trigger={
            <Button variant="secondary" className={PICKER}>
              {members.length ? <AvatarStack size="xs" max={5} people={members.map((id) => ({ name: name(id) }))} /> : null}
              <span className="truncate">{members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : 'Add people'}</span>
            </Button>
          }
        />
      </FormField>
      <FormField name="color" label="Colour">
        <ColorSwatches name="color" colors={PROJECT_COLORS} value={color} onChange={setColor} custom />
      </FormField>
      <FormField name="tags" label="Tags">
        <TagsInput name="tags" value={tags} onChange={setTags} />
      </FormField>
      {project ? null : (
        <FormField name="logo" label="Logo" help="JPEG or PNG; it is resized to fit 256 px." className="sm:col-span-2">
          <NewProjectLogo file={logo} onChange={setLogo} color={color} />
        </FormField>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <SubmitButton>{project ? 'Save changes' : 'Create project'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
