import 'server-only'
import type { Types } from 'mongoose'
import { Automation } from '@/models/automations/Automation'
import { RECIPES, type Recipe } from './recipes'
import { recipeActions, type RecipeLanguage } from './recipes-hi'

/**
 * Ready recipes are seeded lazily: the first time a workspace opens
 * Settings → Automations or fires an event, every recipe it does not have yet
 * is added with its default on/off and wording. Existing rules (the owner's
 * edits) are never touched; a recipe added in a later release appears on the
 * next call.
 */

const seeded = new Set<string>()

/** A recipe's editable defaults: wording, timing, conditions (plain arrays: mongoose casts them on insert). */
export const recipeDefaults = (recipe: Recipe, language: RecipeLanguage = 'en'): Record<string, unknown> => ({
  name: recipe.name,
  trigger: recipe.spec.trigger,
  conditions: recipe.spec.conditions.map((c) => ({ ...c })),
  actions: recipeActions(recipe, language),
  delayMinutes: recipe.spec.delayMinutes,
  businessHoursOnly: recipe.spec.businessHoursOnly,
  dailyCapPerContact: recipe.spec.dailyCapPerContact,
})

/** A recipe as a new Automation row of one workspace, switched on or off as the recipe says. */
export const recipeDoc = (orgId: Types.ObjectId, recipe: Recipe): Record<string, unknown> => ({ orgId, recipeKey: recipe.key, enabled: recipe.defaultEnabled, ...recipeDefaults(recipe) })

export async function ensureRecipes(orgId: Types.ObjectId): Promise<void> {
  const key = String(orgId)
  if (seeded.has(key)) return
  const have = new Set((await Automation.find({ orgId, recipeKey: { $in: RECIPES.map((r) => r.key) } }, { recipeKey: 1 }).lean()).map((a) => a.recipeKey))
  const missing = RECIPES.filter((r) => !have.has(r.key))
  if (missing.length) {
    await Automation.bulkWrite(
      missing.map((r) => ({ updateOne: { filter: { orgId, recipeKey: r.key }, update: { $setOnInsert: recipeDoc(orgId, r) }, upsert: true } })),
      { ordered: false },
    )
  }
  seeded.add(key)
}
