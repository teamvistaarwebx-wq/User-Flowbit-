import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cappedListOf, distinct } from './validation'

describe('cappedListOf (R3 L-23g)', () => {
  const schema = cappedListOf(z.string(), 3)

  it('de-duplicates and keeps the first order', () => {
    expect(schema.parse(['b', 'a', 'b'])).toEqual(['b', 'a'])
  })

  it('reads a single value and a missing field like listOf', () => {
    expect(schema.parse('a')).toEqual(['a'])
    expect(schema.parse(undefined)).toEqual([])
  })

  it('refuses more items than the cap', () => {
    // Arrange
    const tooMany = ['a', 'b', 'c', 'd']

    // Act
    const result = schema.safeParse(tooMany)

    // Assert
    expect(result.success).toBe(false)
  })

  it('distinct keeps one of each value', () => {
    expect(distinct(['x', 'x', 'y'])).toEqual(['x', 'y'])
  })
})
