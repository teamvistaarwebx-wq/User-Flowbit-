import 'server-only'
import type { Model, Types } from 'mongoose'
import { AttendanceDay } from '@/models/AttendanceDay'
import { Client } from '@/models/Client'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { Employee } from '@/models/muster/Employee'
import { Lead } from '@/models/orbit/Lead'
import { StageEvent } from '@/models/orbit/StageEvent'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { TaskComment } from '@/models/work/TaskComment'
import { Activity } from '@/models/orbit/Activity'
import { Deal } from '@/models/orbit/Deal'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import type { UndoStore } from './batch'
import type { BatchModel } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Record<BatchModel, Model<any>> = { Invite, Member, Employee, AttendanceCorrection, AttendanceDay, Project, Task, Lead, StageEvent, Client, FolioServiceItem, TaskComment, Activity, Deal, Invoice, Quote }

/**
 * Extra guard per collection: an undo removes a member only while they are
 * still an unaccepted invite, and an AI-drafted invoice or quote only while it
 * is still a draft (once issued or sent, a person owns it).
 */
const UNDO_FILTER: Partial<Record<BatchModel, Record<string, unknown>>> = { Member: { status: 'invited' }, Invoice: { status: 'draft' }, Quote: { status: 'draft' } }

/** The MongoDB store for undoBatch: ids and orgId always together in the filter. */
export const mongoUndoStore: UndoStore = {
  deleteIds: async (model, orgId, ids) => {
    const result = await MODELS[model].deleteMany({ _id: { $in: ids }, orgId, ...UNDO_FILTER[model] })
    return result.deletedCount ?? 0
  },
  replaceDocs: async (model, orgId, docs) => {
    let n = 0
    for (const doc of docs) {
      const result = await MODELS[model].replaceOne({ _id: doc._id as Types.ObjectId, orgId }, { ...doc, orgId }, { upsert: true })
      n += result.modifiedCount + result.upsertedCount
    }
    return n
  },
}
