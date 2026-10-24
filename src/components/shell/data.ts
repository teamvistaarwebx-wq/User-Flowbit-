import 'server-only'
import { localeOfUser, type Locale } from '@/lib/i18n'
import mongoose from 'mongoose'
import { PRODUCT_KEYS, type ProductKey } from '@/lib/catalog'
import type { Ctx } from '@/lib/ctx'
import { checkInGeoFor, officeHoursOf, todayState, type TodayState } from '@/lib/attendance'
import { workdayMinutes } from './punch-dial-model'
import { needsLocationConsent, type GeoMode } from '@/lib/geo'
import { mergeBreakPolicies, type BreakPolicies } from '@/lib/break-types'
import { themeCss, workspaceTheme } from '@/lib/brand-theme'
import { isAvatarStyle, type AvatarStyle } from '@/lib/avatar-pattern'
import { appUrl } from '@/lib/env'
import { fileUrl } from '@/lib/files'
import type { AccountType } from '@/lib/account-types'
import type { LifecycleView } from '@/lib/lifecycle-copy'
import { canUseFeature } from '@/lib/entitlements'
import { enabled, productTrialDaysLeft, type AccessState } from '@/lib/plans'
import { kindAllowsProduct, workspaceKindOf, type WorkspaceKind } from '@/lib/workspace-kind'
import { Member } from '@/models/Member'
import { Notification } from '@/models/Notification'
import { Org } from '@/models/Org'
import { SupportAccess } from '@/models/console/SupportAccess'
import { projectAccessMatch } from '@/modules/work/projects/access'
import { isWhatsAppConnected } from '@/modules/whatsapp/connection'
import { whatsAppEnabled } from '@/modules/features/flags'

export type ShellLink = { id: string; name: string; color?: string }

export type ShellData = {
  /** `toursSeen`: product tours finished or skipped (modules/activation/tours). */
  user: { name: string; email: string; avatarUrl: string | null; sound: boolean; reducedMotion: boolean; motion: 'system' | 'reduce' | 'full'; toursSeen: string[]; locale: Locale }
  /** `logoUrl` is the workspace's own logo (Settings → General), null for initials. */
  org: { id: string; name: string; slug: string; logoUrl: string | null }
  /** Freelancer, Agency or Business (lib/workspace-kind). */
  workspaceKind: WorkspaceKind
  orgs: { id: string; name: string; slug: string; logoUrl: string | null }[]
  /** Public base URL (APP_URL, no trailing slash) for links people copy or share. */
  appUrl: string
  /** `:root{…}` brand colour overrides (validated hex only), '' for Flowbit's palette. */
  themeCss: string
  /** Workspace avatar style (lib/avatar-pattern): initials on a colour or a generated pattern. */
  avatarStyle: AvatarStyle
  roleLabel: string
  permissions: string[]
  /** `hidden`: the workspace kind leaves the product out (Muster for a freelancer), so it is not even offered. */
  products: Record<ProductKey, { entitled: boolean; enabled: boolean; hidden?: boolean }>
  /** `whatsapp`: the platform WhatsApp flag (lib/feature-flags); every WhatsApp control hides while it is off. */
  features: { payroll: boolean; whatsapp: boolean }
  hasEmployee: boolean
  /** The workspace's own WhatsApp number is connected (the inbox link shows). */
  whatsapp: boolean
  projects: ShellLink[]
  teams: ShellLink[]
  today: TodayState
  /** Break types (paid or unpaid, daily limits) for the Take break picker. */
  breaks: BreakPolicies
  /** Office start to end in minutes (Settings → office hours): the full circle of the punch dial's work ring. */
  workdayMinutes: number
  /**
   * Location at check-in (lib/geo): the mode for this member and whether they accepted the notice. `remote`: their
   * employee record works remotely, so the mode is off for them (lib/attendance checkInGeoFor).
   */
  checkInGeo: { mode: GeoMode; consented: boolean; remote: boolean }
  unread: number
  trialDaysLeft: number | null
  /** Free, Trial, Paid... (lib/account-types): the countdown banner words itself by it. */
  accountType: AccountType
  /** Days left in running one-time product trials (paid plans only). */
  productTrials: Partial<Record<ProductKey, number>>
  readOnlyDaysLeft: number | null
  /** Trial or subscription wording for the read-only banner and refusals. */
  readOnlyMessage: string
  access: AccessState
  /** Lifecycle stage and dates (lib/lifecycle) for the banner: state, days left, what happens next. */
  lifecycle: LifecycleView
  /** A Free workspace may still start its one 15-day trial. */
  trialAvailable: boolean
  isOwner: boolean
  /** Flowbit support access running now (console spec 8): shown as a banner to everyone in the workspace. */
  support: { staffName: string; mode: 'read' | 'import'; until: string } | null
}

const SIDE_LIMIT = 6

type RawDoc = { _id: unknown; name?: unknown; color?: unknown }

/**
 * Reads Work's projects/teams straight from their collections so the shell
 * never imports product models (they may not exist yet). Missing collections
 * just give empty lists.
 */
async function readCollection(ctx: Ctx, name: string, filter: Record<string, unknown>): Promise<ShellLink[]> {
  const db = mongoose.connection.db
  if (!db || !ctx.has('work')) return []
  try {
    const rows = (await db.collection(name).find({ orgId: ctx.orgId, ...filter }, { projection: { name: 1, color: 1 } }).sort({ updatedAt: -1 }).limit(SIDE_LIMIT).toArray()) as RawDoc[]
    return rows.map((r) => ({ id: String(r._id), name: String(r.name ?? 'Untitled'), color: typeof r.color === 'string' ? r.color : undefined }))
  } catch (error) {
    console.error(`[shell] could not read ${name}`, error)
    return []
  }
}

