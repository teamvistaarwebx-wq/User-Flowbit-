'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { taskData } from './options'
import { quickOptionsFrom, type QuickOptions } from './quick-parse'
import { getViewer } from './viewer'

/** What @, # and ! can match in a quick add outside the Tasks screens (Home): people, projects, lists and clients. */
export const quickAddOptions = action(
  z.object({}),
  async (_input, ctx) => {
    const viewer = await getViewer(ctx)
    const data = await taskData(ctx, viewer)
    return ok<QuickOptions>(undefined, quickOptionsFrom(data))
  },
  { product: 'work', perm: 'tasks.read', allowReadOnly: true },
)
