import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { serverEnv } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { envSwitchOn, isWhatsAppOn, WHATSAPP_OFF_MESSAGE } from '@/lib/feature-flags'
import { consoleSettings } from '@/modules/console/settings-query'

/**
 * Platform feature flags as the server reads them (lib/feature-flags): the env
 * master switch, then the Console setting, once per request. When the Console
 * settings cannot be read the flag stays off, so a database hiccup never
 * shows a hidden feature.
 */
export const whatsAppEnabled = cache(async (): Promise<boolean> => {
  const env = serverEnv().FEATURE_WHATSAPP
  if (!envSwitchOn(env)) return false
  try {
    return isWhatsAppOn({ env, console: (await consoleSettings()).features })
  } catch (error) {
    console.error('[features] Console settings unreadable; WhatsApp stays off', error)
    return false
  }
})

/** Server actions and handlers: refuse with a plain message while WhatsApp is off. */
export async function assertWhatsAppOn(): Promise<void> {
  if (!(await whatsAppEnabled())) throw new UserError(WHATSAPP_OFF_MESSAGE)
}

/** Pages and route handlers: a 404 while WhatsApp is off, as if the page did not exist. */
export async function requireWhatsAppPage(): Promise<void> {
  if (!(await whatsAppEnabled())) notFound()
}
