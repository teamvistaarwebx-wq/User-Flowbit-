'use client'

import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { setUnsubscribedAction } from '@/modules/messaging/unsubscribe-actions'

export function UnsubscribeButton({ token, optedOut }: { token: string; optedOut: boolean }) {
  const [run, pending] = useAction(setUnsubscribedAction)
  return optedOut ? (
    <Button variant="outline" size="lg" className="h-[54px] w-full text-base" loading={pending} onClick={() => run({ token, unsubscribed: false })}>
      Subscribe again
    </Button>
  ) : (
    <Button variant="primary" size="lg" className="h-[54px] w-full text-base" loading={pending} onClick={() => run({ token, unsubscribed: true })}>
      Unsubscribe
    </Button>
  )
}
