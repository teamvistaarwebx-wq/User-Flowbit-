import { en, type MessageKey } from './en'
import { hi } from './hi'

/**
 * A light i18n for the employee self-service surfaces (not the whole app):
 * a typed dictionary per locale and `t()`. Pure and client-safe. A missing
 * Hindi string (never, by the types and the parity test) falls back to English.
 */

export type { MessageKey }
export const LOCALES = ['en', 'hi'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_LABEL: Readonly<Record<Locale, string>> = { en: 'English', hi: 'हिन्दी (Hindi)' }

const DICTIONARIES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, hi }

export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
export const normaliseLocale = (value: unknown): Locale => (isLocale(value) ? value : DEFAULT_LOCALE)

export type Vars = Readonly<Record<string, string | number>>

const PLURAL = /\{(\w+):([^|}]*)\|([^}]*)\}/g
const VALUE = /\{(\w+)\}/g

/** Fills `{name}` and picks `{n:one|many}` by whether n is 1. Unknown names stay as written. */
export function format(template: string, vars: Vars = {}): string {
  return template
    .replace(PLURAL, (whole, name: string, one: string, many: string) => (name in vars ? (Number(vars[name]) === 1 ? one : many) : whole))
    .replace(VALUE, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

export function t(locale: Locale, key: MessageKey, vars?: Vars): string {
  return format(DICTIONARIES[locale][key] ?? en[key] ?? key, vars)
}

export type Translate = (key: MessageKey, vars?: Vars) => string

export const translator = (locale: Locale): Translate => (key, vars) => t(locale, key, vars)

/** A key built from data (a status, a stage), checked: unknown values fall back to `fallback`. */
export function dynamicKey(prefix: string, value: string, fallback: string, locale: Locale): string {
  const key = `${prefix}${value}` as MessageKey
  return key in en ? t(locale, key) : fallback
}

/** The user's language preference (User.prefs.locale), English when unset. */
export const localeOfUser = (user: { prefs?: { locale?: string | null } | null } | null | undefined): Locale => normaliseLocale(user?.prefs?.locale)

/** "Good morning" … for an IST hour. */
export function greetingKey(hourIST: number): MessageKey {
  if (hourIST < 12) return 'greet.morning'
  if (hourIST < 17) return 'greet.afternoon'
  return 'greet.evening'
}
