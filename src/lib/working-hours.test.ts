import { describe, expect, it } from 'vitest'
import { findPage } from './catalog'
import { ATTENDANCE_RULES_HREF, workingHoursHome } from './working-hours'

describe('working hours have one edit place (audit A1/A13)', () => {
  it('is Attendance rules with Muster on, else Settings → General', () => {
    expect(workingHoursHome(true)).toBe('attendance_rules')
    expect(workingHoursHome(false)).toBe('general')
    expect(findPage(ATTENDANCE_RULES_HREF.split('?')[0])?.title).toBe('HR settings')
  })
})
