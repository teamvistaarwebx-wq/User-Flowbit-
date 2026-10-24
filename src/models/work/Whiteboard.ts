import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** An Excalidraw board. Images live in StoredFile; the scene keeps only their file ids. */
const WhiteboardSchema = new Schema(
  {
    ...tenantFields,
    title: { type: String, required: true, trim: true, maxlength: 100, default: 'Untitled whiteboard' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    sharedWith: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
    scene: {
      elements: { type: [Schema.Types.Mixed], default: [] },
      appState: { type: Schema.Types.Mixed, default: {} },
      /** Excalidraw file id -> { fileId (StoredFile), mimeType }. */
      files: { type: Schema.Types.Mixed, default: {} },
    },
    version: { type: Number, default: 0 },
    /** Small SVG preview as a data URL (rendered in an <img>, never inlined). */
    thumbnail: { type: String },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    lastEditedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    archivedAt: { type: Date },
  },
  { timestamps: true },
)
WhiteboardSchema.plugin(tenant)
WhiteboardSchema.index({ orgId: 1, ownerId: 1, updatedAt: -1 })
WhiteboardSchema.index({ orgId: 1, sharedWith: 1 })

export const Whiteboard = defineModel('Whiteboard', WhiteboardSchema)
