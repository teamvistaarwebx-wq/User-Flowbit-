import { describe, expect, it, vi } from 'vitest'
import { onceAsync } from './once'

describe('onceAsync', () => {
  it('runs the loader once and shares the result between callers', async () => {
    // Arrange
    const load = vi.fn(async () => new Map([['a', 1]]))
    const shared = onceAsync(load)

    // Act
    const [first, second] = await Promise.all([shared(), shared()])

    // Assert
    expect(load).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('does not run the loader until asked', () => {
    // Arrange
    const load = vi.fn(async () => 1)

    // Act
    onceAsync(load)

    // Assert
    expect(load).not.toHaveBeenCalled()
  })
})
