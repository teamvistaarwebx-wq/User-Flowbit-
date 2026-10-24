import { describe, expect, it } from 'vitest'
import { avatarFill, AVATAR_FILLS, isAvatarStyle, patternCells, patternUrl } from './avatar-pattern'

describe('avatar patterns', () => {
  it('is stable per name and mirrored left to right', () => {
    const cells = patternCells('Asha Rao')
    expect(cells).toEqual(patternCells('Asha Rao'))
    expect(cells).toHaveLength(5)
    for (const row of cells) expect(row).toEqual([...row].reverse())
    expect(patternCells('Vikram Singh')).not.toEqual(cells)
  })

  it('draws an SVG data URL on the person’s fill', () => {
    const url = patternUrl('Asha Rao')
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(url)).toContain(`fill="${avatarFill('Asha Rao')}"`)
    expect(AVATAR_FILLS).toContain(avatarFill('Asha Rao'))
  })

  it('knows the two styles', () => {
    expect(isAvatarStyle('pattern')).toBe(true)
    expect(isAvatarStyle('emoji')).toBe(false)
  })
})
