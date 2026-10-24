'use client'

import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import { Button } from '@/components/ui/button'
import { useAction } from '@/components/ui/action-form'
import { ActionButton } from '@/components/muster/people/action-button'

type Decide = (input: { id: string; decision: 'approved' | 'rejected'; note?: string }) => Promise<ActionResult<unknown>>

/** Approve / Reject pair for routed requests (leave, corrections, comp-off). Rejecting asks for a note. */
export function DecideButtons({ action, id, subject }: { action: Decide; id: string; subject: string }) {
  const router = useRouter()
  const [run, pending] = useAction(action)
  // A refusal usually means the row is stale (decided in another tab or by someone else): reload it.
  const approve = () => run({ id, decision: 'approved' }).then((result) => { if (!result.ok) router.refresh() })
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" variant="violet" loading={pending} icon={<Check className="size-3.5" />} sound="success" onClick={approve}>
        Approve
      </Button>
      <ActionButton
        action={action}
        input={{ id, decision: 'rejected' as const }}
        reasonKey="note"
        label="Reject"
        icon={<X className="size-3.5" />}
        variant="secondary"
        title={`Reject ${subject}?`}
        description="They are told, with your note."
        confirmLabel="Reject"
        reason={{ label: 'Note for them', placeholder: 'Why this cannot be approved', required: true }}
      />
    </div>
  )
}
