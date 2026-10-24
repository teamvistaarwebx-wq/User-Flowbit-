'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { addDays, formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { escapeRegex } from '@/lib/utils'
import { checkbox, isoDate, objectId, requiredText } from '@/lib/validation'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { CompOff } from '@/models/muster/CompOff'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { isMonthLocked } from '../attendance/lock'
import { DIRECTORY_STATUSES } from '../people/lifecycle'

const SETTINGS = '/app/hr/settings'
const OPTS = { product: 'muster', perm: 'hr.settings' } as const

/** "Aditi, Ravi and 4 more" */
const namesOf = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`)

export const saveDepartment = action(
  z.object({ id: objectId.optional(), name: requiredText('Name', 80), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,12}$/, 'Use 2–12 letters or digits, like PROD') }),
  async ({ id, name, code }, ctx) => {
    const clash = await ctx.db(Department).findOne({ code, ...(id ? { _id: { $ne: id } } : {}) }).lean()
    if (clash && !clash.deletedAt) return fail(`The code ${code} already belongs to ${clash.name}.`, { code: 'Already used' })
    const sameName = await ctx.db(Department).findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i'), deletedAt: null, ...(id ? { _id: { $ne: id } } : {}) }).lean()
    if (sameName) return fail(`There is already a department called ${sameName.name} (${sameName.code}).`, { name: 'Already exists' })
    if (id) {
      const res = await ctx.db(Department).updateOne({ _id: id }, { $set: { name, code } })
      if (!res.matchedCount) throw new NotFoundError('That department')
    } else if (clash) {
      await ctx.db(Department).updateOne({ _id: clash._id }, { $set: { name, isActive: true }, $unset: { deletedAt: 1 } })
    } else {
      await ctx.db(Department).create({ name, code })
    }
    await audit(ctx, { action: id ? 'department.updated' : 'department.added', entity: 'Department', entityId: id ?? code, summary: `${id ? 'Department saved' : 'Department added'}: ${name} (${code})`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`${id ? 'Department saved' : 'Department added'}: ${name} (${code}).`)
  },
  OPTS,
)

export const removeDepartment = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const dept = await ctx.db(Department).findOne({ _id: id, deletedAt: null }).lean()
    if (!dept) throw new NotFoundError('That department')
    const holders = await ctx.db(Employee).find({ departmentId: dept._id, deletedAt: null, status: { $in: DIRECTORY_STATUSES } }, { firstName: 1 }).lean()
    if (holders.length) return fail(`${dept.name} cannot be removed: it is the department of ${namesOf(holders.map((h) => h.firstName))}. Move them to another department from their People records first.`)
    await ctx.db(Department).updateOne({ _id: id }, { $set: { deletedAt: new Date(), isActive: false } })
    await audit(ctx, { action: 'department.removed', entity: 'Department', entityId: id, summary: `Department removed: ${dept.name}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`${dept.name} removed. People who left keep it on their records.`)
  },
  OPTS,
)

