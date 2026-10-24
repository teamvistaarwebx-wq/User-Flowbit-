import { z } from 'zod'
import { cycleSchema, selectionSchema } from './selection'

/**
 * What `subscription.pendingCheckout` holds between starting a Razorpay
 * checkout and its confirmation (handler or webhook). Stored as Mixed, so it
 * is always re-validated when read.
 */
export const pendingCheckoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('subscription'),
    razorpaySubscriptionId: z.string(),
    razorpayPlanId: z.string(),
    selection: selectionSchema,
    cycle: cycleSchema,
    amountPaise: z.number(),
    totalPaise: z.number(),
    startAt: z.coerce.date().optional(),
    /** The Console unit prices the checkout was quoted at (lib/plan-config). */
    unitPrices: z.record(z.string(), z.number()).optional(),
    /** First-year discount percent the checkout was quoted at (yearly only; 0 or absent = none). */
    discountPercent: z.number().int().min(0).max(100).optional(),
    createdAt: z.coerce.date(),
  }),
  z.object({
    kind: z.literal('upgrade'),
    orderId: z.string(),
    selection: selectionSchema,
    cycle: cycleSchema,
    prorationPaise: z.number(),
    remainingDays: z.number(),
    totalDays: z.number(),
    /** GST-inclusive price per period of the new plan (for moving the Razorpay subscription). */
    periodTotalPaise: z.number(),
    unitPrices: z.record(z.string(), z.number()).optional(),
    createdAt: z.coerce.date(),
  }),
])

export type PendingCheckout = z.infer<typeof pendingCheckoutSchema>

export function readPendingCheckout(value: unknown): PendingCheckout | null {
  const parsed = pendingCheckoutSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
