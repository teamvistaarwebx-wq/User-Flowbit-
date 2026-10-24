import type { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import type { UsageKind } from '@/lib/usage-kinds'
import { UsageEvent } from '@/models/console/UsageEvent'

export type UsageInput = {
  kind: UsageKind
  orgId?: Types.ObjectId | string | null
  userId?: Types.ObjectId | string | null
  product?: string
  meta?: Record<string, string | number | boolean | null>
}

type UsageDoc = UsageInput & { at: Date }
type Writer = (doc: UsageDoc) => Promise<unknown>

/**
 * Builds a fire-and-forget recorder: the write runs in the background, and a
 * failure (sync or async) is logged, never thrown, so recording usage can
 * never break the action that triggered it.
 */
export function createUsageRecorder(write: Writer, log: (message: string, error: unknown) => void = console.error) {
  return function recordUsage(input: UsageInput): void {
    try {
      const doc: UsageDoc = { ...input, orgId: input.orgId ?? undefined, userId: input.userId ?? undefined, at: new Date() }
      write(doc).catch((error: unknown) => log(`[usage] could not record ${input.kind}`, error))
    } catch (error) {
      log(`[usage] could not record ${input.kind}`, error)
    }
  }
}

const SALES_ALERT_KINDS = new Set<UsageKind>(['limit_hit', 'upgrade_clicked'])

const writeUsageEvent: Writer = async (doc) => {
  await dbConnect()
  await UsageEvent.create(doc)
  // A hit limit or an Upgrade click also alerts Sales in the Console (console spec 8).
  if (doc.orgId && SALES_ALERT_KINDS.has(doc.kind)) {
    const { raiseSalesAlert } = await import('@/modules/console/alerts')
    await raiseSalesAlert(doc.orgId, doc.kind as 'limit_hit' | 'upgrade_clicked', doc.meta)
  }
}

/** Records one usage event (login, task created, limit hit...). Never throws, never awaited. */
export const recordUsage = createUsageRecorder(writeUsageEvent)
