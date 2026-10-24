'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/action-types'
import { setUnsubscribed } from './unsubscribe'

const input = z.object({ token: z.string().min(10).max(500), unsubscribed: z.boolean() })

/** Public (no sign-in): the token itself is the proof, signed with APP_SECRET. */
export async function setUnsubscribedAction(raw: { token: string; unsubscribed: boolean }): Promise<ActionResult> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'This link is not valid.' }
  try {
    const view = await setUnsubscribed(parsed.data.token, parsed.data.unsubscribed, 'unsubscribe_link')
    if (!view) return { ok: false, error: 'This link is not valid any more.' }
    return { ok: true, message: parsed.data.unsubscribed ? 'You are unsubscribed.' : 'You will get these emails again.' }
  } catch (error) {
    console.error('[unsubscribe] failed', error)
    return { ok: false, error: 'Something went wrong on our side. Please try again in a moment.' }
  }
}
