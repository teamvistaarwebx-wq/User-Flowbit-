import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { appUrl, serverEnv } from '@/lib/env'
import { ActionToken } from '@/models/messaging/ActionToken'
import { Member } from '@/models/Member'
import { KIND_RULES, type ActionChoice, type ActionSubject } from './kinds'
import { ACTION_LINK_TTL_MS, CLAIM_STALE_MS, actionPayload, hashActionKey, newActionKey, signActionToken } from './token'
import type { ActionRow, UseDeps } from './use'

/**
 * Storage of action links: issuing one per recipient and channel, finding
 * one by its key hash, claiming it atomically and spending it. Every row
 * carries the workspace id; the executor works only inside that workspace.
 */

export const actionLinkUrl = (token: string, choice?: ActionChoice): string => appUrl(`/a/${token}${choice ? `?c=${choice}` : ''}`)

export type IssuedLinks = Readonly<{ token: string; choices: readonly ActionChoice[]; urls: Readonly<Partial<Record<ActionChoice, string>>>; payloads: readonly string[] }>

/**
 * A fresh link for one person about one request. Null when they are not an
 * active member of the workspace (nobody else can be bound to a link).
 */
export async function issueActionLinks(orgId: Types.ObjectId | string, userId: Types.ObjectId | string, subject: ActionSubject, channel: 'email' | 'whatsapp', phone?: string | null, now = new Date()): Promise<IssuedLinks | null> {
  await dbConnect()
  const org = new Types.ObjectId(String(orgId))
  const member = await Member.findOne({ orgId: org, userId: new Types.ObjectId(String(userId)), status: 'active' }, { _id: 1, userId: 1 }).lean()
  if (!member) return null
  const key = newActionKey()
  const choices = KIND_RULES[subject.kind].choices
  await ActionToken.create({
    orgId: org,
    keyHash: hashActionKey(key),
    kind: subject.kind,
    subjectId: subject.id,
    memberId: member._id,
    userId: member.userId,
    channel,
    phone: channel === 'whatsapp' ? (phone ?? undefined) : undefined,
    choices: [...choices],
    expiresAt: new Date(now.getTime() + ACTION_LINK_TTL_MS),
  })
  const token = signActionToken(key, serverEnv().APP_SECRET)
  return { token, choices, urls: Object.fromEntries(choices.map((c) => [c, actionLinkUrl(token, c)])), payloads: choices.map((c) => actionPayload(c, token)) }
}

type Lean = { _id: Types.ObjectId; orgId: Types.ObjectId; kind: string; subjectId: string; memberId: Types.ObjectId; userId: Types.ObjectId; phone?: string | null; choices?: string[]; expiresAt: Date; usedAt?: Date | null; claimedAt?: Date | null }

const toRow = (doc: Lean): ActionRow => ({
  id: String(doc._id),
  orgId: String(doc.orgId),
  kind: doc.kind as ActionRow['kind'],
  subjectId: doc.subjectId,
  memberId: String(doc.memberId),
  userId: String(doc.userId),
  phone: doc.phone ?? null,
  choices: doc.choices ?? [],
  expiresAt: doc.expiresAt,
  usedAt: doc.usedAt ?? null,
  claimedAt: doc.claimedAt ?? null,
})

export const mongoActionStore: Pick<UseDeps, 'find' | 'claim' | 'finish'> = {
  async find(keyHash) {
    await dbConnect()
    const doc = (await ActionToken.findOne({ keyHash }).lean()) as Lean | null
    return doc ? toRow(doc) : null
  },
  async claim(id, now) {
    const stale = new Date(now.getTime() - CLAIM_STALE_MS)
    const res = await ActionToken.updateOne({ _id: id, usedAt: null, expiresAt: { $gt: now }, $or: [{ claimedAt: null }, { claimedAt: { $lt: stale } }] }, { $set: { claimedAt: now } })
    return res.modifiedCount === 1
  },
  async finish(id, outcome) {
    if (outcome.ok) {
      await ActionToken.updateOne({ _id: id }, { $set: { usedAt: new Date(), usedChoice: outcome.choice, outcome: outcome.message.slice(0, 300) }, $unset: { claimedAt: 1 } })
      return
    }
    await ActionToken.updateOne({ _id: id, usedAt: null }, { $set: { claimedAt: null, outcome: outcome.message.slice(0, 300) } })
  },
}
