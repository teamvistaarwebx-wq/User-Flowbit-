/**
 * Side effects of a saved change (notifications, activity rows, watchers),
 * run together after the response. Each runs even when another fails; a
 * failure is logged with its label and never reaches the person who saved.
 * Pure: lib/after-response schedules it with Next's `after()`.
 */

export type SideEffect = Readonly<{ label: string; run: () => Promise<unknown> }>

/** Runs every effect; answers the labels that failed (already logged). */
export async function runSideEffects(scope: string, effects: readonly SideEffect[]): Promise<string[]> {
  const results = await Promise.allSettled(effects.map(async (effect) => effect.run()))
  return results.flatMap((result, i) => {
    if (result.status === 'fulfilled') return []
    console.error(`[after:${scope}] ${effects[i].label} failed`, result.reason)
    return [effects[i].label]
  })
}
