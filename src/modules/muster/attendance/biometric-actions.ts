'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatMonth } from '@/lib/dates'
import { objectId } from '@/lib/validation'
import { recordBatch } from '@/modules/imports/record'
import { BIOMETRIC_FORMATS, PUNCH_FIELDS, type PunchColumns } from './biometric/formats'
import { DEFAULT_CUTOFF } from './biometric/punches'
import { checkBiometric, type BiometricInput, type BiometricPreview } from './biometric/run'
import { saveDeviceMapping } from './biometric/save-mapping'
import { commitAttendance, marksOf } from './import-run'

/** HR → Attendance → Import → From a biometric device: check (writes nothing), write, and save device id mappings. */

const OPTS = { product: 'muster', perm: 'attendance.manage' } as const
const HEADER = z.string().max(80).optional()

const fileSchema = z.object({
  file: z.instanceof(File, { error: 'Choose the device export' }),
  format: z.enum(BIOMETRIC_FORMATS).default('auto'),
  cutoff: z.string().regex(/^\d{1,2}:\d{2}$/, 'Give the cutoff as HH:MM, e.g. 04:00').default(DEFAULT_CUTOFF),
  ...Object.fromEntries(PUNCH_FIELDS.map((f) => [`map_${f}`, HEADER])),
})

type FileInput = z.output<typeof fileSchema>

function picksOf(input: FileInput): PunchColumns {
  const record = input as Record<string, unknown>
  return Object.fromEntries(PUNCH_FIELDS.flatMap((f) => (typeof record[`map_${f}`] === 'string' ? [[f, record[`map_${f}`] as string]] : [])))
}

async function biometricInput(input: FileInput): Promise<BiometricInput> {
  return { fileName: input.file.name, bytes: Buffer.from(await input.file.arrayBuffer()), format: input.format, picks: picksOf(input), cutoff: input.cutoff }
}

/** Step 1: reads the punches, groups them into days and checks every day. Writes nothing. */
export const checkBiometricImport = action(
  fileSchema,
  async (input, ctx) => {
    const result = await checkBiometric(ctx, await biometricInput(input))
    if (typeof result === 'string') return fail(result)
    return ok<BiometricPreview>(result.preview.summary, result.preview)
  },
  OPTS,
)

/** Step 2: re-reads the file (never the preview), writes the ready days in one transaction and records an undoable batch. */
export const runBiometricImport = action(
  fileSchema,
  async (input, ctx) => {
    const result = await checkBiometric(ctx, await biometricInput(input))
    if (typeof result === 'string') return fail(result)
    const writes = marksOf(result.check).map((w) => ({ ...w, reason: w.reason || 'Imported from a biometric device' }))
    if (!writes.length) return fail('No day is ready to write. Map the device ids or fix the days the preview lists, then check the file again.')
    const committed = await commitAttendance(ctx, writes)
    await recordBatch(ctx, { kind: 'attendance', label: 'Attendance (biometric)', fileName: input.file.name || 'punches', actor: { source: 'self', userId: ctx.userId, name: ctx.user.name }, rows: result.preview.punches, result: committed })
    const months = [...new Set(writes.map((w) => w.date.slice(0, 7)))].sort().map(formatMonth)
    const where = months.length > 2 ? `${months.length} months` : months.join(' and ')
    const skipped = result.check.rows.length - writes.length
    await audit(ctx, { action: 'attendance.imported', entity: 'AttendanceDay', summary: `${writes.length} attendance days imported from a biometric device for ${where}`, product: 'muster', meta: { count: writes.length, skipped, months, format: result.preview.format, punches: result.preview.punches } })
    revalidatePath('/app/hr/attendance')
    return ok(`${writes.length} days written for ${where}.${skipped ? ` ${skipped} days were left out.` : ''} You can undo this in Settings → Import for 7 days.`, undefined, '/app/hr/attendance?view=month')
  },
  OPTS,
)

const mappingSchema = z.object({ deviceId: z.string().trim().min(1, 'The device id is missing').max(32), employeeId: objectId })

/** Saves a device user id on an employee, so this and later imports map it. */
export const saveBiometricMapping = action(
  mappingSchema,
  async ({ deviceId, employeeId }, ctx) => {
    const saved = await saveDeviceMapping(ctx, deviceId, employeeId)
    await audit(ctx, { action: 'employee.biometric_id', entity: 'Employee', entityId: employeeId, summary: `Device id ${saved.biometricId} mapped to ${saved.name}${saved.previous ? ` (was ${saved.previous})` : ''}`, product: 'muster' })
    return ok(`Device id ${saved.biometricId} is now ${saved.name}. Check the file again to include their days.`, saved)
  },
  OPTS,
)
