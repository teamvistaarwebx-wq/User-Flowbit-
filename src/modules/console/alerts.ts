import 'server-only'
import type { Types } from 'mongoose'
import { accountTypeOf, countsInMetrics } from '@/lib/account-types'
import { todayIST } from '@/lib/dates'
import { Org } from '@/models/Org'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { StaffAlert } from '@/models/console/StaffAlert'
import { alertKey, alertTitle, type AlertKind } from './alert-text'

/**
 * Raises the in-Console alert for a limit hit or an Upgrade click: to the
 * assigned salesperson, or to all Sales and Admin when nobody is assigned.
 * Internal and Test workspaces are ignored. Idempotent per day.
 */
export async function raiseSalesAlert(orgId: Types.ObjectId | string, kind: AlertKind, meta?: Record<string, unknown> | null): Promise<void> {
  const [org, account] = await Promise.all([Org.findById(orgId, { name: 1, subscription: 1 }).lean(), ConsoleAccount.findOne({ orgId }, { salespersonId: 1 }).lean()])
  if (!org || !countsInMetrics(accountTypeOf(org.subscription))) return
  const dedupeKey = alertKey(kind, String(org._id), todayIST())
  await StaffAlert.updateOne(
    { dedupeKey },
    { $setOnInsert: { orgId: org._id, staffId: account?.salespersonId ?? null, kind, title: alertTitle(kind, org.name, meta), dedupeKey } },
    { upsert: true },
  )
}
