import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { creditSplit } = await import('./credit-notes')

describe('creditSplit (owner decision D8)', () => {
  it('credits a no-GST invoice without splitting out tax', () => {
    expect(creditSplit(149_000, 'no_gst')).toEqual({ taxableValuePaise: 149_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 })
  })

  it('splits GST out of a tax invoice credit as before', () => {
    expect(creditSplit(118_000, 'inter_state')).toEqual({ taxableValuePaise: 100_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 18_000 })
    expect(creditSplit(118_000, 'intra_state')).toEqual({ taxableValuePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 })
  })
})
