import 'server-only'
import mongoose, { type Types } from 'mongoose'
import { ACCOUNT_TYPES, accountTypeOf, countsInMetrics, type AccountType } from '@/lib/account-types'
import { handoverProgress, type HandoverProgress } from '@/lib/console/handover'
import type { StaffCtx } from '@/lib/console/session'
import { isoDateIST, todayIST } from '@/lib/dates'
import { entitlements } from '@/lib/entitlements'
import { escapeRegex } from '@/lib/utils'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { ORG_PLANS, Org } from '@/models/Org'
import { Session } from '@/models/Session'
import { User } from '@/models/User'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { Staff } from '@/models/console/Staff'
import { Employee } from '@/models/muster/Employee'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { dueTotals } from '@/modules/billing/due-totals'
import { PAYROLL_STATUSES } from '@/modules/muster/people/lifecycle'
import { planConfig } from './settings-query'
import { callTodayReason, HEALTH_SCORES, type CallReason, type HealthScore } from './health'
import { mrrOf, orgState, weeklyCounts, type OrgState } from './metrics'
import { seatUsageByOrg, usageFor } from './seat-usage'

const MAX_ORGS = 2000
const DAY_MS = 86_400_000

export type AccountRow = {
  id: string
  name: string
  slug: string
  owner: { name: string; email: string } | null
  plan: string
  accountType: AccountType
  /** False for Internal and Test: listed, but left out of every overview number. */
  inMetrics: boolean
  products: { work: boolean; muster: string | null; orbit: boolean; folio: boolean }
  state: OrgState
  stateLabel: string
  seatsUsed: number
  seatLimit: number | null
  mrrPaise: number
  amountPaise: number
  createdAt: string
  lastActive: string | null
  trialEndsAt: string | null
  /** Days left in the Free window or trial (null otherwise). */
  daysLeft: number | null
  health: HealthScore | null
  salesperson: { id: string; name: string } | null
  setup: HandoverProgress
}

export type AccountFilters = { q?: string; plan?: string; state?: string; type?: string; health?: string; salesperson?: string; daysLeft?: string; sort?: string }

async function ownersOf(p: StaffCtx, orgIds: Types.ObjectId[]) {
  const owners = await p.raw(Member).find({ orgId: { $in: orgIds }, role: 'owner', status: 'active' }, { orgId: 1, userId: 1 }).lean()
  const users = await p.raw(User).find({ _id: { $in: owners.map((o) => o.userId) } }, { name: 1, email: 1 }).lean()
  return new Map(owners.map((o) => [String(o.orgId), users.find((u) => String(u._id) === String(o.userId)) ?? null]))
}

/** Seat usage per workspace, counted as the account page counts it (members and invites, or payroll employees). */
async function seatsOf(p: StaffCtx, orgIds: Types.ObjectId[], now: Date) {
  const [members, invites, employees] = await Promise.all([
    p.raw(Member).find({ orgId: { $in: orgIds }, status: 'active' }, { orgId: 1 }).lean(),
    p.raw(Invite).find({ orgId: { $in: orgIds }, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } }, { orgId: 1 }).lean(),
    p.raw(Employee).find({ orgId: { $in: orgIds }, status: { $in: PAYROLL_STATUSES }, deletedAt: null }, { orgId: 1, memberId: 1 }).lean(),
  ])
  return seatUsageByOrg({ members, invites, employees })
}

async function lastActiveOf(p: StaffCtx, orgIds: Types.ObjectId[]) {
  const rows = await p.raw(Session).aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: { activeOrgId: { $in: orgIds } } }, { $group: { _id: '$activeOrgId', at: { $max: '$lastSeenAt' } } }])
  return new Map(rows.map((r) => [String(r._id), r.at]))
}

async function consoleAccountsOf(p: StaffCtx, orgIds: Types.ObjectId[]) {
  const [accounts, staff] = await Promise.all([
    p.raw(ConsoleAccount).find({ orgId: { $in: orgIds } }, { orgId: 1, salespersonId: 1, 'health.score': 1, handover: 1 }).lean(),
    p.raw(Staff).find({}, { name: 1 }).lean(),
  ])
  const names = new Map(staff.map((s) => [String(s._id), s.name]))
  return new Map(accounts.map((a) => [String(a.orgId), { ...a, salespersonName: a.salespersonId ? (names.get(String(a.salespersonId)) ?? 'Former staff') : null }]))
}

