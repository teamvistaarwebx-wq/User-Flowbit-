'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { disconnect } from './connections'
import { GOOGLE_SERVICE_LABEL, GOOGLE_SERVICES } from './scopes'

/** Disconnects the signed-in member's own Google service: revokes the grant and deletes the sealed token. */
export const disconnectGoogle = action(
  z.object({ service: z.enum(GOOGLE_SERVICES) }),
  async ({ service }, ctx) => {
    const removed = await disconnect(ctx, ctx.memberId, service)
    if (!removed) return fail(`${GOOGLE_SERVICE_LABEL[service]} is not connected.`)
    await audit(ctx, { action: 'google.disconnected', entity: 'GoogleConnection', summary: `Disconnected ${GOOGLE_SERVICE_LABEL[service]}`, product: 'settings' })
    revalidatePath('/app/settings/integrations/google')
    return ok(`${GOOGLE_SERVICE_LABEL[service]} disconnected`)
  },
  { allowReadOnly: true },
)
