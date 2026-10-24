/**
 * Rows shown before the server has them (a comment while it is posting),
 * pure. A pending row shows "sending" until the action answers; once the
 * server's list carries its id the pending copy drops out, so nothing
 * flickers between the answer and the refresh.
 */

export type PendingRow<T> = Readonly<{ key: string; row: T; serverId: string | null }>
export type ShownRow<T> = T & { sending?: boolean }

/** The server rows, then pending rows the server does not show yet (sending while unanswered). */
export function mergePending<T extends { id: string }>(server: readonly T[], pending: readonly PendingRow<T>[]): ShownRow<T>[] {
  const known = new Set(server.map((r) => r.id))
  const waiting = pending.filter((p) => !p.serverId || !known.has(p.serverId)).map((p) => ({ ...p.row, ...(p.serverId ? { id: p.serverId } : { sending: true }) }))
  return [...server, ...waiting]
}

export const addPending = <T>(list: readonly PendingRow<T>[], key: string, row: T): PendingRow<T>[] => [...list, { key, row, serverId: null }]

export const confirmPending = <T>(list: readonly PendingRow<T>[], key: string, serverId: string): PendingRow<T>[] => list.map((p) => (p.key === key ? { ...p, serverId } : p))

export const dropPending = <T>(list: readonly PendingRow<T>[], key: string): PendingRow<T>[] => list.filter((p) => p.key !== key)
