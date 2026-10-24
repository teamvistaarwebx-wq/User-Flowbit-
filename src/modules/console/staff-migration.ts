/**
 * Plan for turning the old platform admins into Console staff (console spec
 * 7.1). Pure; scripts/migrate-staff.ts reads the data, prints this plan and
 * applies it only with --apply.
 *
 * Founder-only by default (V2-REVIEW C6): only the --founder address becomes
 * an Admin. `includeOthers` (--all) adds every other isPlatformAdmin user and
 * PLATFORM_ADMIN_EMAILS address. Product passwords are never carried over:
 * everyone created chooses a Console password through a one-time setup link
 * and enrols their own authenticator, so knowing someone's product password
 * opens nothing.
 */

export type LegacyAdmin = { userId: string; email: string; name: string; passwordHash?: string | null }

export type StaffCreate = { email: string; name: string; userId: string | null; isFounder: boolean; source: 'isPlatformAdmin' | 'PLATFORM_ADMIN_EMAILS' | 'founder' }

export type StaffMigrationPlan = {
  create: StaffCreate[]
  /** Already staff, or left out by the founder-only default (the script never changes a role). */
  skip: { email: string; reason: string }[]
}

const nameFrom = (email: string) => email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const normal = (email: string) => email.trim().toLowerCase()

export function planStaffMigration(input: {
  platformAdmins: readonly LegacyAdmin[]
  /** Users found for the PLATFORM_ADMIN_EMAILS addresses and the founder (by email). */
  usersByEmail: ReadonlyMap<string, LegacyAdmin>
  listedEmails: readonly string[]
  existingStaffEmails: ReadonlySet<string>
  /** --founder: the one Admin created by default (may open Internal workspaces). */
  founder: string | null
  /** --all: also the other platform admins and listed addresses. */
  includeOthers: boolean
}): StaffMigrationPlan {
  const create: StaffCreate[] = []
  const skip: StaffMigrationPlan['skip'] = []
  const seen = new Set<string>()
  const founder = input.founder ? normal(input.founder) : null
  const lookup = (key: string) => input.usersByEmail.get(key) ?? input.platformAdmins.find((a) => normal(a.email) === key)
  const add = (email: string, admin: LegacyAdmin | undefined, source: StaffCreate['source']) => {
    const key = normal(email)
    if (!key || seen.has(key)) return
    seen.add(key)
    if (input.existingStaffEmails.has(key)) {
      skip.push({ email: key, reason: 'already Console staff' })
      return
    }
    const isFounder = key === founder
    if (!isFounder && !input.includeOthers) {
      skip.push({ email: key, reason: 'not the founder (add --all to include, or add them later in Console → Staff)' })
      return
    }
    create.push({ email: key, name: admin?.name?.trim() || nameFrom(key), userId: admin?.userId ?? null, isFounder, source: isFounder ? 'founder' : source })
  }
  if (founder) add(founder, lookup(founder), 'founder')
  for (const admin of input.platformAdmins) add(admin.email, admin, 'isPlatformAdmin')
  for (const email of input.listedEmails) add(email, lookup(normal(email)), 'PLATFORM_ADMIN_EMAILS')
  return { create, skip }
}
