import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

const CounterSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    key: { type: String, required: true },
    value: { type: Number, default: 0 },
  },
  { timestamps: true },
)
CounterSchema.index({ orgId: 1, key: 1 }, { unique: true })

export const Counter = defineModel('Counter', CounterSchema)
