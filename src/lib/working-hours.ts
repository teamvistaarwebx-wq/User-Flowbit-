/**
 * Working hours (day start and end, half-day threshold, work week) live on the workspace and are edited in one
 * place (audit A1/A13): HR settings → Attendance rules when Muster is on, otherwise Settings → General.
 */
export const ATTENDANCE_RULES_HREF = '/app/hr/settings?tab=attendance'

export const WORKING_HOURS_IN_HR = 'With Muster on, working hours are edited in HR settings → Attendance rules.'

/** Where this workspace edits its working hours. */
export const workingHoursHome = (hasMuster: boolean): 'general' | 'attendance_rules' => (hasMuster ? 'attendance_rules' : 'general')
