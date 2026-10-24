import { describe, expect, it } from 'vitest'
import { arrowStep, imageAlt } from './image-alt'

describe('imageAlt', () => {
  it('gives the position and the author for several images', () => {
    expect(imageAlt(1, 3, 'Asha Verma')).toBe("Image 2 of 3 from Asha Verma's post")
  })

  it('drops the position for a single image', () => {
    expect(imageAlt(0, 1, 'Ravi', 'reply')).toBe("Image from Ravi's reply")
  })

  it('works without an author', () => {
    expect(imageAlt(0, 2, '  ', 'comment')).toBe('Image 1 of 2 in this comment')
  })
})

describe('arrowStep', () => {
  it('maps left and right arrows and ignores other keys', () => {
    expect([arrowStep('ArrowLeft'), arrowStep('ArrowRight'), arrowStep('Enter')]).toEqual([-1, 1, 0])
  })
})
