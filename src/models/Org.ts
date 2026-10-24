import { ADD_ONS } from '@/lib/addons'
import { AVATAR_STYLES } from '@/lib/avatar-pattern'
import { Schema } from 'mongoose'
import { ACCOUNT_TYPES } from '@/lib/account-types'
import { WORKSPACE_KINDS } from '@/lib/workspace-kind'
import { defineModel } from '@/lib/db/model'

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired'] as const
export const ORG_PLANS = ['trial', 'suite', 'custom'] as const
export const BILLING_CYCLES = ['monthly', 'yearly'] as const

const productsShape = () => ({
  work: { type: Boolean, default: true },
  muster: { type: String, enum: ['starter', 'business', null], default: 'business' },
  orbit: { type: Boolean, default: true },
  folio: { type: Boolean, default: true },
})

const quantitiesShape = () => ({
  work: { type: Number, default: 0 },
  muster: { type: Number, default: 0 },
  orbit: { type: Number, default: 0 },
  /** Folio firms paid for beyond the 2 included (lib/plans FOLIO_INCLUDED_FIRMS). */
  folioFirms: { type: Number, default: 0 },
})

/** A one-time trial of a product the paid plan does not include (no longer offered since 11 Oct 2026; kept so running ones end normally). */
const ProductTrialSchema = new Schema(
  {
    product: { type: String, enum: ['work', 'muster', 'orbit', 'folio'], required: true },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    startedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { _id: false },
)

/** Workspace brand colours (#RRGGBB); unset fields fall back to Flowbit's (lib/brand-theme). */
const ThemeSchema = new Schema(
  {
    primary: { type: String, match: /^#[0-9a-f]{6}$/i },
    secondary: { type: String, match: /^#[0-9a-f]{6}$/i },
    accent: { type: String, match: /^#[0-9a-f]{6}$/i },
  },
  { _id: false },
)

/**
 * Settings → Company profile (lib/company-profile): what every PDF prints in its letterhead. Address, GSTIN
 * and logo stay on the Org itself (logoFileId, address, gstin); `pan` here is the printed PAN, separate from the
 * signup PAN on the Org (one Free workspace per PAN). Read through companyProfileOf, which fills the gaps.
 */
const CompanyProfileSchema = new Schema(
  {
    legalName: { type: String, trim: true },
    tradeName: { type: String, trim: true },
    /** Unset on older workspaces: read as "has a GSTIN". */
    gstRegistered: { type: Boolean },
    pan: { type: String, uppercase: true, trim: true },
    cinLlpin: { type: String, trim: true },
    website: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    /** Payslips print the default signatory's signature instead of the computer-generated line (default off). */
    signPayslips: { type: Boolean, default: false },
  },
  { _id: false },
)

/** An authorised signatory. Signature and seal are private files (kinds company_signature / company_seal), never served by a route. */
const SignatorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    signatureFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    sealFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true },
)

/** A downgrade or cycle change scheduled for the next renewal (platform spec 6.11). */
const PendingChangeSchema = new Schema(
  {
    plan: { type: String, enum: ['suite', 'custom'], required: true },
    products: productsShape(),
    quantities: quantitiesShape(),
    seats: { type: Number, default: 0 },
    cycle: { type: String, enum: BILLING_CYCLES, default: 'monthly' },
    amountPaise: { type: Number, default: 0 },
    /** Unit prices (paise per month by plan key) the change was quoted at (lib/plan-config). */
    unitPrices: { type: Schema.Types.Mixed },
    effectiveAt: { type: Date, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { _id: false },
)

/** Invoice addressee for Flowbit's own GST invoices; required before the first checkout. */
const BillingDetailsSchema = new Schema(
  {
    legalName: { type: String, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      /** 2-letter state code ('MP'); see INDIA_STATES in lib/validation. */
      stateCode: String,
      pincode: String,
    },
  },
  { _id: false },
)

const SubscriptionSchema = new Schema(
  {
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'trialing' },
    plan: { type: String, enum: ORG_PLANS, default: 'trial' },
    /**
     * Who the workspace is to Flowbit (console spec 4.1). No default: read it
     * through lib/account-types accountTypeOf, which resolves a missing value
     * from the plan (scripts/migrate-account-types.ts stores it).
     */
    accountType: { type: String, enum: ACCOUNT_TYPES },
    /** Comped / Partner: when the free or custom price ends (required for that type). */
    compedUntil: { type: Date },
    products: productsShape(),
    seats: { type: Number, default: 10 },
    /** Billed quantity per product for custom plans (0 when absent). Folio is flat. */
    quantities: quantitiesShape(),
    cycle: { type: String, enum: BILLING_CYCLES, default: 'monthly' },
    trialEndsAt: { type: Date },
    /** When the workspace's one 15-day trial began (signup Trial or "Start trial" from Free). Set = used (lib/lifecycle). */
    trialStartedAt: { type: Date },
    /** End of the 6-month Free window; kept while a trial runs so trimming to 5 people returns to Free. */
    freeEndsAt: { type: Date },
    currentPeriodStart: { type: Date },
    /** Exclusive end instant (= next period's start). */
    currentPeriodEnd: { type: Date },
    /** Price per period ex-GST, frozen at purchase. */
    amountPaise: { type: Number, default: 0 },
    /** Unit prices (paise per month by plan key) frozen at purchase, so renewals keep them when Console prices change. */
    unitPrices: { type: Schema.Types.Mixed },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date },
    pastDueSince: { type: Date },
    /** Set when the status becomes 'expired' (trial or period end). */
    endedAt: { type: Date },
    pendingChange: { type: PendingChangeSchema },
    productTrials: { type: [ProductTrialSchema], default: [] },
    /** Paid add-ons switched on from the Console (lib/addons): 'portal', 'meetings_ai'. */
    addOns: { type: [String], enum: ADD_ONS, default: [] },
    razorpaySubscriptionId: { type: String },
    /**
     * Autopay through a Razorpay subscription set up from a link (console spec 11): the state
     * machine in modules/billing/autopay-state. The checkout subscription keeps razorpaySubscriptionId.
     */
    autopay: {
      type: new Schema(
        {
          status: { type: String, enum: ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed'] },
          subscriptionId: String,
          planId: String,
          shortUrl: String,
          /** The amount each debit takes, GST included (pre-debit notice, AFA note). */
          amountPaise: Number,
          nextChargeAt: Date,
          lastChargedAt: Date,
          failedAt: Date,
          updatedAt: Date,
        },
        { _id: false },
      ),
    },
    /** An offline payment waits for bank verification: full access until this time (modules/billing/offline). */
    provisionalUntil: { type: Date },
    provisionalPaymentId: { type: Schema.Types.ObjectId, ref: 'OfflinePayment' },
    razorpayPlanId: { type: String },
    /** Between startCheckout and confirmCheckout: { razorpaySubscriptionId, razorpayPlanId, selection, amountPaise, totalPaise, createdAt }. */
    pendingCheckout: { type: Schema.Types.Mixed },
    billing: { type: BillingDetailsSchema },
    /** Set by Flowbit staff from the Console (setBy: the Staff id). */
    manual: {
      type: new Schema({ note: String, setBy: { type: Schema.Types.ObjectId, ref: 'Staff' }, setAt: Date }, { _id: false }),
    },
  },
  { _id: false },
)

const OrgSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logoFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    /** Random key of the public logo URL in client-facing email (lib/email-brand); made on first use. */
    brandKey: { type: String },
    /** Brand colours applied to the app shell (Settings → Appearance). */
    theme: { type: ThemeSchema },
    /** Avatars without a photo: initials on a colour or a generated pattern (lib/avatar-pattern; Settings → Appearance). */
    avatarStyle: { type: String, enum: AVATAR_STYLES, default: 'initials' },
    teamSize: { type: String, default: '2-10' },
    mode: { type: String, enum: ['project', 'personal'], default: 'project' },
    /** Freelancer, Agency or Business, picked at onboarding (lib/workspace-kind); missing reads as Agency. */
    workspaceKind: { type: String, enum: WORKSPACE_KINDS, default: 'agency' },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    gstin: { type: String },
    /** PAN given at signup (or the PAN inside the GSTIN): one Free workspace per PAN (console spec 5.2). */
    pan: { type: String, uppercase: true, trim: true },
    state: { type: String },
    profile: { type: CompanyProfileSchema, default: undefined },
    signatories: { type: [SignatorySchema], default: [] },
    timezone: { type: String, default: 'Asia/Kolkata' },
    officeHours: {
      start: { type: String, default: '10:00' },
      end: { type: String, default: '19:00' },
      halfDayHours: { type: Number, default: 4.5 },
      graceMinutes: { type: Number, default: 15 },
    },
    /** Location at web check-in (lib/geo; Muster → HR settings → Attendance rules): off / optional / required, office geofences, outside = flag or block. */
    attendanceGeo: {
      type: new Schema(
        {
          mode: { type: String, enum: ['off', 'optional', 'required'], default: 'off' },
          outside: { type: String, enum: ['flag', 'block'], default: 'flag' },
          offices: {
            // lib/geo Office: the pin, the phone circle (radiusM) and the laptop circle; `active: false` pauses an office.
            type: [
              new Schema(
                {
                  id: { type: String, trim: true, maxlength: 40 },
                  name: { type: String, trim: true, maxlength: 80 },
                  address: { type: String, trim: true, maxlength: 300 },
                  lat: { type: Number, min: -90, max: 90 },
                  lng: { type: Number, min: -180, max: 180 },
                  radiusM: { type: Number, min: 25, max: 5000 },
                  laptopRadiusM: { type: Number, min: 25, max: 5000 },
                  active: { type: Boolean },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      default: undefined,
    },
    /** Break types: paid or unpaid and a daily limit each (lib/break-types; Muster → HR settings → Attendance rules). */
    breakTypes: { type: Schema.Types.Mixed },
    /** Working weekdays in JS getDay() numbering: 0 = Sunday ... 6 = Saturday. Default Mon-Sat. */
    workWeek: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    subscription: { type: SubscriptionSchema, default: () => ({}) },
    enabledProducts: { type: [String], default: ['work', 'muster', 'orbit', 'folio'] },
    /** Platform-disabled: every /app page shows the disabled notice. Details in disabledAt/By/Reason. */
    disabled: { type: Boolean, default: false },
    disabledAt: { type: Date },
    /** The Staff member who disabled it (Console). */
    disabledBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
    disabledReason: { type: String },
    /** Owner soft delete; members lose access. Platform can restore within 30 days. Also set on a lifecycle tombstone. */
    deletedAt: { type: Date },
    /** 'deleted': the lifecycle job removed the workspace's data and left this tombstone (modules/lifecycle/purge). */
    status: { type: String, enum: ['active', 'deleted'], default: 'active' },
    /** When the lifecycle job removed the workspace's data. */
    purgedAt: { type: Date },
    /** Plan picked on the pricing page before signup, as `plan=custom&products=work,folio` (lib/plan-intent); preselects the subscription picker. */
    planIntent: { type: String },
    /** First-touch campaign of the signup (lib/utm): utm_* tags, the referring host and the landing path. Console reports → Marketing. */
    signupUtm: {
      type: new Schema({ source: String, medium: String, campaign: String, term: String, content: String, referrer: String, landing: String }, { _id: false }),
      default: undefined,
    },
    /** First-run activation (modules/activation): the Home checklist dismissed, the sample agency loaded. */
    activation: {
      type: new Schema({ checklistDismissedAt: Date, sampleLoadedAt: Date }, { _id: false }),
      default: undefined,
    },
    /** Meetings AI (Settings → Privacy): recordings and transcripts are purged this many days after the meeting (default 90). */
    meetingsAi: {
      type: new Schema({ retentionDays: { type: Number, min: 7, max: 3650, default: 90 } }, { _id: false }),
      default: undefined,
    },
    /** Settings → Security: owners and admins must use two-factor sign-in (default off); teammates may mail each other's email-to-task address (default off: only the owner of the address). */
    security: {
      type: new Schema({ requireTwoFactorAdmins: { type: Boolean, default: false }, mailToTaskTeammates: { type: Boolean, default: false } }, { _id: false }),
      default: undefined,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    /** The owner accepted Flowbit's data processing agreement (console spec 9; lib/console/support-access DPA_VERSION). */
    dpa: {
      type: new Schema({ version: String, acceptedAt: Date, acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { _id: false }),
    },
  },
  { timestamps: true },
)

OrgSchema.index({ brandKey: 1 }, { unique: true, partialFilterExpression: { brandKey: { $type: 'string' } } })

export const Org = defineModel('Org', OrgSchema)
