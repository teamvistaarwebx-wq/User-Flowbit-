'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createTeam, updateTeam } from '@/modules/work/teams/actions'
import { ColorPicker } from './color-picker'
import { PeoplePicker, type PickPerson } from './people-picker'

type Team = { id: string; name: string; description: string; color: string; isPrivate?: boolean }

/** Create (with members and lead) or edit (name, description, colour, invite only) a team. `defaultOpen` serves ?new=1. */
export function TeamFormDialog({ trigger, people = [], team, defaultOpen = false }: { trigger?: ReactNode; people?: PickPerson[]; team?: Team; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const close = (next: boolean) => {
    setOpen(next)
    if (!next && defaultOpen) router.replace('/app/work/teams', { scroll: false })
  }
  return (
    <Dialog open={open} onOpenChange={close} trigger={trigger} title={team ? 'Edit team' : 'New team'} description={team ? undefined : 'Teams group people who work together.'}>
      <ActionForm action={team ? updateTeam : createTeam} onDone={() => setOpen(false)} className="grid gap-4">
        {team ? <input type="hidden" name="id" value={team.id} /> : null}
        <FormField name="name" label="Team name" required>
          <Input id="name" name="name" defaultValue={team?.name} maxLength={100} placeholder="Design" />
        </FormField>
        <FormField name="description" label="Description">
          <Textarea id="description" name="description" rows={2} maxLength={500} defaultValue={team?.description} placeholder="What this team works on" />
        </FormField>
        <FormField name="color" label="Colour">
          <ColorPicker defaultValue={team?.color} />
        </FormField>
        <Checkbox
          name="isPrivate"
          defaultChecked={team?.isPrivate}
          label="Invite only"
          description="People can't join on their own; someone who manages teams adds them. Use this for teams that get private posts."
        />
        {team ? null : (
          <>
            <FormField name="memberIds" label="Members">
              <PeoplePicker name="memberIds" people={people} value={memberIds} onChange={setMemberIds} />
            </FormField>
            <FormField name="leadId" label="Team lead" help="Optional. One lead per team.">
              <Select name="leadId" options={people.map((p) => ({ value: p.id, label: p.name, hint: p.title }))} placeholder="No lead yet" />
            </FormField>
          </>
        )}
        <div className="flex justify-end">
          <SubmitButton>{team ? 'Save team' : 'Create team'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
