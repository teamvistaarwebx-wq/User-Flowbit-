'use client'

import { useState, type ReactNode } from 'react'
import { createFolder, updateFolder } from '@/modules/work/spaces/folder-actions'
import { FOLDER_COLORS } from '@/modules/work/spaces/constants'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { ColorSwatches } from './color-swatches'

export type FolderFormValue = { id: string; name: string; description: string | null; color: string }

function FolderForm({ spaceId, folder, onClose }: { spaceId: string; folder?: FolderFormValue; onClose: () => void }) {
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0])
  return (
    <ActionForm action={folder ? updateFolder : createFolder} onDone={onClose} className="space-y-4">
      {folder ? <input type="hidden" name="id" value={folder.id} /> : <input type="hidden" name="spaceId" value={spaceId} />}
      <FormField name="name" label="Name" required>
        <Input id="name" name="name" defaultValue={folder?.name} placeholder="Website launch" maxLength={80} autoFocus />
      </FormField>
      <FormField name="description" label="Description">
        <Textarea id="description" name="description" defaultValue={folder?.description ?? ''} rows={2} />
      </FormField>
      <FormField name="color" label="Colour">
        <ColorSwatches name="color" colors={FOLDER_COLORS} value={color} onChange={setColor} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <SubmitButton>{folder ? 'Save list' : 'Create list'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** New list in a space, or edit one. */
export function FolderFormDialog({ spaceId, folder, trigger, open, onOpenChange }: { spaceId: string; folder?: FolderFormValue; trigger?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next)
    onOpenChange?.(next)
  }
  return (
    <Dialog trigger={trigger} open={isOpen} onOpenChange={setOpen} title={folder ? 'Edit list' : 'New list'} size="sm">
      <FolderForm spaceId={spaceId} folder={folder} onClose={() => setOpen(false)} />
    </Dialog>
  )
}
