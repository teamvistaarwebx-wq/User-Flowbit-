import { todayIST } from '@/lib/dates'

/**
 * MCP limits (docs/specs/mcp.md A1): requests per connection per minute, at
 * most 50 changes in one apply, and a daily write budget per workspace that
 * every AI write (single tools and batches) draws from. Pure over a store.
 */

export const MCP_LIMITS = {
  requestsPerMinute: 120,
  maxChangesPerApply: 50,
  dailyWritesPerWorkspace: 500,
} as const

const MINUTE = 60_000
const DAY = 86_400_000

export interface LimitStore {
  /** Counts one request; false when over `limit` in the window. */
  hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSeconds: number }>
  /** Takes `units` from the window's budget, all or nothing. */
  take(key: string, units: number, limit: number, windowMs: number): Promise<boolean>
}

/** Refusal text when this connection sends too many requests, else null. */
export async function requestRefusal(store: LimitStore, grantId: string): Promise<{ message: string; retryAfterSeconds: number } | null> {
  const res = await store.hit(`mcpToken:${grantId}`, MCP_LIMITS.requestsPerMinute, MINUTE)
  return res.ok ? null : { message: `Too many requests from this app. Try again in ${res.retryAfterSeconds} seconds.`, retryAfterSeconds: res.retryAfterSeconds }
}

/** Takes `units` writes from today's workspace budget (IST day); refusal text when it does not fit. */
export async function writeRefusal(store: LimitStore, orgId: string, units: number, now: Date = new Date()): Promise<string | null> {
  if (units > MCP_LIMITS.maxChangesPerApply) return `At most ${MCP_LIMITS.maxChangesPerApply} changes in one apply. Split the plan.`
  const ok = await store.take(`mcpWrites:${orgId}:${todayIST(now)}`, units, MCP_LIMITS.dailyWritesPerWorkspace, DAY)
  return ok ? null : `This workspace reached today's limit of ${MCP_LIMITS.dailyWritesPerWorkspace} changes from AI apps. It resets at midnight IST.`
}

/** An in-memory store (tests and the in-process smoke test). */
export function memoryLimitStore(): LimitStore {
  const counts = new Map<string, number>()
  return {
    hit: async (key, limit) => {
      const n = (counts.get(key) ?? 0) + 1
      counts.set(key, n)
      return { ok: n <= limit, retryAfterSeconds: n <= limit ? 0 : 60 }
    },
    take: async (key, units, limit) => {
      const n = counts.get(key) ?? 0
      if (n + units > limit) return false
      counts.set(key, n + units)
      return true
    },
  }
}
