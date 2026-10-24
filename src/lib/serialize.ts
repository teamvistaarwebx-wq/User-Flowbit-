import { Types } from 'mongoose'

/**
 * Converts lean Mongo documents into plain JSON-safe values for client
 * components: ObjectId -> string, Date -> ISO string, Buffer dropped.
 * The return type mirrors the input with those substitutions.
 */
export type Plain<T> = T extends Types.ObjectId
  ? string
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T

export function plain<T>(value: T): Plain<T> {
  return convert(value) as Plain<T>
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Types.ObjectId) return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(convert)
  if (typeof value === 'object') {
    if (Buffer.isBuffer(value)) return undefined
    const maybeId = value as { _bsontype?: string; toString: () => string }
    if (maybeId._bsontype === 'ObjectId' || maybeId._bsontype === 'ObjectID') return maybeId.toString()
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]))
  }
  return value
}

/** String id of a document or ObjectId. */
export const idOf = (value: { _id: unknown } | Types.ObjectId | string | null | undefined): string =>
  value == null ? '' : typeof value === 'string' ? value : value instanceof Types.ObjectId ? value.toString() : String(value._id)

/** Converts a string id to ObjectId (throws on invalid input; validate first with `objectId`). */
export const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id)
