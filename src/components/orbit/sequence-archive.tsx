'use client'

import { useState } from 'react'
import { Archive } from 'lucide-react'
import { ActionForm, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { archiveSequence } from '@/modules/orbit/sequences/actions'

/** Archive a sequence: every lead still in it stops. */
export function ArchiveSequenceButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Archive this sequence?" description="Leads still in it stop at their current step. Their history stays on each lead." size="sm" trigger={<Button variant="secondary" icon={<Archive className="size-4" />}>Archive</Button>}>
      <ActionForm action={archiveSequence} onDone={() => setOpen(false)} className="flex justify-end">
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="danger" pendingLabel="Archiving…">Archive</SubmitButton>
      </ActionForm>
    </Dialog>
  )
}
