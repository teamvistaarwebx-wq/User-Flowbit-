import { describe, expect, it } from 'vitest'
import { RECIPES, recipeByKey } from './recipes'
import { HINDI_STATUS, RECIPE_HINDI, recipeActions } from './recipes-hi'
import { templateVariables, unknownVariables } from './template'

describe('Hindi recipe wording (draft for review)', () => {
  it('is marked for the owner to review', () => {
    expect(HINDI_STATUS).toBe('review')
  })

  it('covers every recipe that writes to clients, leads or employees', () => {
    const messaging = RECIPES.filter((r) => r.spec.actions.some((a) => a.type === 'message')).map((r) => r.key)
    expect(messaging.filter((k) => !RECIPE_HINDI[k])).toEqual([])
  })

  it.each(Object.entries(RECIPE_HINDI))('%s: points at real actions and uses exactly the English variables', (key, texts) => {
    const recipe = recipeByKey(key)
    expect(recipe).toBeDefined()
    for (const [index, text] of Object.entries(texts)) {
      const english = recipe!.spec.actions[Number(index)]
      expect(english).toBeDefined()
      expect(unknownVariables(`${text.subject ?? ''} ${text.body}`, recipe!.variables)).toEqual([])
      expect(new Set(templateVariables(text.body))).toEqual(new Set(templateVariables(english.body)))
      if (english.subject) expect(new Set(templateVariables(text.subject ?? ''))).toEqual(new Set(templateVariables(english.subject)))
      expect(text.body).toMatch(/[ऀ-ॿ]/)
    }
  })

  it('switches only the words: channel, recipient and timing stay, English stays the default', () => {
    const recipe = recipeByKey('new_lead')!
    const hi = recipeActions(recipe, 'hi')
    expect(hi[0]).toEqual(recipe.spec.actions[0])
    expect(hi[1]).toMatchObject({ type: 'message', recipient: 'lead', channel: 'email', subject: RECIPE_HINDI.new_lead[1].subject })
    expect(recipeActions(recipe)).toEqual(recipe.spec.actions)
  })
})
