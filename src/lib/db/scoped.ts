import type {
  AggregateOptions,
  ClientSession,
  Model,
  PipelineStage,
  ProjectionType,
  QueryFilter,
  QueryOptions,
  Types,
  UpdateQuery,
} from 'mongoose'

/** The raw document type of a model: `RawOf<typeof Task>`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawOf<M> = M extends Model<infer T, any, any, any, any, any> ? T : never

/** Input shape for creates: arrays of subdocuments as plain arrays, ids as ObjectId or string, everything optional. */
export type Loose<T> =
  T extends Types.DocumentArray<infer U>
    ? Array<Loose<U>>
    : T extends Types.ObjectId
      ? Types.ObjectId | string
      : T extends Date
        ? Date | string
        : T extends Array<infer U>
          ? Array<Loose<U>>
          : T extends object
            ? { [K in keyof T]?: Loose<T[K]> }
            : T

export type CreateInput<T> = { [K in keyof Omit<T, 'orgId' | 'createdAt' | 'updatedAt'>]?: Loose<T[K]> } & Record<string, unknown>

/**
 * Filters the wrapper accepts: Mongoose's typed `QueryFilter<T>`, or a filter
 * built up from strings (URL params, form values), as Mongoose 8's
 * `FilterQuery` allowed. Mongoose 9's strict filter rejects a plain `string`
 * for enum fields and `unknown` ids; the server still casts and validates them.
 */
export type ScopedFilter<T> = QueryFilter<T> | Record<string, unknown>

/** Write options the wrapper forwards (pass `{ session }` inside withTransaction). */
export type WriteOptions = { session?: ClientSession }

/** Refuses a document that already carries another org's id ("cross-tenant write blocked"). */
function stampOrg<D extends Record<string, unknown>>(doc: D, orgId: Types.ObjectId): D & { orgId: Types.ObjectId } {
  if (doc.orgId != null && String(doc.orgId) !== String(orgId)) throw new Error('cross-tenant write blocked')
  return { ...doc, orgId }
}

/**
 * An org-scoped view of a model. Every filter gets `orgId`, every create gets
 * `orgId`, every aggregate starts with `$match: { orgId }`. Obtain it through
 * `ctx.db(Model)`; never query product data without it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoped<M extends Model<any>>(model: M, orgId: Types.ObjectId) {
  type T = RawOf<M>
  const m = model as unknown as Model<T>
  const withOrg = (filter: ScopedFilter<T> = {}) => ({ ...filter, orgId }) as QueryFilter<T>

  return {
    model: m,
    orgId,
    find: (filter?: ScopedFilter<T>, projection?: ProjectionType<T> | null, options?: QueryOptions<T>) =>
      m.find(withOrg(filter), projection, options),
    findOne: (filter?: ScopedFilter<T>, projection?: ProjectionType<T> | null, options?: QueryOptions<T>) =>
      m.findOne(withOrg(filter), projection, options),
    findById: (id: unknown, projection?: ProjectionType<T> | null, options?: QueryOptions<T>) =>
      m.findOne(withOrg({ _id: id }), projection, options),
    countDocuments: (filter?: ScopedFilter<T>, options?: WriteOptions) => m.countDocuments(withOrg(filter), options),
    exists: (filter?: ScopedFilter<T>) => m.exists(withOrg(filter)),
    distinct: <K extends string>(field: K, filter?: ScopedFilter<T>) => m.distinct(field, withOrg(filter)),
    /** Creates one document. With `{ session }` it joins the transaction. */
    create: async (doc: CreateInput<T>, options?: WriteOptions) => {
      const stamped = stampOrg(doc, orgId) as unknown as Partial<T>
      // Same as Model.create for one document, with a single return type.
      return new m(stamped).save(options?.session ? { session: options.session } : {})
    },
    insertMany: (docs: Array<CreateInput<T>>, options?: WriteOptions) =>
      m.insertMany(docs.map((d) => stampOrg(d, orgId)) as unknown as Array<Partial<T>>, options?.session ? { session: options.session } : {}),
    updateOne: (filter: ScopedFilter<T>, update: UpdateQuery<T>, options?: Parameters<Model<T>['updateOne']>[2]) =>
      m.updateOne(withOrg(filter), update, options),
    updateMany: (filter: ScopedFilter<T>, update: UpdateQuery<T>, options?: Parameters<Model<T>['updateMany']>[2]) =>
      m.updateMany(withOrg(filter), update, options),
    findOneAndUpdate: (filter: ScopedFilter<T>, update: UpdateQuery<T>, options?: QueryOptions<T>) =>
      m.findOneAndUpdate(withOrg(filter), update, { returnDocument: 'after', ...options }),
    deleteOne: (filter: ScopedFilter<T>, options?: WriteOptions) => m.deleteOne(withOrg(filter), options),
    deleteMany: (filter: ScopedFilter<T>, options?: WriteOptions) => m.deleteMany(withOrg(filter), options),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aggregate: <R = any>(pipeline: PipelineStage[], options?: AggregateOptions) =>
      m.aggregate<R>([{ $match: { orgId } }, ...pipeline], options),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Scoped<M extends Model<any>> = ReturnType<typeof scoped<M>>
