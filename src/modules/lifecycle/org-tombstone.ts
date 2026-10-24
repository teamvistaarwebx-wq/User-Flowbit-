/**
 * What the deletion tombstone does with each Org field (pure). Every schema path must
 * appear in one of the three lists; org-tombstone.test.ts fails when a new field is in none,
 * so a new Org field is never kept on a deleted workspace by accident (R3 M8).
 */

/** Org fields that can hold personal or business data; the tombstone drops them. */
export const ORG_PERSONAL = [
  'logoFileId', 'brandKey', 'theme', 'address', 'gstin', 'pan', 'profile', 'signatories', 'attendanceGeo', 'breakTypes',
  'planIntent', 'signupUtm', 'security', 'createdBy', 'disabledBy', 'disabledReason', 'dpa.acceptedBy',
  'subscription.billing', 'subscription.pendingCheckout', 'subscription.manual', 'subscription.pendingChange',
] as const

/** Org fields the tombstone overwrites ($set in purge-store). */
export const ORG_TOMBSTONE_SET = ['name', 'slug', 'status', 'deletedAt', 'purgedAt', 'enabledProducts'] as const

/** Org fields kept on the tombstone: settings and billing history with no personal data. */
export const ORG_KEPT = [
  '_id', '__v', 'createdAt', 'updatedAt', 'avatarStyle', 'teamSize', 'mode', 'workspaceKind', 'state', 'timezone', 'officeHours', 'workWeek',
  'disabled', 'disabledAt', 'activation', 'meetingsAi', 'dpa.version', 'dpa.acceptedAt',
  'subscription.status', 'subscription.plan', 'subscription.accountType', 'subscription.compedUntil', 'subscription.products',
  'subscription.seats', 'subscription.quantities', 'subscription.cycle', 'subscription.trialEndsAt', 'subscription.trialStartedAt',
  'subscription.freeEndsAt', 'subscription.currentPeriodStart', 'subscription.currentPeriodEnd', 'subscription.amountPaise',
  'subscription.unitPrices', 'subscription.cancelAtPeriodEnd', 'subscription.canceledAt', 'subscription.pastDueSince',
  'subscription.endedAt', 'subscription.productTrials', 'subscription.addOns', 'subscription.razorpaySubscriptionId',
  'subscription.autopay', 'subscription.provisionalUntil', 'subscription.provisionalPaymentId', 'subscription.razorpayPlanId',
] as const