/** The live workspaces the user is an active member of, for the switcher. */
async function memberOrgs(ctx: Ctx) {
  const memberships = await Member.find({ userId: ctx.userId, status: 'active' }, { orgId: 1 }).lean()
  return Org.find({ _id: { $in: memberships.map((m) => m.orgId) }, deletedAt: null }, { name: 1, slug: 1, logoFileId: 1 }).sort({ name: 1 }).lean()
}

export async function getShellData(ctx: Ctx): Promise<ShellData> {
  const [orgs, unread, today, projects, teams, support, whatsapp, whatsappOn, geo] = await Promise.all([
    memberOrgs(ctx),
    Notification.countDocuments({ orgId: ctx.orgId, userId: ctx.userId, readAt: null }),
    todayState(ctx),
    // Only projects this member can open (Work spec A5.2), so the side panel never links to a 404.
    ctx.can('projects.read') ? readCollection(ctx, 'projects', { status: { $nin: ['completed', 'cancelled'] }, ...projectAccessMatch(String(ctx.memberId), ctx.can('projects.write'), () => ctx.memberId) }) : Promise.resolve([]),
    readCollection(ctx, 'teams', {}),
    ctx.db(SupportAccess).findOne({ status: 'approved', expiresAt: { $gt: new Date() } }, { staffName: 1, mode: 1, expiresAt: 1 }).sort({ expiresAt: -1 }).lean(),
    isWhatsAppConnected(ctx.orgId).catch(() => false),
    whatsAppEnabled(),
    ctx.has('muster') ? checkInGeoFor(ctx) : null,
  ])
  const ent = ctx.entitlements
  const kind = workspaceKindOf(ctx.org)
  const products = Object.fromEntries(PRODUCT_KEYS.map((p) => [p, { entitled: ent.entitledProducts.includes(p), enabled: enabled(ctx.org, p), hidden: !kindAllowsProduct(kind, p) }])) as ShellData['products']
  return {
    user: {
      name: ctx.user.name,
      email: ctx.user.email,
      avatarUrl: ctx.user.avatarFileId ? fileUrl(ctx.user.avatarFileId) : null,
      sound: ctx.user.prefs?.sound ?? true,
      reducedMotion: ctx.user.prefs?.reducedMotion ?? false,
      motion: ctx.user.prefs?.motion === 'reduce' || ctx.user.prefs?.reducedMotion ? 'reduce' : ctx.user.prefs?.motion === 'full' ? 'full' : 'system',
      toursSeen: [...(ctx.user.prefs?.toursSeen ?? [])],
      locale: localeOfUser(ctx.user),
    },
    org: { id: String(ctx.orgId), name: ctx.org.name, slug: ctx.org.slug, logoUrl: ctx.org.logoFileId ? fileUrl(ctx.org.logoFileId) : null },
    workspaceKind: kind,
    orgs: orgs.map((o) => ({ id: String(o._id), name: o.name, slug: o.slug, logoUrl: o.logoFileId ? fileUrl(o.logoFileId) : null })),
    appUrl: appUrl(),
    themeCss: themeCss(workspaceTheme(ctx.org)),
    avatarStyle: isAvatarStyle(ctx.org.avatarStyle) ? ctx.org.avatarStyle : 'initials',
    roleLabel: ctx.roleLabel,
    permissions: [...ctx.permissions],
    products,
    features: { payroll: canUseFeature(ent, 'muster.payroll'), whatsapp: whatsappOn },
    hasEmployee: Boolean(ctx.member.employeeId),
    whatsapp,
    projects,
    teams,
    today,
    breaks: mergeBreakPolicies(ctx.org.breakTypes),
    workdayMinutes: workdayMinutes(officeHoursOf(ctx)),
    checkInGeo: { mode: geo?.settings.mode ?? 'off', consented: !needsLocationConsent(ctx.member.locationConsent), remote: geo?.remote ?? false },
    unread,
    trialDaysLeft: ent.trialDaysLeft,
    accountType: ent.accountType,
    productTrials: PRODUCT_KEYS.reduce<ShellData['productTrials']>((acc, p) => {
      const left = productTrialDaysLeft(ctx.org, p)
      return left == null ? acc : { ...acc, [p]: left }
    }, {}),
    readOnlyDaysLeft: ent.readOnlyDaysLeft,
    readOnlyMessage: ent.readOnlyMessage,
    access: ent.access,
    lifecycle: {
      stage: ent.lifecycle.stage,
      accountType: ent.lifecycle.accountType,
      daysLeft: ent.lifecycle.daysLeft,
      endsAt: ent.lifecycle.endsAt?.toISOString() ?? null,
      deleteAt: ent.lifecycle.deleteAt?.toISOString() ?? null,
      freeWindowEndsAt: ent.lifecycle.freeWindowEndsAt?.toISOString() ?? null,
      freeSeats: ctx.planConfig.freeSeats,
    },
    trialAvailable: ent.trialAvailable,
    isOwner: ctx.isOwner,
    support: support?.expiresAt ? { staffName: support.staffName, mode: support.mode, until: support.expiresAt.toISOString() } : null,
  }
}
