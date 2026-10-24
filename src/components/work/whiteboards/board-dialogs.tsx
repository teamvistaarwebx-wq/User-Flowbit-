'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { renameWhiteboard, shareWhiteboard } from '@/modules/work/whiteboards/actions'
import { PeoplePicker, type PickPerson } from '../teams/people-picker'

export function RenameBoardDialog({ id, title, trigger }: { id: string; title: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="sm" title="Rename whiteboard" trigger={trigger}>
      <ActionForm action={renameWhiteboard} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        <FormField name="title" label="Title" required>
          <Input id="title" name="title" defaultValue={title} maxLength={100} autoFocus />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton>Rename</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

export function ShareBoardDialog({ id, title, sharedWith, people, trigger }: { id: string; title: string; sharedWith: string[]; people: PickPerson[]; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState(sharedWith)
  return (
    <Dialog open={open} onOpenChange={setOpen} title={`Share '${title}'`} description="People you share with can open and edit the board." trigger={trigger}>
      <ActionForm action={shareWhiteboard} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="id" value={id} />
        {/* An empty list still submits so un-sharing everyone works. */}
        {ids.length === 0 ? <input type="hidden" name="memberIds[]" value="" /> : null}
        <PeoplePicker name="memberIds" people={people} value={ids} onChange={setIds} placeholder="Choose people" />
        <div className="flex justify-end">
          <SubmitButton>Save access</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
