'use server'

import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { serverEnv } from '@/lib/env'
import type { InlineImage } from '@/lib/inline-images'
import { rateLimit } from '@/lib/rate-limit'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limit'
import { uploadInlineImage } from '../images'
import { downloadGif, gifFileName } from './gifs'

/** GIFs one member may copy in from Klipy per minute (each is a download of up to the upload limit). */
const GIF_ATTACHES_PER_MINUTE = 20

/** One image for a post or reply being written. */
export const uploadPostImage = action(
  z.object({ file: z.instanceof(File, { message: 'Choose an image' }) }),
  async ({ file }, ctx) => ok<InlineImage>(undefined, await uploadInlineImage(ctx, file, { kind: 'post_image', entity: 'Post' })),
  { product: 'work', perm: 'posts.write' },
)

/** A GIF picked from the Klipy search: copied into the workspace's files like an upload (no hotlinking). */
export const attachPostGif = action(
  z.object({ url: z.string().url().max(2000), title: z.string().trim().max(120).default('GIF') }),
  async ({ url, title }, ctx) => {
    if (!serverEnv().KLIPY_API_KEY) return fail('GIF search is not set up on this server.')
    const limited = await rateLimit(`gifAttach:${ctx.memberId}`, GIF_ATTACHES_PER_MINUTE, 60_000)
    if (!limited.ok) return fail(`Too many GIFs in a minute. Try again in ${limited.retryAfterSeconds} seconds.`)
    let data: Buffer
    try {
      data = await downloadGif(url, MAX_UPLOAD_BYTES)
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The GIF could not be fetched.')
    }
    const file = new File([new Uint8Array(data)], gifFileName(title), { type: 'image/gif' })
    return ok<InlineImage>(undefined, await uploadInlineImage(ctx, file, { kind: 'post_image', entity: 'Post' }))
  },
  { product: 'work', perm: 'posts.write' },
)
