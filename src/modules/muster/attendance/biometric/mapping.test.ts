import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'
import { checkAttendanceRows, IMPORT_COLUMNS, mapColumns, type ImportContext } from '../import'
import { biometricHolder, daysToRows, deviceResolver, type MappableEmployee } from './mapping'
import { buildDays } from './punches'
import type { RawPunch } from './formats'

vi.mock('server-only', () => ({}))

const ADITI = { id: new Types.ObjectId().toHexString(), code: 'VW-0001', name: 'Aditi Sharma', biometricId: '17' }
const RAVI = { id: new Types.ObjectId().toHexString(), code: '23', name: 'Ravi Kumar', biometricId: null }
const MANISH = { id: new Types.ObjectId().toHexString(), code: '5', name: 'Manish Yadav', biometricId: '50' }
const STAFF: MappableEmployee[] = [ADITI, RAVI, MANISH]

const punch = (line: number, deviceId: string, date: string, hhmm: string): RawPunch => {
  const [h, m] = hhmm.split(':').map(Number)
  return { line, deviceId, date, seconds: h * 3600 + m * 60, direction: null }
}

describe('device id mapping', () => {
  it('matches a saved biometric id first, then the employee code', () => {
    const resolve = deviceResolver(STAFF)
    expect(resolve('0017')).toMatchObject({ employee: { name: 'Aditi Sharma' }, by: 'biometric_id' })
    expect(resolve('23')).toMatchObject({ employee: { name: 'Ravi Kumar' }, by: 'code' })
    // Someone with a saved device id is matched by it alone: Aditi's code and Manish's code 5 point at nobody.
    expect(resolve('vw-0001')).toBeNull()
    expect(resolve('5')).toBeNull()
    expect(resolve('99')).toBeNull()
  })

  it('lists unmapped device ids with their days and punches, and turns mapped days into import rows', () => {
    const days = buildDays([punch(2, '17', '2026-10-01', '09:55'), punch(3, '17', '2026-10-01', '19:05'), punch(4, '99', '2026-10-01', '09:00'), punch(5, '99', '2026-10-02', '09:00'), punch(6, '99', '2026-10-02', '18:00')])
    const { rows, unmapped, dayByLine } = daysToRows(days, deviceResolver(STAFF))
    expect(unmapped).toEqual([{ deviceId: '99', days: 2, punches: 3 }])
    expect(rows).toEqual([{ line: 2, values: { code: 'VW-0001', date: '2026-10-01', status: '', in: '09:55', out: '19:05', note: 'Biometric device (2 punches)' } }])
    expect(dayByLine.get(2)?.punches).toBe(2)
  })

  it('finds who already holds an id, ignoring leading zeros and the person being edited', () => {
    expect(biometricHolder(STAFF, '017')?.name).toBe('Aditi Sharma')
    expect(biometricHolder(STAFF, '17', ADITI.id)).toBeNull()
    expect(biometricHolder(STAFF, '23')).toBeNull()
  })
})

