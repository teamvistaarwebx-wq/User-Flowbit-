import { UserError } from '@/lib/errors'

/** Path segments that would walk into or replace an object's prototype. */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

/**
 * Turns FormData into a plain object for zod. Blank strings become undefined
 * (so optional fields work), repeated keys and keys ending in [] become arrays,
 * and dotted keys nest ('address.city', 'lines.0.qty'). Files are kept.
 * Keys that touch '__proto__', 'prototype' or 'constructor' are refused.
 */
export function formDataToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null)
  const keys = [...new Set([...form.keys()])].filter((k) => !k.startsWith('$ACTION'))
  for (const rawKey of keys) {
    const isList = rawKey.endsWith('[]')
    const key = isList ? rawKey.slice(0, -2) : rawKey
    const values = form
      .getAll(rawKey)
      .map((v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v) : v.size === 0 && !v.name ? undefined : v))
    const value = isList || values.length > 1 ? values.filter((v) => v !== undefined) : values[0]
    setPath(out, key.split('.'), value)
  }
  return out
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) throw new UserError('This form contains a field that is not allowed.')
  let node: Record<string, unknown> = target
  path.forEach((segment, i) => {
    if (i === path.length - 1) {
      node[segment] = value
      return
    }
    const nextIsIndex = /^\d+$/.test(path[i + 1])
    if (!Object.hasOwn(node, segment) || node[segment] === undefined) node[segment] = nextIsIndex ? [] : Object.create(null)
    node = node[segment] as Record<string, unknown>
  })
}

/** FormData or a plain object -> the raw value to parse with zod (FormData rules above). */
export const actionInput = (input: unknown): unknown => (input instanceof FormData ? compact(formDataToObject(input)) : input)

/** Normalises sparse arrays created from 'lines.0', 'lines.2' keys; returns ordinary objects. */
const compact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(compact)
  if (value && typeof value === 'object' && !(value instanceof Blob) && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compact(v)]))
  }
  return value
}
