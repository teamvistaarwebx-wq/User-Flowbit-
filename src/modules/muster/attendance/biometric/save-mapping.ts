import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { Employee } from '@/models/muster/Employee'
import { visibleEmployeeIds } from '../../people/scope'
import { BIOMETRIC_ID_HINT, BIOMETRIC_ID_PATTERN, biometricHolder } from './mapping'

const isDuplicateKey = (error: unknown): boolean => (error as { code?: number } | null)?.code === 11000

/** Shown when another save took the id first. */
export const BIOMETRIC_TAKEN = (biometricId: string): string => `Device id ${biometricId} was just mapped to someone else. Refresh and check again.`

/** Saves a device user id on an employee so the next biometric import maps it (server-only). */

export type SavedMapping = { employeeId: string; name: string; code: string; biometricId: string; previous: string | null }

/** Refuses an id another employee in the workspace already holds ("0007" and "7" are the same id). */
export async function assertBiometricIdFree(ctx: Pick<Ctx, 'db'>, biometricId: string, exceptId?: string): Promise<void> {
  const holders = await ctx.db(Employee).find({ deletedAt: null, biometricId: { $nin: [null, ''] } }, { biometricId: 1, code: 1, fullName: 1 }).lean()
  const clash = biometricHolder(holders.map((h) => ({ id: String(h._id), code: h.code, name: h.fullName, biometricId: h.biometricId })), biometricId, exceptId)
  if (clash) throw new UserError(`Device id ${biometricId} already belongs to ${clash.name} (${clash.code}).`, { biometricId: `Already used by ${clash.name}.` })
}

export async function saveDeviceMapping(ctx: Ctx, deviceId: string, employeeId: string): Promise<SavedMapping> {
  const biometricId = deviceId.trim()
  if (!BIOMETRIC_ID_PATTERN.test(biometricId)) throw new UserError(`That device id cannot be saved. ${BIOMETRIC_ID_HINT}`)
  if (!Types.ObjectId.isValid(employeeId)) throw new UserError('Choose someone from the list.')
  const visible = await visibleEmployeeIds(ctx)
  if (visible !== null && !visible.includes(employeeId)) throw new UserError('Choose someone from the list.')
  const employee = await ctx.db(Employee).findOne({ _id: new Types.ObjectId(employeeId), deletedAt: null }, { code: 1, fullName: 1, biometricId: 1 }).lean()
  if (!employee) throw new UserError('That person is no longer in the directory.')
  await assertBiometricIdFree(ctx, biometricId, employeeId)
  try {
    await ctx.db(Employee).updateOne({ _id: employee._id }, { $set: { biometricId } })
  } catch (error) {
    // The unique (orgId, biometricKey) index: someone else saved this id between the check and the write.
    if (isDuplicateKey(error)) throw new UserError(BIOMETRIC_TAKEN(biometricId), { biometricId: 'Already used by someone else.' })
    throw error
  }
  return { employeeId, name: employee.fullName, code: employee.code, biometricId, previous: employee.biometricId ?? null }
}
