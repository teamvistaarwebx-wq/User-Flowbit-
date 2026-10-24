'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { Org } from '@/models/Org'

/** Settings → Security (org.manage): let any member mail a teammate's email-to-task address. Off by default: only the address owner. */
export const setMailToTaskTeammates = action(
  z.object({ allowed: z.boolean() }),
  async ({ allowed }, ctx) => {
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'security.mailToTaskTeammates': allowed } })
    await audit(ctx, { action: allowed ? 'org.mail_to_task_teammates_on' : 'org.mail_to_task_teammates_off', entity: 'Org', entityId: ctx.orgId, summary: allowed ? 'Teammates may now email each other’s email-to-task address' : 'Only the owner of an email-to-task address may send to it' })
    revalidatePath('/app/settings/security')
    return ok(allowed ? 'Teammates can now email each other’s task address.' : 'Only the owner of each task address can send to it.')
  },
  { perm: 'org.manage', allowReadOnly: true },
)
