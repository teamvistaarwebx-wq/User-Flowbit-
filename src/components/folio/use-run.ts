'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import type { ActionResult } from '@/lib/action-types'

/**
 * For ConfirmDialog's onConfirm: awaits the action, then follows its
 * redirect or refreshes. ConfirmDialog itself shows the toast with sound.
 */
export function useRun() {
  const router = useRouter()
  return useCallback(
    async <T,>(pending: Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      const result = await pending
      if (result.ok && result.redirect) router.push(result.redirect)
      else if (result.ok) router.refresh()
      return result
    },
    [router],
  )
}