export const saveDesignation = action(
  z.object({ id: objectId.optional(), title: requiredText('Title', 80) }),
  async ({ id, title }, ctx) => {
    const clash = await ctx.db(Designation).findOne({ title: new RegExp(`^${escapeRegex(title)}$`, 'i'), ...(id ? { _id: { $ne: id } } : {}) }).lean()
    if (clash && !clash.deletedAt) return fail(`${clash.title} already exists.`, { title: 'Already exists' })
    if (id) {
      const before = await ctx.db(Designation).findOneAndUpdate({ _id: id }, { $set: { title } }, { returnDocument: 'before' }).lean()
      if (!before) throw new NotFoundError('That designation')
      await ctx.db(Employee).updateMany({ designationId: before._id }, { $set: { designation: title } })
    } else if (clash) {
      await ctx.db(Designation).updateOne({ _id: clash._id }, { $set: { title, isActive: true }, $unset: { deletedAt: 1 } })
    } else {
      await ctx.db(Designation).create({ title })
    }
    await audit(ctx, { action: id ? 'designation.updated' : 'designation.added', entity: 'Designation', entityId: id ?? title, summary: `Designation ${id ? 'saved' : 'added'}: ${title}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`Designation ${id ? 'saved' : 'added'}: ${title}.`)
  },
  OPTS,
)

export const removeDesignation = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const desig = await ctx.db(Designation).findOne({ _id: id, deletedAt: null }).lean()
    if (!desig) throw new NotFoundError('That designation')
    const holders = await ctx.db(Employee).find({ designationId: desig._id, deletedAt: null, status: { $in: DIRECTORY_STATUSES } }, { firstName: 1 }).lean()
    if (holders.length) return fail(`${desig.title} cannot be removed: ${namesOf(holders.map((h) => h.firstName))} ${holders.length === 1 ? 'holds' : 'hold'} it. Change their designation first.`)
    await ctx.db(Designation).updateOne({ _id: id }, { $set: { deletedAt: new Date(), isActive: false } })
    await audit(ctx, { action: 'designation.removed', entity: 'Designation', entityId: id, summary: `Designation removed: ${desig.title}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`${desig.title} removed.`)
  },
  OPTS,
)

export const addHoliday = action(
  z.object({ date: isoDate, name: requiredText('Name', 80), isOptional: checkbox }),
  async ({ date, name, isOptional }, ctx) => {
    const today = todayIST()
    if (date < addDays(today, -366) || date > addDays(today, 366)) return fail('Add holidays within a year either side of today.', { date: 'Out of range' })
    if (await isMonthLocked(ctx, date.slice(0, 7))) return fail(`Attendance for ${formatDate(date)}'s month is locked, so its calendar cannot change. Reopen the month first.`, { date: 'Month locked' })
    const existing = await ctx.db(Holiday).findOne({ date }).lean()
    if (existing) return fail(`${formatDate(date)} already has a holiday: ${existing.name}.`, { date: 'Already a holiday' })
    if (!isOptional) {
      // Leave already counted that day as a leave day; a holiday under it would still be charged to the balance.
      const onLeave = await ctx.db(LeaveRequest).find({ status: { $in: ['approved', 'pending'] }, dates: date }, { employeeId: 1 }).lean()
      if (onLeave.length) {
        const people = await ctx.db(Employee).find({ _id: { $in: onLeave.map((l) => l.employeeId) } }, { firstName: 1 }).lean()
        return fail(`${namesOf(people.map((p) => p.firstName))} ${people.length === 1 ? 'has' : 'have'} leave on ${formatDate(date)} that already counts it as a leave day. Withdraw or cancel that leave, add the holiday, then apply again so the holiday is not charged.`, { date: 'Leave already covers this day' })
      }
    }
    await ctx.db(Holiday).create({ date, name, isOptional })
    await audit(ctx, { action: 'holiday.added', entity: 'Holiday', entityId: date, summary: `Holiday added: ${name}, ${formatDate(date)}${isOptional ? ' (optional)' : ''}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`Holiday added: ${name}, ${formatDate(date)}${isOptional ? ' (optional)' : ''}.`)
  },
  OPTS,
)

export const removeHoliday = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const holiday = await ctx.db(Holiday).findById(id).lean()
    if (!holiday) throw new NotFoundError('That holiday')
    const when = formatDate(holiday.date)
    if (await isMonthLocked(ctx, holiday.date.slice(0, 7))) return fail(`Attendance for ${when}'s month is locked, so its holiday cannot be removed. Reopen the month first.`)
    if (!holiday.isOptional) {
      const [leaveAround, compOff, overrides] = await Promise.all([
        ctx.db(LeaveRequest).exists({ status: 'approved', startDate: { $lte: holiday.date }, endDate: { $gte: holiday.date } }),
        ctx.db(CompOff).exists({ workedOn: holiday.date, status: { $in: ['pending', 'approved'] } }),
        ctx.db(AttendanceCorrection).exists({ date: holiday.date, status: 'approved', requestedStatus: 'holiday' }),
      ])
      if (leaveAround) return fail(`${holiday.name} cannot be removed: approved leave was counted around ${when}. Removing it would change those leave days.`)
      if (compOff || overrides) return fail(`${holiday.name} cannot be removed: someone earned a comp-off or was marked against it on ${when}.`)
    }
    await ctx.db(Holiday).deleteOne({ _id: id })
    await audit(ctx, { action: 'holiday.removed', entity: 'Holiday', entityId: holiday.date, summary: `Holiday removed: ${holiday.name}, ${when}`, product: 'muster' })
    revalidatePath(SETTINGS)
    return ok(`Holiday removed: ${holiday.name}, ${when}.`)
  },
  OPTS,
)
