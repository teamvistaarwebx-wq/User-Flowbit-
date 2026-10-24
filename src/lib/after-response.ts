import 'server-only'
import { after } from 'next/server'
import { runSideEffects, type SideEffect } from './side-effects'

/**
 * Runs `effects` after the response is sent (Next `after()`), so the person
 * who saved does not wait for notifications or logs. Failures are logged
 * per effect (lib/side-effects).
 */
export function afterResponse(scope: string, effects: readonly SideEffect[]): void {
  after(async () => {
    await runSideEffects(scope, effects)
  })
}