describe('saving a mapping for next time', () => {
  /** A stand-in for ctx.db(Employee) over an in-memory list. */
  function fakeCtx(people: MappableEmployee[]) {
    const store = people.map((p) => ({ _id: new Types.ObjectId(p.id), code: p.code, fullName: p.name, biometricId: p.biometricId ?? null, deletedAt: null }))
    const updates: { id: string; set: Record<string, unknown> }[] = []
    const model = {
      find: () => ({ lean: async () => store.filter((s) => s.biometricId) }),
      findOne: (q: { _id: Types.ObjectId }) => ({ lean: async () => store.find((s) => s._id.equals(q._id)) ?? null }),
      updateOne: async (q: { _id: Types.ObjectId }, u: { $set: Record<string, unknown> }) => {
        updates.push({ id: String(q._id), set: u.$set })
        const i = store.findIndex((s) => s._id.equals(q._id))
        store.splice(i, 1, { ...store[i], ...(u.$set as { biometricId: string }) })
        return { modifiedCount: 1 }
      },
    }
    const ctx = { db: () => model, can: () => true, member: {} }
    return { ctx: ctx as never, store, updates }
  }

  it('stores the device id on the employee, and the next import maps it', async () => {
    const { saveDeviceMapping } = await import('./save-mapping')
    const { ctx, store, updates } = fakeCtx(STAFF)
    expect(deviceResolver(STAFF)('99')).toBeNull()
    const saved = await saveDeviceMapping(ctx, ' 99 ', RAVI.id)
    expect(saved).toMatchObject({ biometricId: '99', name: 'Ravi Kumar', previous: null })
    expect(updates).toEqual([{ id: RAVI.id, set: { biometricId: '99' } }])
    const next = deviceResolver(store.map((s) => ({ id: String(s._id), code: s.code, name: s.fullName, biometricId: s.biometricId })))
    expect(next('99')?.employee.name).toBe('Ravi Kumar')
  })

  it('refuses an id someone else holds, a malformed id and an unknown person', async () => {
    const { saveDeviceMapping } = await import('./save-mapping')
    const { ctx, updates } = fakeCtx(STAFF)
    await expect(saveDeviceMapping(ctx, '0017', RAVI.id)).rejects.toThrow('already belongs to Aditi Sharma')
    await expect(saveDeviceMapping(ctx, '17 18', RAVI.id)).rejects.toThrow('cannot be saved')
    await expect(saveDeviceMapping(ctx, '77', new Types.ObjectId().toHexString())).rejects.toThrow('no longer in the directory')
    expect(updates).toEqual([])
  })

  it('explains a clash the unique index caught when two saves race (R2 16.1)', async () => {
    // Arrange
    const { saveDeviceMapping } = await import('./save-mapping')
    const { ctx } = fakeCtx(STAFF)
    const raced = { ...(ctx as { db: () => object }), db: () => ({ ...(ctx as { db: () => object }).db(), updateOne: async () => Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 })) }) }

    // Act
    const saving = saveDeviceMapping(raced as never, '88', RAVI.id)

    // Assert
    await expect(saving).rejects.toThrow('Device id 88 was just mapped to someone else')
  })
})

describe('biometric days through the attendance checks', () => {
  const ctx: ImportContext = {
    employees: new Map([['vw-0001', { id: ADITI.id, code: 'VW-0001', name: 'Aditi Sharma', joinDate: '2021-09-06' }]]),
    lockedMonths: new Set(['2026-09']),
    today: '2026-10-09',
    allowAfterMidnight: true,
  }
  const check = (punches: RawPunch[], context = ctx) => {
    const { rows } = daysToRows(buildDays(punches), deviceResolver(STAFF))
    return checkAttendanceRows(rows, mapColumns([...IMPORT_COLUMNS]).columns, context)
  }

  it('refuses days in a locked month', () => {
    const [row] = check([punch(2, '17', '2026-09-30', '09:55'), punch(3, '17', '2026-09-30', '19:00')])
    expect(row.errors.join(' ')).toContain('September 2026 is locked')
    expect(row.record).toBeUndefined()
  })

  it('a punch at 00:30 on 1 October belongs to 30 September, so that day is refused too', () => {
    const [row] = check([punch(2, '17', '2026-09-30', '21:00'), punch(3, '17', '2026-10-01', '00:30')])
    expect(row.date).toBe('2026-09-30')
    expect(row.errors.join(' ')).toContain('locked')
  })

  it('works out the status from the times and keeps an after-midnight out', () => {
    const [late] = check([punch(2, '17', '2026-10-01', '10:40'), punch(3, '17', '2026-10-01', '19:10')])
    expect(late.record).toMatchObject({ status: 'late', in: '10:40', out: '19:10' })
    const [night] = check([punch(2, '17', '2026-10-05', '20:00'), punch(3, '17', '2026-10-06', '02:00')])
    expect(night.errors).toEqual([])
    expect(night.record).toMatchObject({ date: '2026-10-05', in: '20:00', out: '26:00' })
  })

  it('the template import still refuses times past 23:59', () => {
    const [row] = check([punch(2, '17', '2026-10-05', '20:00'), punch(3, '17', '2026-10-06', '02:00')], { ...ctx, allowAfterMidnight: false })
    expect(row.errors.join(' ')).toContain('out time as HH:MM')
  })
})
