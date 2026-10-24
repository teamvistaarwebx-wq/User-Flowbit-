import 'server-only'
import { cache } from 'react'
import { mergeConsoleSettings, type ConsoleSettingsValues } from '@/lib/console/settings-defaults'
import { dbConnect } from '@/lib/db'
import { planConfigFrom, type PlanConfig } from '@/lib/plan-config'
import { ConsoleSettings } from '@/models/console/ConsoleSettings'

/**
 * The Console settings merged over the defaults: one small document, read at
 * most once per request (React `cache`; route handlers and crons outside a
 * render read it once per call, so a cron loads it once and passes it on).
 */
export const consoleSettings = cache(async (): Promise<ConsoleSettingsValues> => {
  await dbConnect()
  const doc = await ConsoleSettings.findOne({ key: 'global' }).lean()
  return mergeConsoleSettings(doc as Partial<ConsoleSettingsValues> | null)
})

/**
 * Prices and limits as the product reads them (lib/plan-config). Falls back
 * to the lib/plans defaults when the settings cannot be read, so a database
 * hiccup never blocks sign-in or checkout pricing.
 */
export const planConfig = cache(async (): Promise<PlanConfig> => {
  try {
    return planConfigFrom(await consoleSettings())
  } catch (error) {
    console.error('[console] settings unreadable; using the default prices and limits', error)
    return planConfigFrom(null)
  }
})
