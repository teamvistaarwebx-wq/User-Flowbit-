'use server'

import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import type { InlineImage } from '@/lib/inline-images'
import { objectId } from '@/lib/validation'
import { uploadInlineImage } from '../images'
import { requireTask } from './load'
import { getViewer } from './viewer'

/** One image for a task comment being written (anyone who can see the task may comment). */
export const uploadCommentImage = action(
  z.object({ taskId: objectId, file: z.instanceof(File, { message: 'Choose an image' }) }),
  async ({ taskId, file }, ctx) => {
    const task = await requireTask(ctx, await getViewer(ctx), taskId)
    return ok<InlineImage>(undefined, await uploadInlineImage(ctx, file, { kind: 'comment_image', entity: 'Task', entityId: task._id }))
  },
  { product: 'work', perm: 'tasks.read' },
)
