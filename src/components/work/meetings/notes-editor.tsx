'use client'

import { useState, useTransition } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Textarea } from '@/components/ui/input'
import { TimeAgo } from '@/components/ui/time-ago'
import { toast } from '@/lib/toast'
import { saveMeetingNotes } from '@/modules/work/meetings/actions'

/** Shared meeting notes; saves when the box loses focus. */
export function NotesEditor({ meetingId, initial, updated, editable }: { meetingId: string; initial: string; updated?: { at: string; by: string }; editable: boolean }) {
  const [saved, setSaved] = useState(initial)
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<'idle' | 'saved'>('idle')
  const [pending, startTransition] = useTransition()

  const save = () => {
    if (value === saved) return
    startTransition(async () => {
      const result = await saveMeetingNotes({ id: meetingId, notes: value })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved(value)
      setState('saved')
    })
  }

  return (
    <div className="space-y-2">
      <Textarea value={value} onChange={(e) => { setValue(e.target.value); setState('idle') }} onBlur={save} rows={8} maxLength={20000} readOnly={!editable} placeholder={editable ? 'Decisions, open questions, who said what. Saves when you click away.' : 'No notes yet.'} />
      <p className="flex items-center gap-1.5 text-xs text-fg-2">
        {pending ? (
          <><LoaderCircle className="size-3.5 animate-spin" /> Saving…</>
        ) : state === 'saved' ? (
          <><Check className="size-3.5 text-[#2DCBAF]" /> Saved</>
        ) : value !== saved ? (
          'Unsaved changes'
        ) : updated ? (
          <>Last edited by {updated.by}, <TimeAgo value={updated.at} /></>
        ) : null}
      </p>
    </div>
  )
}
