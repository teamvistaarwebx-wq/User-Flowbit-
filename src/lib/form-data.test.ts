import { describe, expect, it } from 'vitest'
import { actionInput, formDataToObject } from '@/lib/form-data'

const formOf = (entries: [string, string][]) => {
  const form = new FormData()
  for (const [k, v] of entries) form.append(k, v)
  return form
}

describe('formDataToObject', () => {
  it('nests dotted keys and builds arrays', () => {
    const parsed = actionInput(formOf([['address.city', 'Indore'], ['lines.0.qty', '2'], ['tags[]', 'a'], ['tags[]', 'b']]))
    expect(parsed).toEqual({ address: { city: 'Indore' }, lines: [{ qty: '2' }], tags: ['a', 'b'] })
  })

  it.each(['__proto__.x', 'constructor.prototype.x', 'a.__proto__.x', 'prototype'])('refuses the prototype-polluting key %s', (key) => {
    expect(() => formDataToObject(formOf([[key, '1']]))).toThrow('not allowed')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})
