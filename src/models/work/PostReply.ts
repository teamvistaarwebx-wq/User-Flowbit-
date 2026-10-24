import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ReactionSchema } from './Post'
import { ImageRefSchema } from './image-ref'

const PostReplySchema = new Schema(
  {
    ...tenantFields,
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    body: { type: String, required: true, maxlength: 5000 },
    mentionIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
    /** Inline images (lib/inline-images), up to 4. */
    images: { type: [ImageRefSchema], default: [] },
    reactions: { type: [ReactionSchema], default: [] },
    editedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
)
PostReplySchema.plugin(tenant)
PostReplySchema.index({ orgId: 1, postId: 1, deletedAt: 1, createdAt: 1 })

export const PostReply = defineModel('PostReply', PostReplySchema)
