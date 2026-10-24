import { describe, expect, it } from 'vitest'
import { displayRuleName, RECIPES, RENAMED_RECIPE_NAMES } from './recipes'

describe('recipe names match what the recipe does (audit A5)', () => {
  it('only calls a recipe a "post" when it creates a feed post', () => {
    for (const r of RECIPES) {
      const posts = r.spec.actions.some((a) => a.type === 'post')
      if (/\bpost\b/i.test(r.name)) expect(posts, r.name).toBe(true)
    }
  })

  it('shows an untouched old recipe name as the new one, and leaves edited names alone', () => {
    for (const [old, now] of Object.entries(RENAMED_RECIPE_NAMES)) {
      expect(displayRuleName(old)).toBe(now)
      expect(RECIPES.some((r) => r.name === now), now).toBe(true)
    }
    expect(displayRuleName('My own birthday rule')).toBe('My own birthday rule')
  })

  it('posts a birthday to the feed from exactly one recipe', () => {
    const birthdayPosts = RECIPES.filter((r) => r.spec.trigger.source === 'employee_birthday' && r.spec.actions.some((a) => a.type === 'post'))
    expect(birthdayPosts.map((r) => r.key)).toEqual(['birthday_post'])
  })
})
