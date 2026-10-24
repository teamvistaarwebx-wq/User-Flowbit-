import type { Types } from 'mongoose'
import { hashToken, randomToken } from '@/lib/auth/tokens'
import type { StaffRole } from '@/lib/console/roles'
import { consoleUrl } from '@/lib/console/urls'
import { Staff } from '@/models/console/Staff'

/** Hours a "choose your Console password" link works. */
export const SETUP_LINK_HOURS = 48

/** A fresh one-time setup link for a staff member (replaces any earlier one). */
export async function issueSetupLink(staffId: Types.ObjectId): Promise<string> {
  const token = randomToken()
  await Staff.updateOne({ _id: staffId }, { $set: { setupTokenHash: hashToken(token), setupExpiresAt: new Date(Date.now() + SETUP_LINK_HOURS * 3_600_000) } })
  return consoleUrl(`/console/login/setup?token=${token}`)
}

/**
 * Creates a staff member. With a password hash (a migrated admin) they sign
 * in with it; without one the returned link lets them choose a password.
 * Every new staff member enrols TOTP on first sign-in.
 */
export async function createStaff(input: { email: string; name: string; role: StaffRole; passwordHash?: string | null; userId?: string | null; isFounder?: boolean; createdBy?: Types.ObjectId }): Promise<{ id: Types.ObjectId; setupLink: string | null }> {
  const staff = await Staff.create({
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    isFounder: Boolean(input.isFounder),
    passwordHash: input.passwordHash ?? undefined,
    userId: input.userId ?? undefined,
    createdBy: input.createdBy,
  })
  const setupLink = input.passwordHash ? null : await issueSetupLink(staff._id)
  return { id: staff._id, setupLink }
}
