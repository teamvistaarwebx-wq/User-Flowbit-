import 'server-only'
import { Types } from 'mongoose'
import { scoped } from '@/lib/db/scoped'
import { WaBotSession } from '@/models/whatsapp/WaBotSession'
import type { Lang } from './parse'

/** The one conversation in progress per number per workspace (WaBotSession), scoped to the workspace. */

export const SESSION_TTL_MS = 15 * 60_000

export type BotSession = Readonly<{ flow: string; step: string; data: Record<string, unknown>; lang: Lang; memberId: string | null }>

const db = (orgId: Types.ObjectId) => scoped(WaBotSession, orgId)

export async function loadSession(orgId: Types.ObjectId, phone: string, now = new Date()): Promise<BotSession | null> {
  const row = await db(orgId).findOne({ phone, expiresAt: { $gt: now } }).lean()
  if (!row) return null
  return { flow: row.flow, step: row.step ?? '', data: (row.data as Record<string, unknown>) ?? {}, lang: row.lang === 'hi' ? 'hi' : 'en', memberId: row.memberId ? String(row.memberId) : null }
}

export async function saveSession(orgId: Types.ObjectId, phone: string, session: BotSession, now = new Date()): Promise<void> {
  await WaBotSession.updateOne(
    { orgId, phone },
    { $set: { flow: session.flow, step: session.step, data: session.data, lang: session.lang, memberId: session.memberId ? new Types.ObjectId(session.memberId) : undefined, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } },
    { upsert: true },
  )
}

export async function clearSession(orgId: Types.ObjectId, phone: string): Promise<void> {
  await db(orgId).deleteOne({ phone })
}
