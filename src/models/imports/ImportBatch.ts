import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * One confirmed import (console spec 9): what it created, so it can be undone
 * within 7 days (modules/imports/batch). `created` lists document ids per
 * model; `restore` holds documents an import changed (attendance days,
 * superseded corrections) as they were before.
 */
const ImportBatchSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, required: true },
    label: { type: String, required: true },
    fileName: { type: String, default: '' },
    /** 'self': someone in the workspace; 'staff': the Flowbit team (shown as "Imported by the Flowbit team"); 'mcp': an AI app (kind 'mcp'). */
    source: { type: String, enum: ['self', 'staff', 'mcp'], required: true },
    /** MCP batches: the connected app ("Claude") and the connection that applied it. */
    clientName: { type: String },
    grantId: { type: Schema.Types.ObjectId, ref: 'OAuthGrant' },
    /** MCP batches: one line per change, with its link (shown in Settings → Connected apps → History). */
    lines: { type: [new Schema({ op: String, summary: String, status: String, link: String, error: String }, { _id: false })], default: undefined },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    actorName: { type: String, required: true },
    rows: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    created: { type: [new Schema({ model: { type: String, required: true }, ids: { type: [Schema.Types.ObjectId], default: [] } }, { _id: false })], default: [] },
    restore: { type: [new Schema({ model: { type: String, required: true }, docs: { type: [Schema.Types.Mixed], default: [] } }, { _id: false })], default: [] },
    status: { type: String, enum: ['done', 'undone'], default: 'done' },
    undoUntil: { type: Date, required: true },
    undoneAt: { type: Date },
    undoneBy: { type: String },
  },
  { timestamps: true },
)
ImportBatchSchema.plugin(tenant)
ImportBatchSchema.index({ orgId: 1, createdAt: -1 })

export const ImportBatch = defineModel('ImportBatch', ImportBatchSchema)
