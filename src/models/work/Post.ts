import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { LEGACY_POST_TYPES, POST_TYPES } from '@/modules/work/posts/post-types'
import { ImageRefSchema } from './image-ref'

export { POST_TYPES, LEGACY_POST_TYPES, type PostType } from '@/modules/work/posts/post-types'
export const POST_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
/** org: everyone; roles: chosen roles; groups: chosen teams, departments or locations; private: author and mentioned. */
export const POST_AUDIENCES = ['org', 'roles', 'groups', 'private'] as const

/** Grouped reactions: one row per emoji with the members who reacted. Shared with PostReply. */
export const ReactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
  },
  { _id: false },
)

/** Read receipt per member (opened the post). */
const ReadSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    readAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

/** "I've read this" on a Policy post. */
const AckSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

/** A poll option; voters are stored even when the poll is anonymous (one vote each) but never shown then. */
const PollOptionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    voterIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
  },
  { _id: false },
)

const PollSchema = new Schema(
  {
    options: { type: [PollOptionSchema], default: [] },
    multiple: { type: Boolean, default: false },
    anonymous: { type: Boolean, default: false },
    closesAt: { type: Date },
    closedAt: { type: Date },
  },
  { _id: false },
)

const EventSchema = new Schema({ startsAt: { type: Date }, place: { type: String, trim: true, maxlength: 200 } }, { _id: false })

const PostSchema = new Schema(
  {
    ...tenantFields,
    authorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    /** The post type (POST_TYPES); older posts may still hold a LEGACY_POST_TYPES value. */
    category: { type: String, enum: [...POST_TYPES, ...LEGACY_POST_TYPES], default: 'update' },
    priority: { type: String, enum: POST_PRIORITIES, default: 'medium' },
    audience: { type: String, enum: POST_AUDIENCES, default: 'org' },
    targetRoles: { type: [String], default: [] },
    /** audience 'groups': members of any of these teams, departments (Member.department) or work locations (Employee.workLocation). */
    targetTeamIds: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    targetDepartments: { type: [String], default: [] },
    targetLocations: { type: [String], default: [] },
    /** Who the post is about: kudos recipients, the celebrated person, the new joiner. */
    featuredIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
    /** Policy posts: who has acknowledged ("I've read this"), and the last reminder to the rest. */
    acks: { type: [AckSchema], default: [] },
    ackRemindedAt: { type: Date },
    poll: { type: PollSchema, default: undefined },
    event: { type: EventSchema, default: undefined },
    /** Scheduled posts stay unpublished until publishAt (cron /api/cron/posts). */
    published: { type: Boolean, default: true },
    publishAt: { type: Date },
    /** Set when the posts cron refused a scheduled post (workspace inactive, author gone or no longer a moderator); publishAt is cleared. */
    publishRefusedReason: { type: String },
    /** Automatic posts (birthday, anniversary, welcome): one per key, ever. */
    autoKey: { type: String },
    mentionIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
    /** Inline images (lib/inline-images), up to 4. */
    images: { type: [ImageRefSchema], default: [] },
    pinned: { type: Boolean, default: false },
    pinnedAt: { type: Date },
    pinnedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    reactions: { type: [ReactionSchema], default: [] },
    reads: { type: [ReadSchema], default: [] },
    replyCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
)
PostSchema.plugin(tenant)
PostSchema.index({ orgId: 1, deletedAt: 1, pinned: -1, createdAt: -1 })
PostSchema.index({ orgId: 1, category: 1, createdAt: -1 })
PostSchema.index({ orgId: 1, lastActivityAt: -1 })
PostSchema.index({ orgId: 1, mentionIds: 1 })
PostSchema.index({ orgId: 1, featuredIds: 1, category: 1 })
PostSchema.index({ published: 1, publishAt: 1 })
PostSchema.index({ orgId: 1, autoKey: 1 }, { unique: true, partialFilterExpression: { autoKey: { $type: 'string' } } })

export const Post = defineModel('Post', PostSchema)
