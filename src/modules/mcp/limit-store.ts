import 'server-only'
import { rateLimit } from '@/lib/rate-limit'
import { takeUnits } from '@/lib/rate-limit-store'
import type { LimitStore } from './limits'

/** The shared (MongoDB) limit store: the same two-layer counter as sign-in limits, plus all-or-nothing budgets. */
export const mongoLimitStore: LimitStore = {
  hit: (key, limit, windowMs) => rateLimit(key, limit, windowMs),
  take: (key, units, limit, windowMs) => takeUnits(key, units, limit, windowMs),
}
