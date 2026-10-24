import { describe, expect, it } from 'vitest'
import { formatSeq, prefixFrom } from './sequence'

describe('sequence formatting', () => {
  it('formats task keys, employee codes and invoice numbers', () => {
    expect(formatSeq(42, { prefix: 'FB-' })).toBe('FB-42')
    expect(formatSeq(7, { prefix: 'VW-', pad: 4 })).toBe('VW-0007')
    expect(formatSeq(12, { prefix: 'INV/', suffix: '/2026-27', pad: 3 })).toBe('INV/012/2026-27')
    expect(formatSeq(12345, { pad: 3 })).toBe('12345')
  })

  it('derives short prefixes from names', () => {
    expect(prefixFrom('Vistaar WebX')).toBe('VW')
    expect(prefixFrom('Flowbit')).toBe('FLO')
    expect(prefixFrom('  acme  co pvt ')).toBe('ACP')
    expect(prefixFrom('')).toBe('X')
  })
})

describe('PLATFORM_ORG_ID', () => {
  it('is a fixed id for cross-workspace series', async () => {
    const { PLATFORM_ORG_ID } = await import('./sequence')
    expect(String(PLATFORM_ORG_ID)).toBe('000000000000000000f10b17')
  })
})
