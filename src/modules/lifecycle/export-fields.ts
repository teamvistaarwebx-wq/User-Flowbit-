/**
 * Org fields the workspace export includes (pure): the workspace's own details and settings,
 * v2 company data included (R3 L-30a), never Flowbit's payment internals or secrets.
 */
export const WORKSPACE_EXPORT_FIELDS = [
  'name', 'slug', 'teamSize', 'mode', 'address', 'gstin', 'pan', 'state', 'timezone', 'officeHours', 'workWeek', 'enabledProducts', 'createdAt',
  'profile', 'signatories', 'attendanceGeo', 'breakTypes', 'security', 'meetingsAi', 'theme', 'avatarStyle',
  'subscription.plan', 'subscription.status', 'subscription.accountType', 'subscription.products', 'subscription.seats', 'subscription.cycle',
  'subscription.trialEndsAt', 'subscription.currentPeriodStart', 'subscription.currentPeriodEnd', 'subscription.billing',
] as const

/** Never exported: keys, payment-provider ids and checkout state. */
export const WORKSPACE_EXPORT_NEVER = ['brandKey', 'subscription.razorpaySubscriptionId', 'subscription.razorpayPlanId', 'subscription.pendingCheckout', 'subscription.autopay', 'subscription.manual'] as const

/** The Mongo projection string. */
export const workspaceProjection = (): string => WORKSPACE_EXPORT_FIELDS.join(' ')
