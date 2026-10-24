/**
 * Runs once when a server instance starts (each Vercel cold start, or
 * `next start`). On a deployed server it refuses to start with a clear list of
 * missing or unsafe environment variables (lib/env-check).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertProductionEnv } = await import('@/lib/env-check')
  assertProductionEnv()
}
