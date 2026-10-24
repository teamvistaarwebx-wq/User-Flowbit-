import { describe, expect, it } from 'vitest'
import { selfEmployeeDefaults } from './self'

describe('adding my own employee record (R1 1.4)', () => {
  it('pre-fills name and the login email so the record links to me', () => {
    expect(selfEmployeeDefaults({ name: ' Sanskaar Singh ', email: 'Sanskaar@Example.com' })).toEqual({ fullName: 'Sanskaar Singh', workEmail: 'sanskaar@example.com' })
  })
  it('leaves out what it does not know', () => {
    expect(selfEmployeeDefaults({ name: '', email: null })).toEqual({})
  })
})
