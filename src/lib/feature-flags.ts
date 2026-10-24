/**
 * Platform feature flags, pure. A flag is on only when its env master switch
 * is on AND the Console setting (Settings → Features) leaves it on, so a
 * deployment ships with the feature dark and staff can switch it off again
 * without a redeploy. The server reads them through modules/features/flags.
 */

export type PlatformFeatures = Readonly<{ whatsapp: boolean }>

/** The Console side of each flag: on by default, so the env switch alone decides until staff turn it off. */
export const DEFAULT_PLATFORM_FEATURES: PlatformFeatures = { whatsapp: true }

const TRUTHY = new Set(['on', 'true', '1', 'yes'])

/** An env switch: 'on', 'true', '1' or 'yes' (any case, trimmed); anything else, or unset, is off. */
export const envSwitchOn = (value: string | null | undefined): boolean => TRUTHY.has(String(value ?? '').trim().toLowerCase())

/** Stored Console values over the defaults; anything that is not a boolean keeps the default. */
export function mergePlatformFeatures(stored: unknown): PlatformFeatures {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return { whatsapp: typeof raw.whatsapp === 'boolean' ? raw.whatsapp : DEFAULT_PLATFORM_FEATURES.whatsapp }
}

/** WhatsApp shows and sends only when the env switch is on and the Console has not turned it off. */
export const isWhatsAppOn = (input: Readonly<{ env: string | null | undefined; console: PlatformFeatures }>): boolean => envSwitchOn(input.env) && input.console.whatsapp

/** What a refused WhatsApp action says. */
export const WHATSAPP_OFF_MESSAGE = 'WhatsApp is turned off for now. Email and in-app alerts still work.'
