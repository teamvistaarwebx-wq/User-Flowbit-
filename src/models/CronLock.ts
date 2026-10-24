import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * One row per scheduled job ('folio', 'task-reminders', ...) or other leased
 * work ('folio-retainers:<orgId>'): a lease that stops two runs overlapping
 * (Vercel may deliver a cron twice), when it last ran and whether it finished
 * cleanly. Cron jobs also keep their place (`runAsOf`, `lastOrgId`,
 * `complete`) so a run cut short by the time budget resumes where it stopped.
 */
const CronLockSchema = new Schema(
  {
    _id: { type: String, required: true },
    lockedUntil: { type: Date, default: null },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lastOk: { type: Boolean },
    runAsOf: { type: String },
    lastOrgId: { type: Schema.Types.ObjectId, default: null },
    complete: { type: Boolean },
  },
  { versionKey: false },
)

export const CronLock = defineModel('CronLock', CronLockSchema)
