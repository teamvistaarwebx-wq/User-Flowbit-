import { Schema } from 'mongoose'

/** An image shown inline under a post, reply or task comment: a StoredFile of this workspace (lib/inline-images). */
export const ImageRefSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
    name: { type: String, maxlength: 200 },
    mime: { type: String },
  },
  { _id: false },
)
