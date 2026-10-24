/** Pure: My attendance's bar, from the recorded (not assumed) days of the month (R1 2.9). */
export type AttendanceTally = { onTime: number; late: number; halfDay: number; absent: number }

const GROUPS: Record<keyof AttendanceTally, readonly string[]> = {
  onTime: ['present', 'work_from_home', 'on_duty'],
  late: ['late'],
  halfDay: ['half_day', 'paid_half_day'],
  absent: ['absent', 'lop'],
}

export function attendanceTally(cells: readonly { status: string; assumed?: boolean }[]): AttendanceTally {
  const recorded = cells.filter((c) => !c.assumed)
  const count = (key: keyof AttendanceTally) => recorded.filter((c) => GROUPS[key].includes(c.status)).length
  return { onTime: count('onTime'), late: count('late'), halfDay: count('halfDay'), absent: count('absent') }
}
