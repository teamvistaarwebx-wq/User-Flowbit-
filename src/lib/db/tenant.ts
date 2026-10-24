import { Schema } from 'mongoose'

/**
 * The org reference every product document carries. Spread it into a schema
 * definition so TypeScript infers `orgId`:
 *   const TaskSchema = new Schema({ ...tenantFields, title: String }, { timestamps: true })
 *   TaskSchema.plugin(tenant)
 */
export const tenantFields = {
  orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
} as const

/**
 * Tenant plugin: adds `orgId` (required, indexed) when the schema doesn't
 * declare it, and turns on timestamps. Apply to every org-owned schema.
 */
export function tenant(schema: Schema): void {
  if (!schema.path('orgId')) schema.add(tenantFields)
  if (!schema.get('timestamps')) schema.set('timestamps', true)
}
