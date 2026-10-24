/**
 * The PDF font (Work Sans, latin subset; Helvetica as fallback) draws only
 * Latin-1 and common punctuation. Anything else prints as junk or vanishes
 * ("Ācme" became "cme"), so text is made printable on purpose first:
 * accents outside Latin-1 drop to their base letter, emoji are removed, and
 * any other letter the font lacks prints as "?".
 */

/** What the latin subset covers (see @fontsource/work-sans unicode-range). */
const DRAWABLE = /^[\t\n\r\u0020-\u00FF\u0131\u0152\u0153\u02C6\u02DA\u02DC\u2013-\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u2212]$/
const COMBINING = /[\u0300-\u036F]/g
/** Emoji and their joiners/selectors/keycaps, plus anything outside the BMP. */
const PICTOGRAPHIC = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[\u200B-\u200D\u2060\uFE0E\uFE0F\u20E3]|[\u{10000}-\u{10FFFF}])$/u
const SUBSTITUTES: Record<string, string> = { '\u20B9': 'Rs.' }

function printableChar(ch: string): string {
  if (DRAWABLE.test(ch)) return ch
  if (SUBSTITUTES[ch]) return SUBSTITUTES[ch]
  if (PICTOGRAPHIC.test(ch)) return ''
  const base = ch.normalize('NFD').replace(COMBINING, '')
  return base && [...base].every((c) => DRAWABLE.test(c)) ? base : '?'
}

export function printable(text: string): string {
  const out = Array.from(text.normalize('NFC'), printableChar).join('')
  // Removing an emoji can leave a doubled or trailing space.
  return out === text ? text : out.replace(/ {2,}/g, ' ').trim()
}

/** Image sources are file paths or data URIs, never printed text. */
const SOURCE_KEYS = new Set(['imageSrc', 'logoSrc', 'sealSrc', 'src'])

/** Every string in a print model, made printable (image sources left alone). */
export function printableModel<T>(value: T): T {
  if (typeof value === 'string') return printable(value) as T
  if (Array.isArray(value)) return value.map((v) => printableModel(v)) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SOURCE_KEYS.has(k) ? v : printableModel(v)])) as T
  }
  return value
}

/** "2 hrs", "1.5 nos": a line's quantity and unit as documents print it. */
export const qtyLabel = (quantity: number, unit?: string | null): string => `${Number(quantity.toFixed(3))} ${unit ?? ''}`.trim()
