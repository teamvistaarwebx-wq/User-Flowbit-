'use client'

import Link from 'next/link'
import { useAction, ActionForm, SubmitButton, FormField } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { acceptDpa, approveSupportAccess, denySupportAccess, endSupportAccess } from '@/modules/settings/support-actions'

/** Owner controls for Flowbit support access (console spec 8, 9). */

export function DpaForm({ href }: { href: string }) {
  return (
    <ActionForm action={acceptDpa} className="space-y-3">
      <FormField name="confirm">
        <Checkbox name="confirm" required label={<span>I accept the <Link href={href} target="_blank" className="text-link underline-offset-4 hover:underline">data processing agreement</Link> on behalf of this workspace.</span>} />
      </FormField>
      <SubmitButton size="sm">Accept</SubmitButton>
    </ActionForm>
  )
}

export function SupportDecision({ id, mode, isOwner }: { id: string; mode: 'requested' | 'active'; isOwner: boolean }) {
  const [approve, approving] = useAction(approveSupportAccess)
  const [deny, denying] = useAction(denySupportAccess)
  const [end, ending] = useAction(endSupportAccess)
  if (!isOwner) return <span className="text-xs text-fg-2">The owner decides</span>
  if (mode === 'active') return <Button size="sm" variant="danger" loading={ending} onClick={() => end({ id })}>End access</Button>
  return (
    <span className="flex gap-2">
      <Button size="sm" loading={approving} onClick={() => approve({ id })}>Approve</Button>
      <Button size="sm" variant="ghost" loading={denying} onClick={() => deny({ id })}>Decline</Button>
    </span>
  )
}
