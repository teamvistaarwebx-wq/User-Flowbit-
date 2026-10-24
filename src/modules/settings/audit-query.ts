import 'server-only'
import { isValidObjectId, Types } from 'mongoose'
import { dayBoundsIST } from '@/lib/dates'
import type { ListParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { prefixesOf, type AuditProduct } from './audit-meta'

const PRODUCTS: AuditProduct[] = ['work', 'muster', 'orbit', 'folio']
const ISO = /^\d{4}-\d{2}-\d{2}$/

const prefixRegex = (product: AuditProduct) => new RegExp(`^(${prefixesOf(product).map(escapeRegex).join('|')})\\.`)

/** Mongo filter for the audit log from URL params (q, actor, entity, action, product, from, to). */
export function auditFilter(p: Pick<ListParams, 'q' | 'get'>): Record<string, unknown> {
  const and: Record<string, unknown>[] = []
  if (p.q) and.push({ summary: new RegExp(escapeRegex(p.q), 'i') })
  const actor = p.get('actor')
  if (actor === 'support') and.push({ platform: true, actorName: { $ne: 'System' } })
  else if (actor === 'system') and.push({ actorName: 'System' })
  else if (actor && isValidObjectId(actor)) and.push({ actorId: new Types.ObjectId(actor) })
  const entity = p.get('entity')
  if (entity) and.push({ entity })
  const action = p.get('action')
  if (action) and.push({ action })
  const product = p.get('product') as AuditProduct | undefined
  if (product && PRODUCTS.includes(product)) and.push({ $or: [{ product }, { product: { $in: [null, ''] }, action: prefixRegex(product) }] })
  if (product === 'workspace') and.push({ product: { $nin: PRODUCTS }, $nor: PRODUCTS.map((x) => ({ action: prefixRegex(x) })) })
  const from = p.get('from')
  const to = p.get('to')
  const range: Record<string, Date> = {}
  if (from && ISO.test(from)) range.$gte = dayBoundsIST(from).start
  if (to && ISO.test(to)) range.$lt = dayBoundsIST(to).end
  if (Object.keys(range).length) and.push({ createdAt: range })
  return and.length ? { $and: and } : {}
}