async function ownerMatches(p: StaffCtx, q: string): Promise<Types.ObjectId[]> {
  const users = await p.raw(User).find({ email: new RegExp(escapeRegex(q), 'i') }, { _id: 1 }).limit(200).lean()
  return p.raw(Member).distinct('orgId', { userId: { $in: users.map((u) => u._id) }, role: 'owner' })
}

const isHealth = (value: string | undefined): value is HealthScore => (HEALTH_SCORES as readonly string[]).includes(value ?? '')

/** Filters that need derived values (state, type, health, salesperson, days left). */
function matches(r: AccountRow, f: AccountFilters, staffId: string): boolean {
  const type = ACCOUNT_TYPES.find((t) => t === f.type)
  if (f.state && r.state !== f.state) return false
  if (type && r.accountType !== type) return false
  if (f.health === 'none' ? r.health !== null : isHealth(f.health) && r.health !== f.health) return false
  if (f.salesperson === 'mine' && r.salesperson?.id !== staffId) return false
  if (f.salesperson === 'none' && r.salesperson) return false
  if (f.salesperson && !['mine', 'none'].includes(f.salesperson) && r.salesperson?.id !== f.salesperson) return false
  const days = Number(f.daysLeft)
  if (f.daysLeft && Number.isFinite(days) && (r.daysLeft == null || r.daysLeft > days)) return false
  return true
}

/** Every workspace with derived state, owner, seats, MRR, health, salesperson and setup progress. */
export async function listAccounts(p: StaffCtx, filters: AccountFilters): Promise<AccountRow[]> {
  const now = new Date()
  const ownerOrgIds = filters.q ? await ownerMatches(p, filters.q) : []
  const plan = ORG_PLANS.find((key) => key === filters.plan)
  const query = {
    ...(plan ? { 'subscription.plan': plan } : {}),
    ...(filters.q ? { $or: [{ name: new RegExp(escapeRegex(filters.q), 'i') }, { slug: new RegExp(escapeRegex(filters.q), 'i') }, { _id: { $in: ownerOrgIds } }] } : {}),
  }
  const orgs = await p.raw(Org).find(query).sort({ createdAt: -1 }).limit(MAX_ORGS).lean()
  const ids = orgs.map((o) => o._id)
  const [owners, seats, lastActive, accounts, config] = await Promise.all([ownersOf(p, ids), seatsOf(p, ids, now), lastActiveOf(p, ids), consoleAccountsOf(p, ids), planConfig()])
  const rows = orgs.map((o): AccountRow => {
    const { state, label } = orgState(o, now)
    const owner = owners.get(String(o._id))
    const products = o.subscription?.products
    const accountType = accountTypeOf(o.subscription)
    const account = accounts.get(String(o._id))
    const ent = entitlements(o, now, usageFor(seats, o._id), { freeSeats: config.freeSeats })
    const lc = ent.lifecycle
    const seen = lastActive.get(String(o._id))
    return {
      id: String(o._id),
      name: o.name,
      slug: o.slug,
      owner: owner ? { name: owner.name, email: owner.email } : null,
      plan: o.subscription?.plan ?? 'trial',
      accountType,
      inMetrics: countsInMetrics(accountType),
      products: { work: Boolean(products?.work), muster: products?.muster ?? null, orbit: Boolean(products?.orbit), folio: Boolean(products?.folio) },
      state,
      stateLabel: label,
      seatsUsed: ent.seatsUsed ?? 0,
      seatLimit: ent.seatLimit,
      mrrPaise: mrrOf(o.subscription, now),
      amountPaise: o.subscription?.amountPaise ?? 0,
      createdAt: new Date(o.createdAt).toISOString(),
      lastActive: seen ? new Date(seen).toISOString() : null,
      trialEndsAt: o.subscription?.trialEndsAt ? new Date(o.subscription.trialEndsAt).toISOString() : null,
      daysLeft: lc.stage === 'free' || lc.stage === 'trial' ? lc.daysLeft : null,
      health: (account?.health?.score as HealthScore | undefined) ?? null,
      salesperson: account?.salespersonId ? { id: String(account.salespersonId), name: account.salespersonName ?? '' } : null,
      setup: handoverProgress(account?.handover),
    }
  })
  const filtered = rows.filter((r) => matches(r, filters, String(p.staff.id)))
  if (filters.sort === 'mrr') return [...filtered].sort((a, b) => b.mrrPaise - a.mrrPaise)
  if (filters.sort === 'days') return [...filtered].sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
  return filtered
}

