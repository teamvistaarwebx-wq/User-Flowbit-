import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { appUrl, serverEnv } from '@/lib/env'
import { DocEvent } from '@/models/folio/DocEvent'
import { DocLink } from '@/models/folio/DocLink'
import { Org } from '@/models/Org'
import { orgServesLinks } from './access'
import { planPortalLinks } from './portal-links'
import { linkState, newLinkKey, readLinkToken, shouldRecordOpen, signLinkToken, type DocKind, type LinkState } from './token'

/**
 * Public document links (notifications-v2 §1.4): one active link per
 * document, reused by every email and automation; revoking it and making a
 * new one changes the URL. Lookups go by the random key only.
 */

export type LinkDoc = NonNullable<Awaited<ReturnType<typeof findByKey>>>

const findByKey = (key: string) => DocLink.findOne({ key }).lean()

const asId = (id: Types.ObjectId | string) => new Types.ObjectId(String(id))

export const docLinkUrl = (key: string): string => appUrl(`/d/${signLinkToken(key, serverEnv().APP_SECRET)}`)

export type EnsureLinkInput = Readonly<{ kind: DocKind; docId: Types.ObjectId | string; clientId?: Types.ObjectId | string | null; memberId?: Types.ObjectId | null; expiresAt?: Date | null }>

/** The document's live link (creating one when it has none, or only revoked or expired ones). */
export async function ensureDocLink(orgId: Types.ObjectId, input: EnsureLinkInput): Promise<{ url: string; linkId: string }> {
  await dbConnect()
  const now = new Date()
  const live = await DocLink.findOne({ orgId, kind: input.kind, docId: asId(input.docId), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { key: 1 })
    .sort({ createdAt: -1 })
    .lean()
  if (live) return { url: docLinkUrl(live.key), linkId: String(live._id) }
  const created = await DocLink.create({
    orgId,
    kind: input.kind,
    docId: asId(input.docId),
    clientId: input.clientId ? asId(input.clientId) : undefined,
    key: newLinkKey(),
    expiresAt: input.expiresAt ?? null,
    createdBy: input.memberId ?? undefined,
  })
  return { url: docLinkUrl(created.key), linkId: String(created._id) }
}

/** Revokes every live link of a document; the next send makes a new one. */
export async function revokeDocLinks(orgId: Types.ObjectId, kind: DocKind, docId: Types.ObjectId | string, memberId?: Types.ObjectId): Promise<number> {
  const res = await DocLink.updateMany({ orgId, kind, docId: asId(docId), revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: memberId } })
  return res.modifiedCount
}

export type ResolvedLink = Readonly<{ state: 'missing' }> | Readonly<{ state: LinkState; link: LinkDoc }>

/** The link behind a token: missing (bad signature, unknown key, or a disabled or deleted workspace), revoked, expired or active. */
export async function resolveDocLink(token: string, now = new Date()): Promise<ResolvedLink> {
  const key = readLinkToken(token, serverEnv().APP_SECRET)
  if (!key) return { state: 'missing' }
  await dbConnect()
  const link = await findByKey(key)
  if (!link) return { state: 'missing' }
  const org = await Org.findById(link.orgId, { disabled: 1, deletedAt: 1, status: 1 }).lean()
  if (!orgServesLinks(org)) return { state: 'missing' }
  return { state: linkState(link, now), link }
}

/** Counts an open (once per half hour per link) and adds it to the timeline. */
export async function recordOpen(link: LinkDoc, meta: { ip?: string; userAgent?: string }, now = new Date()): Promise<void> {
  if (!shouldRecordOpen(link.lastOpenedAt, now)) return
  const claimed = await DocLink.updateOne(
    { _id: link._id, $or: [{ lastOpenedAt: null }, { lastOpenedAt: { $exists: false } }, { lastOpenedAt: { $lte: new Date(now.getTime() - 30 * 60_000) } }] },
    { $set: { lastOpenedAt: now }, $inc: { opens: 1 }, ...(link.firstOpenedAt ? {} : { $min: { firstOpenedAt: now } }) },
  )
  if (!claimed.modifiedCount) return
  await DocEvent.create({ orgId: link.orgId, kind: link.kind, docId: link.docId, linkId: link._id, type: 'opened', at: now, ip: meta.ip, userAgent: meta.userAgent })
}

/** The live link of a document, if any (to show "Copy link" in the app). */
export async function liveDocLink(orgId: Types.ObjectId, kind: DocKind, docId: Types.ObjectId | string): Promise<{ url: string; opens: number; lastOpenedAt: Date | null } | null> {
  const now = new Date()
  const link = await DocLink.findOne({ orgId, kind, docId: asId(docId), revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).sort({ createdAt: -1 }).lean()
  return link ? { url: docLinkUrl(link.key), opens: link.opens ?? 0, lastOpenedAt: link.lastOpenedAt ?? null } : null
}

/**
 * The portal's links for many documents of one client in two queries (one
 * read, one insert), instead of one ensureDocLink per row. Documents whose
 * link staff turned off are left out of the map.
 */
export async function portalDocLinks(orgId: Types.ObjectId, kind: DocKind, clientId: Types.ObjectId | string, docIds: readonly (Types.ObjectId | string)[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (!docIds.length) return urls
  await dbConnect()
  const ids = docIds.map(String)
  const existing = await DocLink.find({ orgId, kind, docId: { $in: ids.map(asId) } }, { docId: 1, key: 1, revokedAt: 1, expiresAt: 1, createdAt: 1 }).lean()
  const plan = planPortalLinks(ids, existing, new Date())
  for (const [docId, key] of plan.live) urls.set(docId, docLinkUrl(key))
  if (plan.create.length) {
    const created = await DocLink.insertMany(plan.create.map((docId) => ({ orgId, kind, docId: asId(docId), clientId: asId(clientId), key: newLinkKey(), expiresAt: null })))
    for (const row of created) urls.set(String(row.docId), docLinkUrl(row.key))
  }
  return urls
}
