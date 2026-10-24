import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * One WhatsApp number writing to Flowbit's own number (console spec 10): the
 * Console inbox. Flowbit-level, not a workspace record; `userIds` and
 * `orgIds` link it to the people who verified that number.
 */
const WaConversationSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String },
    userIds: { type: [Schema.Types.ObjectId], default: [] },
    orgIds: { type: [Schema.Types.ObjectId], default: [] },
    lastInboundAt: { type: Date },
    lastMessageAt: { type: Date, required: true },
    lastText: { type: String },
    unread: { type: Number, default: 0 },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Staff' },
    assignedName: { type: String },
    autoRepliedAt: { type: Date },
    stoppedAt: { type: Date },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
  },
  { timestamps: true },
)
WaConversationSchema.index({ status: 1, lastMessageAt: -1 })

export const WaConversation = defineModel('WaConversation', WaConversationSchema)
