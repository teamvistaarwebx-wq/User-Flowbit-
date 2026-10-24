import { Types, type ClientSession } from 'mongoose'
import { Counter } from '@/models/Counter'

/**
 * Fixed pseudo-org for series that span every workspace, such as Flowbit's own
 * subscription invoices: nextSeq(PLATFORM_ORG_ID, `fb-invoice:${fiscalYear(date)}`).
 * No Org document has this id.
 */
export const PLATFORM_ORG_ID = new Types.ObjectId('000000000000000000f10b17')

/**
 * Atomic per-org counter. Keys are free-form and scoped by you, e.g.
 * 'task', 'employee', `invoice:${entityId}:${fiscalYear}`, 'letter:2026-27'.
 * Returns 1 for the first call. Pass `session` inside a transaction.
 */
export async function nextSeq(orgId: Types.ObjectId, key: string, session?: ClientSession): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { orgId, key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session },
  ).lean()
  return counter!.value
}

/** The value the next `nextSeq` call would return, without consuming it. */
export async function peekSeq(orgId: Types.ObjectId, key: string): Promise<number> {
  const counter = await Counter.findOne({ orgId, key }).lean()
  return (counter?.value ?? 0) + 1
}

/** Moves a counter forward to at least `value` (imports that bring their own numbers). */
export async function bumpSeq(orgId: Types.ObjectId, key: string, value: number): Promise<void> {
  await Counter.updateOne({ orgId, key }, { $max: { value } }, { upsert: true })
}

/**
 * Formats a sequence number: formatSeq(42, { prefix: 'FB-' }) -> 'FB-42';
 * formatSeq(7, { prefix: 'VW-', pad: 4 }) -> 'VW-0007';
 * formatSeq(12, { prefix: 'INV/', suffix: '/2026-27', pad: 3 }) -> 'INV/012/2026-27'.
 */
export function formatSeq(value: number, opts: { prefix?: string; suffix?: string; pad?: number } = {}): string {
  const body = opts.pad ? String(value).padStart(opts.pad, '0') : String(value)
  return `${opts.prefix ?? ''}${body}${opts.suffix ?? ''}`
}

/** Short uppercase prefix from a name: 'Vistaar WebX' -> 'VW', 'Flowbit' -> 'FLO'. */
export function prefixFrom(name: string, max = 3): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? 'X').slice(0, max)
  return letters.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, max) || 'X'
}
