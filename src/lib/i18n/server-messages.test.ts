import { describe, expect, it } from 'vitest'
import { localiseMessage, localiseResult } from './server-messages'

describe('localiseMessage', () => {
  it('leaves English untouched', () => {
    expect(localiseMessage('That request is already closed.', 'en')).toBe('That request is already closed.')
  })

  it('translates a fixed self-service message into Hindi', () => {
    expect(localiseMessage('That request is already closed.', 'hi')).toBe('यह अर्ज़ी पहले ही बंद हो चुकी है।')
  })

  it('translates a leave request confirmation and keeps the names and dates', () => {
    const text = 'Casual leave requested: 12 Oct 2026 – 13 Oct 2026, 2 days, waiting for approval.'
    expect(localiseMessage(text, 'hi')).toBe('Casual leave की अर्ज़ी भेजी गई: 12 Oct 2026 – 13 Oct 2026, 2 दिन, मंज़ूरी का इंतज़ार है।')
  })

  it('keeps an on-behalf confirmation (HR wording) in English', () => {
    const text = 'Casual leave requested for Asha Rao: 12 Oct 2026, 1 day, waiting for approval.'
    expect(localiseMessage(text, 'hi')).toBe(text)
  })

  it('translates the comp-off confirmation with its lapse note', () => {
    expect(localiseMessage('Comp-off of 1 day for 5 Oct 2026 sent for approval. It lapses 30 days after the day worked.', 'hi')).toBe(
      '5 Oct 2026 का कॉम्प-ऑफ़ (1 दिन) मंज़ूरी के लिए भेजा गया। काम वाले दिन के 30 दिन बाद यह खत्म हो जाएगा।',
    )
  })

  it('passes an unknown message through unchanged', () => {
    expect(localiseMessage('Something brand new.', 'hi')).toBe('Something brand new.')
  })
})

describe('localiseResult', () => {
  it('translates the error and every field error without changing the original', () => {
    const original = { ok: false as const, error: 'That day has not happened yet.', fieldErrors: { workedOn: 'In the future' } }
    const result = localiseResult(original, 'hi')
    expect(result).toEqual({ ok: false, error: 'वह दिन अभी आया नहीं है।', fieldErrors: { workedOn: 'आगे की तारीख' } })
    expect(original.error).toBe('That day has not happened yet.')
  })

  it('translates a success message', () => {
    expect(localiseResult({ ok: true, message: 'Correction requested for 9 Oct 2026. You are told when it is decided.' }, 'hi')).toEqual({
      ok: true,
      message: '9 Oct 2026 के लिए सुधार माँगा गया। फ़ैसला होने पर आपको बताया जाएगा।',
    })
  })

  it('returns the same result for English', () => {
    const result = { ok: true as const, message: 'Saved your phone.' }
    expect(localiseResult(result, 'en')).toBe(result)
  })
})
