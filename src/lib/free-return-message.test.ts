import { describe, expect, it } from 'vitest'
import { freeReturnMessage } from './lifecycle'

describe('Free return refusal wording', () => {
  it('names the Free months from Console settings', () => {
    expect(freeReturnMessage('window_over', 8, 3)).toContain('The 3 free months from signup')
    expect(freeReturnMessage('window_over')).toContain('The 6 free months from signup')
  })
})
