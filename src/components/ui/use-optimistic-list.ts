'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { addPending, confirmPending, dropPending, mergePending, type PendingRow, type ShownRow } from '@/lib/optimistic-list'

/**
 * Optimistic rows over a server list (lib/optimistic-list): `send` shows the
 * row at once, runs `save`, keeps the row on success (until the refreshed
 * list has it) and removes it on failure. Answers whether it saved.
 */
export function useOptimisticList<T extends { id: string }>(server: readonly T[]) {
  const [pending, setPending] = useState<PendingRow<T>[]>([])
  const seq = useRef(0)
  const rows: ShownRow<T>[] = useMemo(() => mergePending(server, pending), [server, pending])
  const send = useCallback(async (row: T, save: () => Promise<{ ok: boolean; id?: string | null }>): Promise<boolean> => {
    seq.current += 1
    const key = `pending-${seq.current}`
    setPending((list) => addPending(list, key, { ...row, id: key }))
    try {
      const result = await save()
      setPending((list) => (result.ok && result.id ? confirmPending(list, key, result.id) : dropPending(list, key)))
      return result.ok
    } catch (error) {
      console.error('[ui] optimistic save failed', error)
      setPending((list) => dropPending(list, key))
      return false
    }
  }, [])
  return { rows, send }
}
