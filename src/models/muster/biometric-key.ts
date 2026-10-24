import { deviceKey } from '@/modules/muster/attendance/biometric/punches'

/**
 * `Employee.biometricKey`: the device id as the importer compares it ("0007"
 * and "7" are one id), kept beside `biometricId` so a unique partial index
 * stops two people in a workspace holding the same id, even when two saves race.
 */

/** The normalised key, or null when there is no device id. */
export function biometricKeyOf(biometricId: unknown): string | null {
  if (typeof biometricId !== 'string' || !biometricId.trim()) return null
  return deviceKey(biometricId)
}

type UpdateDoc = Record<string, unknown> & { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }

/**
 * A copy of an update with `biometricKey` set or unset to match the
 * `biometricId` it writes; the update unchanged when it doesn't touch `biometricId`.
 */
export function withBiometricKey(update: UpdateDoc): UpdateDoc {
  const set = update.$set ?? {}
  const unset = update.$unset ?? {}
  const inSet = 'biometricId' in set
  const inRoot = 'biometricId' in update
  if (!inSet && !inRoot && !('biometricId' in unset)) return update
  const value = inSet ? set.biometricId : inRoot ? update.biometricId : null
  const key = biometricKeyOf(value)
  if (key) return { ...update, $set: { ...set, biometricKey: key } }
  return { ...update, $unset: { ...unset, biometricKey: 1 } }
}
