import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/modules/work/tasks/constants'

export { TASK_PRIORITIES, TASK_STATUSES }

const ChecklistItemSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
  doneAt: { type: Date },
  doneById: { type: Schema.Types.ObjectId, ref: 'Member' },
})

const AttachmentSchema = new Schema({
  kind: { type: String, enum: ['file', 'link'], required: true },
  fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
  url: { type: String },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  size: { type: Number },
  mime: { type: String },
  uploadedById: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  uploadedAt: { type: Date, default: () => new Date() },
})

const TaskSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    /** 'VW-42', from nextSeq(orgId, 'task'). */
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 10000 },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    assigneeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Member' }], default: [] },
    creatorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    spaceId: { type: Schema.Types.ObjectId, ref: 'Space' },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder' },
    /** Subtask of (one level). */
    parentId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone' },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    /** 'YYYY-MM-DD' (IST). */
    dueDate: { type: String },
    /** 'HH:mm' (IST), when quick add read a time ("kal 5 baje"). */
    dueTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    startDate: { type: String },
    completedAt: { type: Date },
    /** First time the task entered in_progress / in_review (never cleared). */
    startedAt: { type: Date },
    isPersonal: { type: Boolean, default: false },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: 'Member' }], default: [] },
    watcherIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Member' }], default: [] },
    tags: { type: [String], default: [] },
    estimateMinutes: { type: Number, min: 0 },
    /** Sum of TimeEntry minutes (kept in sync by time tracking). */
    loggedMinutes: { type: Number, default: 0 },
    /** Manual order inside a board column (lower first). */
    order: { type: Number, default: 0 },
    blockedReason: { type: String, maxlength: 1000 },
    blockedAt: { type: Date },
    blockedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    /** Relations: tasks that must finish first ("Blocked by"; the inverse is "Blocks"), and related tasks (stored on both). */
    blockedByIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Task' }], default: [] },
    relatedIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Task' }], default: [] },
    checklist: { type: [ChecklistItemSchema], default: [] },
    /** Where the task came from when an AI app, Slack, email or a webhook created it ("Slack #design"). */
    origin: { type: new Schema({ kind: String, ref: String, url: String, label: String, via: String }, { _id: false }), default: undefined },
    attachments: { type: [AttachmentSchema], default: [] },
    /** The client sees this task in the client portal (its project is shared, or the task is the client's). */
    clientVisible: { type: Boolean, default: false },
    /** A deliverable waiting on the client's approval in the portal, and the client's answer. */
    approval: {
      type: new Schema(
        {
          status: { type: String, enum: ['requested', 'approved', 'changes_requested'], required: true },
          note: { type: String, maxlength: 1000 },
          requestedAt: Date,
          requestedById: { type: Schema.Types.ObjectId, ref: 'Member' },
          decidedAt: Date,
          decidedByContactId: { type: Schema.Types.ObjectId, ref: 'PortalContact' },
          decidedByName: String,
          comment: { type: String, maxlength: 2000 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
)
TaskSchema.plugin(tenant)
TaskSchema.index({ orgId: 1, key: 1 }, { unique: true })
TaskSchema.index({ orgId: 1, assigneeIds: 1, status: 1 })
TaskSchema.index({ orgId: 1, status: 1, order: 1 })
TaskSchema.index({ orgId: 1, projectId: 1, parentId: 1 })
TaskSchema.index({ orgId: 1, spaceId: 1, folderId: 1 })
TaskSchema.index({ orgId: 1, parentId: 1 })
TaskSchema.index({ orgId: 1, dueDate: 1 })
TaskSchema.index({ orgId: 1, isPersonal: 1, status: 1 })
TaskSchema.index({ orgId: 1, completedAt: 1 })
// Every clause of the visibility $or (tasks/access.ts) needs an index, or the whole org is scanned.
TaskSchema.index({ orgId: 1, creatorId: 1 })
TaskSchema.index({ orgId: 1, watcherIds: 1 })
TaskSchema.index({ orgId: 1, sharedWith: 1 })
TaskSchema.index({ orgId: 1, clientId: 1 })
TaskSchema.index({ orgId: 1, blockedByIds: 1 })

export const Task = defineModel('Task', TaskSchema)
