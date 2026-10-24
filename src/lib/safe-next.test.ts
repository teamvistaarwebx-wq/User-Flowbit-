import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/safe-next'

describe('safeNextPath', () => {
  it('keeps same-site paths with their query', () => {
    expect(safeNextPath('/app/work/tasks?view=board', '/app')).toBe('/app/work/tasks?view=board')
  })

  it.each(['//evil.example', '/\\evil.example', '/\\/evil.example', 'https://evil.example', 'evil', '/\tevil', ''])('falls back for %j', (next) => {
    expect(safeNextPath(next, '/app')).toBe('/app')
  })
})
