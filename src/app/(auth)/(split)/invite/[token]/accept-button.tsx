'use client'

import { acceptInviteAction } from '@/lib/auth/actions'
import { signOut } from '@/lib/sign-out'
import { play } from '@/lib/sound'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'

export function AcceptInviteButton({ token, orgName }: { token: string; orgName: string }) {
  const [run, pending] = useAction(acceptInviteAction, { onDone: () => play('whoosh') })
  return (
    <Button variant="primary" size="lg" className="h-[54px] w-full text-base" loading={pending} onClick={() => run({ token })}>
      Join {orgName}
    </Button>
  )
}

/**
 * Signs out, then reopens this invite: signed out, it shows sign-in (or sign-up)
 * with the invited email filled in, so the right account can accept it.
 */
export function SwitchAccountButton({ token }: { token: string }) {
  return (
    <Button variant="outline" size="lg" className="h-[54px] w-full text-base" onClick={() => void signOut(`/invite/${encodeURIComponent(token)}`)}>
      Sign out and use another account
    </Button>
  )
}
