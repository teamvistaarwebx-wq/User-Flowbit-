'use client'

import { useState, type ReactNode } from 'react'
import { createSpace, updateSpace } from '@/modules/work/spaces/actions'
import { SPACE_COLORS, SPACE_ICONS } from '@/modules/work/spaces/constants'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { ColorSwatches } from './color-swatches'
import { SPACE_ICON_MAP } from './space-icon'

export type SpaceFormValue = { id: string; name: string; description: string | null; color: string; icon: string }

function SpaceForm({ space, onClose }: { space?: SpaceFormValue; onClose: () => void }) {
  const [color, setColor] = useState(space?.color ?? SPACE_COLORS[0])
  const [icon, setIcon] = useState(space?.icon ?? 'folder')
  return (
    <ActionForm action={space ? updateSpace : createSpace} onDone={onClose} className="space-y-4">
      {space ? <input type="hidden" name="id" value={space.id} /> : null}
      <FormField name="name" label="Name" required>
        <Input id="name" name="name" defaultValue={space?.name} placeholder="Marketing" maxLength={80} autoFocus />
      </FormField>
      <FormField name="description" label="Description">
        <Textarea id="description" name="description" defaultValue={space?.description ?? ''} rows={2} placeholder="What lives in this space" />
      </FormField>
      <FormField name="color" label="Colour">
        <ColorSwatches name="color" colors={SPACE_COLORS} value={color} onChange={setColor} />
      </FormField>
      <FormField name="icon" label="Icon">
        <input type="hidden" name="icon" value={icon} />
        <div className="flex flex-wrap gap-2">
          {SPACE_ICONS.map((name) => {
            const Icon = SPACE_ICON_MAP[name]
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={icon === name}
                onClick={() => {
                  play('toggle')
                  setIcon(name)
                }}
                className={cn('press flex size-9 items-center justify-center rounded-[8px] border transition-colors', icon === name ? 'border-transparent text-white' : 'border-white/[0.12] bg-control text-fg-2 hover:border-white/25 hover:text-white')}
                style={icon === name ? { background: `color-mix(in srgb, ${color} 62%, #1A1A1A)` } : undefined}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <SubmitButton>{space ? 'Save space' : 'Create space'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** New space or edit name, description, colour and icon. */
export function SpaceFormDialog({ trigger, space, open, onOpenChange }: { trigger?: ReactNode; space?: SpaceFormValue; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next)
    onOpenChange?.(next)
  }
  return (
    <Dialog trigger={trigger} open={isOpen} onOpenChange={setOpen} title={space ? 'Edit space' : 'New space'} description={space ? undefined : 'Spaces group lists of tasks by team or area.'}>
      <SpaceForm space={space} onClose={() => setOpen(false)} />
    </Dialog>
  )
}
