import mongoose, { type InferSchemaType, type Model, type Schema } from 'mongoose'

/**
 * Registers a model once (dev reloads re-evaluate modules).
 *   export const Task = defineModel('Task', TaskSchema)
 */
export function defineModel<S extends Schema>(name: string, schema: S): Model<InferSchemaType<S>> {
  const existing = mongoose.models[name] as Model<InferSchemaType<S>> | undefined
  return existing ?? mongoose.model<InferSchemaType<S>>(name, schema)
}
