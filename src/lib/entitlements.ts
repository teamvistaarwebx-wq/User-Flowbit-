import { addOnsOf, isAddOn } from '@/lib/addons'
import { accountTypeOf, ACCOUNT_TYPE_LABEL, countsInMetrics, isHouseAccount, type AccountType } from '@/lib/account-types'
import { capacity, SEAT_ROW_KEYS, type CapacityRow, type Usage } from '@/lib/billing'
import { featureByKey, PRODUCTS, PRODUCT_KEYS, type FeatureKey, type ProductKey } from '@/lib/catalog'
import { lifecycleOf, trialStartRefusal, type Lifecycle } from '@/lib/lifecycle'
import {
  accessState,
  effectiveStatus,
  entitled,
  folioFirmLimit,
  has,
  hasFeature,
  musterTier,
  readOnlyDaysLeft,
  readOnlyMessage,
  trialDaysLeft,
  type AccessState,
  type MusterTier,
  type OrgLike,
  type SubscriptionStatus,
} from '@/lib/plans'

/**
 * What a workspace may do right now (console spec 6): the one place every
 * gate, banner, cron job and platform screen reads access, account type,
 * products, features and seats from. Pure and client-safe; pass `usage`
 * (modules/subscription/usage) to also get seats used and capacity rows.
 */

export type EntitlementReason =
  | 'disabled'
  | 'deleted'
  | 'house_account'
  | 'trial_running'
  | 'free_running'
  | 'trial_ended'
  | 'free_ended'
  | 'plan_ended'
  | 'payment_due'
  | 'blocked'
  | 'seat_limit_reached'
  | 'over_seat_limit'

export type Entitlements = {
  accountType: AccountType
  accountTypeLabel: string
  /** False for Internal and Test: never billed, never reminded. */
  billed: boolean
  /** Counted in platform metrics (Internal and Test are not). */
  inMetrics: boolean
  /** The status derived from the dates (a trial past its end is 'expired'). */
  status: SubscriptionStatus
  /** The workspace trial or the Free window is running. */
  trialing: boolean
  trialDaysLeft: number | null
  access: AccessState
  readOnly: boolean
  readOnlyDaysLeft: number | null
  /** Wording for the read-only banner and refusals (trial, Free or subscription). */
  readOnlyMessage: string
  /** Entitled AND enabled: what the workspace can open. */
  products: ProductKey[]
  /** Sold to the workspace, whether or not it switched them on. */
  entitledProducts: ProductKey[]
  musterTier: MusterTier | null
  /** Feature keys (catalog) available now. */
  features: FeatureKey[]
  /** People the plan allows (null = no limit). */
  seatLimit: number | null
  /** People counted against the limit (null when usage was not given). */
  seatsUsed: number | null
  folioFirmLimit: number
  /** Every limit row of the plan, with usage when given (lib/billing capacity). */
  capacity: CapacityRow[]
  reasons: EntitlementReason[]
  /** Stage and dates of the lifecycle: Free/trial end, read-only, blocked, deletion (lib/lifecycle). */
  lifecycle: Lifecycle
  /** A Free workspace that may still start its one 15-day trial. */
  trialAvailable: boolean
}

const NO_USAGE: Usage = { members: 0, pendingInvites: 0, employees: 0, orbitUsers: 0, folioUsers: 0, persons: 0 }

const seatRowOf = (rows: readonly CapacityRow[]) => SEAT_ROW_KEYS.map((key) => rows.find((r) => r.key === key)).find((r) => r !== undefined) ?? null

function accessReasons(org: OrgLike, type: AccountType, status: SubscriptionStatus, access: AccessState): EntitlementReason[] {
  if (org.deletedAt) return ['deleted']
  if (org.disabled) return ['disabled']
  if (isHouseAccount(type)) return ['house_account']
  const free = type === 'free'
  if (status === 'trialing') return [free ? 'free_running' : 'trial_running']
  if (access === 'full') return status === 'past_due' ? ['payment_due'] : []
  const ended: EntitlementReason = free ? 'free_ended' : org.subscription?.plan === 'trial' || !org.subscription ? 'trial_ended' : status === 'past_due' ? 'payment_due' : 'plan_ended'
  return access === 'blocked' ? [ended, 'blocked'] : [ended]
}

function seatReasons(row: CapacityRow | null): EntitlementReason[] {
  if (!row || row.limit == null) return []
  if (row.used > row.limit) return ['over_seat_limit']
  return row.used === row.limit ? ['seat_limit_reached'] : []
}

/** Feature keys of the catalog the workspace can use now. */
const featuresOf = (org: OrgLike, now: Date): FeatureKey[] => [
  ...PRODUCT_KEYS.flatMap((p) => PRODUCTS[p].features.map((f) => f.key)).filter((key) => hasFeature(org, key, now)),
  // Paid add-ons (lib/addons) are feature keys too: 'portal', 'meetings_ai'.
  ...addOnsOf(org, now),
]

/** The Console limits entitlements read (lib/plan-config PlanConfig); the constants when absent. */
export type EntitlementLimits = Readonly<{ freeSeats?: number }>

export function entitlements(org: OrgLike, now: Date = new Date(), usage?: Usage, limits: EntitlementLimits = {}): Entitlements {
  const type = accountTypeOf(org.subscription)
  const house = isHouseAccount(type)
  const status = house ? 'active' : effectiveStatus(org.subscription, now).status
  const access = accessState(org, now)
  const rows = capacity(org.subscription ?? { status: 'expired', plan: 'trial' }, usage ?? NO_USAGE, now, limits.freeSeats)
  const seatRow = seatRowOf(rows)
  return {
    accountType: type,
    accountTypeLabel: ACCOUNT_TYPE_LABEL[type],
    billed: !house,
    inMetrics: countsInMetrics(type),
    status,
    trialing: !house && status === 'trialing',
    trialDaysLeft: house ? null : trialDaysLeft(org, now),
    access,
    readOnly: access !== 'full',
    readOnlyDaysLeft: access === 'full' ? null : readOnlyDaysLeft(org, now),
    readOnlyMessage: readOnlyMessage(org),
    products: PRODUCT_KEYS.filter((p) => has(org, p, now)),
    entitledProducts: PRODUCT_KEYS.filter((p) => entitled(org, p, now)),
    musterTier: musterTier(org, now),
    features: featuresOf(org, now),
    seatLimit: seatRow?.limit ?? null,
    seatsUsed: usage && seatRow ? seatRow.used : null,
    folioFirmLimit: folioFirmLimit(org, now),
    capacity: rows,
    reasons: [...accessReasons(org, type, status, access), ...(usage ? seatReasons(seatRow) : [])],
    lifecycle: lifecycleOf(org, now),
    trialAvailable: trialStartRefusal(org, now) === null,
  }
}

/** Product entitled and switched on. */
export const canUseProduct = (ent: Pick<Entitlements, 'products'>, product: ProductKey) => ent.products.includes(product)

/**
 * Feature available (e.g. 'muster.payroll' needs Muster Business). A key the
 * catalog does not list falls back to its product, as plans.hasFeature does.
 */
export function canUseFeature(ent: Pick<Entitlements, 'features' | 'products'>, feature: FeatureKey): boolean {
  if (featureByKey(feature) || isAddOn(feature)) return ent.features.includes(feature)
  return ent.products.includes(feature.split('.')[0] as ProductKey)
}

/** For cron jobs and public pages: the product is on and the workspace has full (writable) access now. */
export function canWrite(org: OrgLike, product: ProductKey, now: Date = new Date()): boolean {
  const ent = entitlements(org, now)
  return ent.access === 'full' && canUseProduct(ent, product)
}