export type CallTodayRow = AccountRow & { reason: CallReason }

/** Console Home (spec 7.2): the numbers, the "Call today" list and recent payments. Internal and Test are left out. */
export async function consoleOverview(p: StaffCtx) {
  const now = new Date()
  const [rows, config] = await Promise.all([listAccounts(p, {}), planConfig()])
  const live = rows.filter((r) => r.inMetrics && r.state !== 'deleted')
  const liveIds = live.map((r) => new mongoose.Types.ObjectId(r.id))
  const monthStart = `${todayIST().slice(0, 7)}-01`
  const weekAgo = isoDateIST(new Date(now.getTime() - 7 * DAY_MS))
  const [firstPayments, recent, dueBills] = await Promise.all([
    p.raw(SubscriptionInvoice).aggregate<{ _id: Types.ObjectId; first: Date }>([{ $match: { status: 'paid', orgId: { $in: liveIds } } }, { $group: { _id: '$orgId', first: { $min: '$createdAt' } } }]),
    p.raw(SubscriptionInvoice).find({ orgId: { $in: liveIds }, status: { $ne: 'due' } }).sort({ createdAt: -1 }).limit(10).lean(),
    p.raw(SubscriptionInvoice).find({ orgId: { $in: liveIds }, status: 'due' }, { totalPaise: 1, taxableValuePaise: 1, receivedPaise: 1, tds: 1, dueDate: 1 }).lean(),
  ])
  // Overdue = what due bills past their date still ask for (as Billing shows); past-due subscriptions are counted separately.
  const due = dueTotals(dueBills, todayIST())
  const names = new Map(rows.map((r) => [r.id, r.name]))
  const mrr = live.reduce((sum, r) => sum + r.mrrPaise, 0)
  const freeEnding = live.filter((r) => r.accountType === 'free' && r.daysLeft != null && r.daysLeft <= 30).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  const callToday: CallTodayRow[] = live.flatMap((r) => {
    const reason = callTodayReason({ health: r.health, seats: r.seatsUsed, accountType: r.accountType, daysLeft: r.daysLeft, inMetrics: r.inMetrics, live: !['disabled', 'deleted', 'locked'].includes(r.state), redSeats: config.freeSeats })
    return reason ? [{ ...r, reason }] : []
  })
  return {
    kpis: {
      mrr,
      signupsThisWeek: live.filter((r) => isoDateIST(new Date(r.createdAt)) > weekAgo).length,
      free: live.filter((r) => r.accountType === 'free').length,
      trial: live.filter((r) => r.accountType === 'trial').length,
      paid: live.filter((r) => r.accountType === 'paid' || r.accountType === 'comped').length,
      inSetup: live.filter((r) => r.setup.started && !r.setup.complete).length,
      habitFormed: live.filter((r) => r.health === 'green').length,
      conversionsThisMonth: firstPayments.filter((f) => isoDateIST(new Date(f.first)) >= monthStart).length,
      freeEnding30: freeEnding.length,
      overduePaise: due.overduePaise,
      overdueBills: due.overdueCount,
      pastDue: live.filter((r) => r.state === 'past_due').length,
    },
    signups: weeklyCounts(live.map((r) => isoDateIST(new Date(r.createdAt))), todayIST()),
    freeEnding: freeEnding.slice(0, 8),
    callToday,
    /** A Red account above this many seats is on Call today. */
    callRedSeats: config.freeSeats,
    recent: recent.map((i) => ({ id: String(i._id), number: i.number, orgId: String(i.orgId), org: names.get(String(i.orgId)) ?? '—', totalPaise: i.totalPaise, date: i.issueDate, provider: i.payment?.provider ?? 'simulated' })),
    total: live.length,
    /** Internal and Test workspaces, not counted above. */
    excluded: rows.filter((r) => !r.inMetrics && r.state !== 'deleted').length,
  }
}
