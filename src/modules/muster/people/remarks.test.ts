import { describe, expect, it } from 'vitest'
import { isSharedWithEmployee, notifiesEmployee, remarkVisibility, REMARK_FORM_KINDS } from './remarks'

describe('remark visibility', () => {
  it('shares general notes and one-on-ones with the employee, and keeps concerns and performance notes with HR', () => {
    expect(REMARK_FORM_KINDS.filter(isSharedWithEmployee)).toEqual(['one_on_one', 'general'])
    expect(remarkVisibility('general', 'Aditi')).toBe('Visible to Aditi')
    expect(remarkVisibility('concern', 'Aditi')).toBe('HR only')
    expect(remarkVisibility('performance', 'Aditi')).toBe('HR only')
    expect(isSharedWithEmployee('commendation')).toBe(false)
  })

  it('notifies the employee only for a one-on-one', () => {
    expect(REMARK_FORM_KINDS.filter(notifiesEmployee)).toEqual(['one_on_one'])
  })
})
