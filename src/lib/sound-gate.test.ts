import { describe, expect, it } from 'vitest'
import { INITIAL_GATE, MASK_WINDOW_MS, MIN_GAP_MS, dbToGain, gate, jitter } from './sound-gate'

describe('gate', () => {
  it('lets the first sound through and records it', () => {
    const result = gate(INITIAL_GATE, 'click', 1000)
    expect(result.allowed).toBe(true)
    expect(result.state.lastBySound.click).toBe(1000)
  })

  it('drops a repeat of the same sound inside its minimum gap', () => {
    const first = gate(INITIAL_GATE, 'toggle', 1000)
    const repeat = gate(first.state, 'toggle', 1000 + MIN_GAP_MS.toggle - 1)
    expect(repeat.allowed).toBe(false)
    expect(repeat.state).toBe(first.state)
  })

  it('allows the same sound again once its gap has passed', () => {
    const first = gate(INITIAL_GATE, 'toggle', 1000)
    expect(gate(first.state, 'toggle', 1000 + MIN_GAP_MS.toggle).allowed).toBe(true)
  })

  it('masks a quieter sound that lands right after a more important one', () => {
    const success = gate(INITIAL_GATE, 'success', 1000)
    expect(gate(success.state, 'click', 1000 + MASK_WINDOW_MS - 1).allowed).toBe(false)
    expect(gate(success.state, 'click', 1000 + MASK_WINDOW_MS).allowed).toBe(true)
  })

  it('never masks a more important sound', () => {
    const click = gate(INITIAL_GATE, 'click', 1000)
    expect(gate(click.state, 'pop', 1010).allowed).toBe(true)
  })

  it('does not mutate the previous state', () => {
    const first = gate(INITIAL_GATE, 'click', 1000)
    gate(first.state, 'pop', 2000)
    expect(first.state.lastBySound).toEqual({ click: 1000 })
    expect(INITIAL_GATE.lastBySound).toEqual({})
  })
})

describe('jitter', () => {
  it('stays inside the spread', () => {
    expect(jitter(0, 0.02)).toBeCloseTo(0.98)
    expect(jitter(0.5, 0.02)).toBeCloseTo(1)
    expect(jitter(0.999999, 0.02)).toBeCloseTo(1.02)
  })
})

describe('dbToGain', () => {
  it('maps -24 dB to about 0.063', () => {
    expect(dbToGain(-24)).toBeCloseTo(0.0631, 3)
    expect(dbToGain(0)).toBe(1)
  })
})
