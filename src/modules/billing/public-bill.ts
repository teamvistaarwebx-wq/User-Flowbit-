import 'server-only'
import { dbConnect } from '@/lib/db'
import { serverEnv } from '@/lib/env'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { readBillToken } from './bill-token'

/**
 * A Flowbit bill or invoice behind its public link (/bill/<token>): the
 * signature is checked before the database is touched. A cancelled bill
 * still opens (it says so); the PDF serves whatever the document is now, so
 * after payment the same link shows the tax invoice.
 */
export async function billByToken(token: string) {
  const key = readBillToken(token, serverEnv().APP_SECRET)
  if (!key) return null
  await dbConnect()
  return SubscriptionInvoice.findOne({ publicKey: key }).lean()
}
