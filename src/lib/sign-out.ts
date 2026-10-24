'use client'

import { toast } from '@/lib/toast'

const SIGN_OUT_FAILED = 'Could not sign you out. Check your connection and try again.'

/**
 * Ends the session through POST /api/auth/signout, then does a full page load
 * of /login (or `to`). A hard navigation drops the client router cache, the
 * bell's polling and any open /app state, so nothing re-requests a page with
 * a dead session. Same-origin only: `to` must be a path.
 */
export async function signOut(to = '/login'): Promise<void> {
  try {
    const res = await fetch('/api/auth/signout', { method: 'POST', redirect: 'manual', credentials: 'same-origin' })
    // 303 to /login comes back as an opaque redirect (status 0); anything else 2xx/3xx is fine too.
    if (res.type !== 'opaqueredirect' && !res.ok) throw new Error(`signout ${res.status}`)
  } catch (error) {
    console.error('[auth] sign out failed', error)
    toast.error(SIGN_OUT_FAILED)
    return
  }
  window.location.assign(to.startsWith('/') && !to.startsWith('//') ? to : '/login')
}
