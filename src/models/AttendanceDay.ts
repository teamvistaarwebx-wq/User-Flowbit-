import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { BREAK_TYPES } from '@/lib/break-types'

export const PUNCH_TYPES = ['in', 'break_start', 'break_end', 'out'] as const
/**
 * Day statuses. `half_day` pays half (worked half, the other half unpaid);
 * `paid_half_day` is worked half plus half a day of paid leave. `leave` is paid leave.
 */
export const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent', 'leave', 'holiday', 'weekoff', 'on_duty', 'work_from_home', 'sick_leave', 'paid_half_day'] as const

const PunchSchema = new Schema(
  {
    type: { type: String, enum: PUNCH_TYPES, required: true },
    at: { type: Date, required: true },
    source: { type: String, enum: ['web', 'admin', 'whatsapp'], default: 'web' },
    note: { type: String },
    /** On a break_start: the break type (lib/break-types BREAK_TYPES). */
    breakType: { type: String, enum: BREAK_TYPES },
    /** A check-in or check-out by a remote worker (Employee.workMode), who is never asked for a location. */
    remote: { type: Boolean },
    /**
     * Where the punch was made, read once at that moment (web check-in, or the WhatsApp bot's shared location).
     * accuracy in metres; inside / office / distanceM when the workspace has office geofences (lib/geo).
     */
    geo: {
      type: new Schema(
        {
          lat: { type: Number, min: -90, max: 90 },
          lng: { type: Number, min: -180, max: 180 },
          accuracy: { type: Number, min: 0 },
          inside: { type: Boolean },
          office: { type: String },
          distanceM: { type: Number, min: 0 },
          /** The office circle the reading was held to (phone or laptop, lib/geo circleFor). */
          radiusM: { type: Number, min: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
)

const AttendanceDaySchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    /** 'YYYY-MM-DD' in Asia/Kolkata. */
    date: { type: String, required: true },
    punches: { type: [PunchSchema], default: [] },
    status: { type: String, enum: ATTENDANCE_STATUSES, default: 'absent' },
    workedMinutes: { type: Number, default: 0 },
    breakMinutes: { type: Number, default: 0 },
    /** Break minutes per type, e.g. { lunch: 40, tea: 12, other: 5 } (lib/break-types); payable hours are worked of these. */
    breakByType: { type: Schema.Types.Mixed },
    firstIn: { type: Date },
    lastOut: { type: Date },
    locked: { type: Boolean, default: false },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { timestamps: true },
)
AttendanceDaySchema.plugin(tenant)
AttendanceDaySchema.index({ orgId: 1, memberId: 1, date: 1 }, { unique: true })
AttendanceDaySchema.index({ orgId: 1, date: 1 })

export const AttendanceDay = defineModel('AttendanceDay', AttendanceDaySchema)
