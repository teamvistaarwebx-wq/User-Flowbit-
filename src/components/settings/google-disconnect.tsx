'use client'

import { ActionForm, SubmitButton } from '@/components/ui/action-form'
import { disconnectGoogle } from '@/modules/google/actions'
import type { GoogleService } from '@/modules/google/scopes'

/** Disconnect one Google service (revokes Flowbit's access at Google). */
export function GoogleDisconnect({ service }: { service: GoogleService }) {
  return (
    <ActionForm action={disconnectGoogle}>
      <input type="hidden" name="service" value={service} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Disconnecting…">Disconnect</SubmitButton>
    </ActionForm>
  )
}
