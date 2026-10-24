/**
 * The client a task should carry after it moves from one project to another.
 * A task "inherited" its client when it has none or has the old project's client;
 * only then does the client follow the move. A client set by hand stays.
 * Returns the new client id, `null` to clear it, or `undefined` to leave it as is.
 */
export function clientAfterProjectMove(
  taskClientId: string | null,
  oldProjectClientId: string | null,
  newProjectClientId: string | null,
): string | null | undefined {
  const inherited = !taskClientId || taskClientId === oldProjectClientId
  if (!inherited) return undefined
  if (newProjectClientId) return newProjectClientId === taskClientId ? undefined : newProjectClientId
  return taskClientId ? null : undefined
}
