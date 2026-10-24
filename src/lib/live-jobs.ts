import { isDeployed } from '@/lib/env-check'

type Env = Readonly<Record<string, string | undefined>>

/** The env switches of the jobs that really delete data (owner decision D4, 11 Oct 2026). */
export type LiveJobSwitch = 'LIFECYCLE_DELETE_ENABLED' | 'RETENTION_PRUNE_ENABLED'

/**
 * Whether a data-deleting job (workspace deletion, log pruning) really
 * deletes. ON by default on a deployed production server (lib/env-check
 * isDeployed), but not on a Vercel preview or development deployment; a dry
 * run locally and in dev. The switch overrides it: 'false' (or 0, off, no) is the emergency
 * kill switch in production, 'true' forces it on (for a deliberate local test).
 */
export function liveJobEnabled(env: Env, name: LiveJobSwitch): boolean {
  const value = env[name]?.trim().toLowerCase()
  if (value === 'false' || value === '0' || value === 'off' || value === 'no') return false
  if (value === 'true') return true
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') return false
  return isDeployed(env as Record<string, string | undefined>)
}
