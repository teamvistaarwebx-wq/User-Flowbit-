/**
 * A dynamic Mongo filter built from pieces. Mongoose 9 types filters strictly;
 * `any` values let composed fragments pass where a literal would be inferred.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MongoFilter = Record<string, any>
