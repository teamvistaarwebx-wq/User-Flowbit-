import { describe, expect, it } from 'vitest'
import { fitWithin, isEntityLogoType } from './entity-logo'

describe('entity logos', () => {
  it('takes JPEG and PNG only', () => {
    expect(['image/jpeg', 'image/png'].map(isEntityLogoType)).toEqual([true, true])
    expect(['image/gif', 'image/svg+xml', 'image/webp'].map(isEntityLogoType)).toEqual([false, false, false])
  })

  it('shrinks the long side to the edge and keeps the ratio', () => {
    expect(fitWithin(1024, 512, 256)).toEqual({ width: 256, height: 128 })
    expect(fitWithin(300, 900, 256)).toEqual({ width: 85, height: 256 })
  })

  it('never scales a small logo up', () => {
    expect(fitWithin(120, 80, 256)).toEqual({ width: 120, height: 80 })
  })
})
