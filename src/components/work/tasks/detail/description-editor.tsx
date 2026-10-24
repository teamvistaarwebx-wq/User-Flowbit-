'use client'

import { useState } from 'react'
import { DESCRIPTION_MAX } from '@/modules/work/tasks/constants'
import { Textarea } from '@/components/ui/input'
import { useTaskPatch } from './use-patch'

/** Description textarea that saves on blur when it changed. */
export function DescriptionEditor({ id, description, canEdit }: { id: string; description: string; canEdit: boolean }) {
  const [value, setValue] = useState(description)
  const [patch, pending] = useTaskPatch(id)
  if (!canEdit) {
    return description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{description}</p> : <p className="text-[13px] text-fg-2">No description.</p>
  }
  return (
    <div className="space-y-1.5">
      <Textarea
        value={value}
        rows={5}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() !== description.trim() && void patch({ description: value.trim() || null })}
        placeholder="Add context, links and what done looks like…"
        aria-label="Description"
      />
      <p className="text-xs text-fg-3">{pending ? 'Saving…' : 'Saves when you click away.'}</p>
    </div>
  )
}
