import { describe, expect, it } from 'vitest'
import { addContactTo, emailTaken, makePrimaryIn, removeContactFrom } from './contacts'

describe('contact list edits', () => {
  const a = { _id: 'a', name: 'Aditi', email: 'aditi@x.in', primary: true }
  const b = { _id: 'b', name: 'Rohan', email: 'rohan@x.in', primary: false }
  it('makes the first contact primary and keeps one primary', () => {
    expect(addContactTo([], { _id: 'a', name: 'Aditi', primary: false })[0].primary).toBe(true)
    const list = addContactTo([a], { ...b, primary: true })
    expect(list.map((c) => c.primary)).toEqual([false, true])
    expect(a.primary).toBe(true)
  })
  it('moves primary on delete and on make-primary', () => {
    expect(removeContactFrom([a, b], 'a')).toEqual([{ ...b, primary: true }])
    expect(makePrimaryIn([a, b], 'b').map((c) => c.primary)).toEqual([false, true])
  })
  it('detects duplicate emails on the same client', () => {
    expect(emailTaken([a, b], 'ROHAN@x.in')).toBe(true)
    expect(emailTaken([a, b], 'rohan@x.in', 'b')).toBe(false)
  })
})
