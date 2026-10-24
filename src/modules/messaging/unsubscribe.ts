import 'server-only'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import type { ConsentSource } from './consent'
import { readUnsubscribeToken, type UnsubscribeClaim } from './signatures'
import { isOptedOut, optIn, optOut } from './suppression-store'

/** Unsubscribe links: what a token stands for, and switching that address's non-essential mail off or back on. */

export type UnsubscribeView = Readonly<{ claim: UnsubscribeClaim; orgName: string; optedOut: boolean }>

export async function readUnsubscribe(token: string): Promise<UnsubscribeView | null> {
  const claim = readUnsubscribeToken(token, serverEnv().APP_SECRET)
  if (!claim) return null
  await dbConnect()
  const orgId = new Types.ObjectId(claim.orgId)
  const org = await Org.findById(orgId, { name: 1 }).lean()
  if (!org) return null
  return { claim, orgName: org.name, optedOut: await isOptedOut(orgId, 'email', claim.email) }
}

export async function setUnsubscribed(token: string, unsubscribed: boolean, source: ConsentSource): Promise<UnsubscribeView | null> {
  const view = await readUnsubscribe(token)
  if (!view) return null
  const orgId = new Types.ObjectId(view.claim.orgId)
  const user = await User.findOne({ email: view.claim.email }, { _id: 1 }).lean()
  const change = { orgId, channel: 'email' as const, address: view.claim.email, source, userId: user?._id ?? null }
  if (unsubscribed) await optOut(change)
  else await optIn({ ...change, source: 'unsubscribe_link' })
  return { ...view, optedOut: unsubscribed }
}
