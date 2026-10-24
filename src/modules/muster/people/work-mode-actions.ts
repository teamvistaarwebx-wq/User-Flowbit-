'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { objectId } from '@/lib/validation'
import { setWorkModes } from './work-mode'

/** People → Work mode: moves the chosen people to office and to remote in one save. */
export const saveWorkModes = action(
  z.object({ remote: z.array(objectId).max(2000).default([]), office: z.array(objectId).max(2000).default([]) }),
  async (input, ctx) => {
    if (!input.remote.length && !input.office.length) return fail('Nothing changed.')
    const toRemote = await setWorkModes(ctx, input.remote, 'remote')
    const toOffice = await setWorkModes(ctx, input.office, 'office')
    const changed = toRemote.changed + toOffice.changed
    revalidatePath('/app/hr/people')
    revalidatePath('/app', 'layout')
    const own = toRemote.skippedOwn || toOffice.skippedOwn ? ' Your own work mode was left as it is: someone else has to change it.' : ''
    return ok(`${changed ? `Work mode saved for ${changed} ${changed === 1 ? 'person' : 'people'}.` : 'Nothing changed.'}${own}`)
  },
  { product: 'muster', perm: 'people.write' },
)
