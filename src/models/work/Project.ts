import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { PROJECT_HEALTH, PROJECT_STATUSES } from '@/modules/work/projects/constants'

export { PROJECT_HEALTH, PROJECT_STATUSES }

const ProjectFileSchema = new Schema({
  fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
  name: { type: String, required: true },
  size: { type: Number, default: 0 },
  mime: { type: String },
  uploadedById: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  uploadedAt: { type: Date, default: () => new Date() },
})

const ProjectSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 1000 },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
    /** Computed from tasks (modules/work/projects/health.ts) and persisted. */
    health: { type: String, enum: PROJECT_HEALTH, default: 'on_track' },
    healthScore: { type: Number, default: 75 },
    /** Completion % of top-level tasks, persisted with health for sorting. */
    progress: { type: Number, default: 0 },
    leadId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    memberIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Member' }], default: [] },
    /** Teams linked to the project (work-b's teams unlink themselves here when deleted). */
    teamIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Team' }], default: [] },
    /** 'YYYY-MM-DD' */
    startDate: { type: String },
    endDate: { type: String },
    color: { type: String, default: '#818CF8' },
    /** Project logo (JPEG/PNG, resized in the browser): a StoredFile of kind 'project_logo'. */
    logoFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    tags: { type: [String], default: [] },
    files: { type: [ProjectFileSchema], default: [] },
    /** Shown to the client's contacts in the client portal (status, health, milestones, progress, files). */
    portalShared: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  },
  { timestamps: true },
)
ProjectSchema.plugin(tenant)
ProjectSchema.index({ orgId: 1, code: 1 }, { unique: true })
ProjectSchema.index({ orgId: 1, status: 1 })
ProjectSchema.index({ orgId: 1, clientId: 1 })
ProjectSchema.index({ orgId: 1, memberIds: 1 })
ProjectSchema.index({ orgId: 1, leadId: 1 })
ProjectSchema.index({ orgId: 1, archivedAt: 1, updatedAt: -1 })

export const Project = defineModel('Project', ProjectSchema)
