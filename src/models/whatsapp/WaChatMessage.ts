import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/** One message in a Console inbox conversation, either way (template sends stay in Message). */
const WaChatMessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'WaConversation', required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    text: { type: String, required: true },
    providerId: { type: String },
    status: { type: String, enum: ['received', 'sent', 'delivered', 'read', 'failed'], required: true },
    error: { type: String },
    /** 'auto' for the auto-reply and the STOP confirmation. */
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    staffName: { type: String },
    at: { type: Date, required: true },
  },
  { timestamps: true },
)
WaChatMessageSchema.index({ conversationId: 1, at: 1 })
WaChatMessageSchema.index({ providerId: 1 }, { sparse: true })
/** Retention (modules/privacy/retention): rows past the retention period are found by date across workspaces. */
WaChatMessageSchema.index({ at: 1 })

export const WaChatMessage = defineModel('WaChatMessage', WaChatMessageSchema)
