import 'server-only'
import type { Model } from 'mongoose'
import { Outbox } from '@/models/Outbox'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Message } from '@/models/messaging/Message'
import { PaymentEvent } from '@/models/payments/PaymentEvent'
import { WaChatMessage } from '@/models/whatsapp/WaChatMessage'
import { WaThreadMessage } from '@/models/whatsapp/WaThreadMessage'
import { RETENTION_TARGETS, type RetentionStore, type RetentionTarget } from './retention'

/**
 * Retention across every workspace (a system job, like workspace deletion):
 * the filter is the date alone, on an index of that date. Rows go in
 * batches of ids so one run never holds a long delete.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Record<RetentionTarget, Model<any>> = { Message, Outbox, FolioMessage, AutomationRun, WaThreadMessage, WaChatMessage, PaymentEvent }
const fieldOf = (target: RetentionTarget) => RETENTION_TARGETS.find((t) => t.name === target)!.field

export const mongoRetentionStore: RetentionStore = {
  count: (target, before) => MODELS[target].countDocuments({ [fieldOf(target)]: { $lt: before } }),
  async deleteBatch(target, before, limit) {
    const ids = await MODELS[target].find({ [fieldOf(target)]: { $lt: before } }, { _id: 1 }).sort({ [fieldOf(target)]: 1 }).limit(limit).lean()
    if (!ids.length) return 0
    return (await MODELS[target].deleteMany({ _id: { $in: ids.map((r) => r._id) } })).deletedCount ?? 0
  },
}
