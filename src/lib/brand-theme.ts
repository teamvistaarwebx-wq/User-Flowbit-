import { accountTypeOf } from '@/lib/account-types'
import { isTrial, type OrgLike } from '@/lib/plans'

/**
 * Workspace brand colours (Settings → Appearance). Pure and client-safe: the
 * settings form previews with the same functions the shell uses to apply them.
 * Colours are '#rrggbb'; anything else is ignored and Flowbit's default used.
 */

export type BrandColorKey = 'primary' | 'secondary' | 'accent'
export type BrandTheme = Record<BrandColorKey, string>
export type StoredTheme = Partial<Record<BrandColorKey, string | null>> | null | undefined

export const BRAND_COLOR_KEYS: readonly BrandColorKey[] = ['primary', 'secondary', 'accent']

/** Flowbit's own palette: orchid, chip violet and blush. */
export const DEFAULT_THEME: BrandTheme = { primary: '#bb62a5', secondary: '#4b2a8c', accent: '#eac1dc' }

/**
 * The presets gallery (Settings → Appearance): ready palettes that pass the
 * same contrast checks as custom colours (primary and accent at least 3:1 on
 * the dark surfaces, secondary at least 4.5:1 under white text; tested).
 */
export const THEME_PRESETS: readonly { key: string; label: string; theme: BrandTheme }[] = [
  { key: 'flowbit', label: 'Flowbit', theme: DEFAULT_THEME },
  { key: 'ocean', label: 'Ocean', theme: { primary: '#3ba7e0', secondary: '#1e3a8a', accent: '#a5e4ff' } },
  { key: 'forest', label: 'Forest', theme: { primary: '#3fb27f', secondary: '#14532d', accent: '#b8f0cf' } },
  { key: 'sunset', label: 'Sunset', theme: { primary: '#f08a4b', secondary: '#9a3412', accent: '#ffd2b0' } },
  { key: 'royal', label: 'Royal', theme: { primary: '#8b7cf6', secondary: '#3730a3', accent: '#d6d1ff' } },
  { key: 'ruby', label: 'Ruby', theme: { primary: '#e0567a', secondary: '#881337', accent: '#ffc4d3' } },
  { key: 'slate', label: 'Slate', theme: { primary: '#8fa3b8', secondary: '#334155', accent: '#dde6ef' } },
  { key: 'saffron', label: 'Saffron', theme: { primary: '#e6a817', secondary: '#7c2d12', accent: '#fde7a8' } },
]

/** The preset these colours are, or null for custom colours. */
export const presetOf = (theme: BrandTheme): string | null => THEME_PRESETS.find((p) => BRAND_COLOR_KEYS.every((k) => p.theme[k] === theme[k]))?.key ?? null

export const BRAND_COLOR_LABELS: Record<BrandColorKey, { label: string; use: string }> = {
  primary: { label: 'Primary', use: 'Links, focus rings, active states and charts' },
  secondary: { label: 'Secondary', use: 'Selected chips, the navigation rail and gradient depth' },
  accent: { label: 'Accent', use: 'Highlights, gradient light end and badges' },
}

/** The dark surfaces brand colours sit on: --bg, --bg-2 and cards (globals.css). */
export const DARK_SURFACES = ['#171717', '#1a1a1a', '#27272b'] as const

/** WCAG: 3:1 is the floor for icons, borders and large text; 4.5:1 for body text. */
export const MIN_UI_CONTRAST = 3
export const MIN_TEXT_CONTRAST = 4.5

const HEX = /^#[0-9a-f]{6}$/i

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

/** '#ABC' or 'abcdef' -> '#aabbcc'; null when it is not a colour. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '')
  const full = /^[0-9a-f]{3}$/i.test(raw) ? raw.split('').map((c) => c + c).join('') : raw
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toLowerCase()}` : null
}

/** The stored theme with every missing or invalid colour replaced by Flowbit's. */
export function resolveTheme(stored: StoredTheme): BrandTheme {
  const pick = (key: BrandColorKey) => {
    const value = stored?.[key]
    return isHexColor(value) ? value.toLowerCase() : DEFAULT_THEME[key]
  }
  return { primary: pick('primary'), secondary: pick('secondary'), accent: pick('accent') }
}

export const isDefaultTheme = (theme: BrandTheme) => BRAND_COLOR_KEYS.every((k) => theme[k] === DEFAULT_THEME[k])

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 2.x relative luminance of '#rrggbb'. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** How much black (darkening) or white (lightening) each step mixes in, and the most it may add. */
const BLEND_STEP = 0.05
const MAX_BLEND = 1

/** The colour, darkened towards black just enough for white text on it to reach 4.5:1 (unchanged when it already does). */
export function darkenForWhiteText(hex: string): string {
  const rgb = channels(hex)
  for (let amount = 0; amount <= MAX_BLEND; amount += BLEND_STEP) {
    const candidate = toHex(rgb.map((c) => c * (1 - amount)) as [number, number, number])
    if (contrastRatio(candidate, '#ffffff') >= MIN_TEXT_CONTRAST) return candidate
  }
  return '#000000'
}

/** The worst-case contrast of a colour on the dark surfaces. */
const worstOnDark = (hex: string): number => Math.min(...DARK_SURFACES.map((surface) => contrastRatio(hex, surface)))

/** The colour, lightened towards white just enough to read as text (4.5:1) on every dark surface (unchanged when it already does). */
export function lightenForDarkText(hex: string): string {
  const rgb = channels(hex)
  for (let amount = 0; amount <= MAX_BLEND; amount += BLEND_STEP) {
    const candidate = toHex(rgb.map((c) => c + (255 - c) * amount) as [number, number, number])
    if (worstOnDark(candidate) >= MIN_TEXT_CONTRAST) return candidate
  }
  return '#ffffff'
}

/** Where a button label sits on the primary button gradient (percent of its width). */
export const BUTTON_LABEL_ZONE = { from: 30, to: 70 } as const

/**
 * The themed primary button gradient as [colour, stop%] pairs: light accent at
 * the left edge like Flowbit's own, then colours dark enough for the white
 * label from 30% to the right edge (darkened primary into darkened secondary).
 */
export function buttonGradientStops(theme: BrandTheme): readonly (readonly [string, number])[] {
  const labelStart = darkenForWhiteText(theme.primary)
  const labelEnd = darkenForWhiteText(theme.secondary)
  return [
    [theme.accent, 0],
    [theme.primary, 15],
    [labelStart, BUTTON_LABEL_ZONE.from],
    [labelEnd, BUTTON_LABEL_ZONE.to],
    [labelEnd, 100],
  ]
}

export type ContrastLevel = 'good' | 'ui_only' | 'poor'
export type ContrastCheck = { ratio: number; level: ContrastLevel; message: string }

/** Worst-case contrast of a colour against Flowbit's dark surfaces, with a plain verdict. */
export function checkContrast(hex: string): ContrastCheck {
  const ratio = worstOnDark(hex)
  const rounded = Math.round(ratio * 10) / 10
  if (ratio >= MIN_TEXT_CONTRAST) return { ratio: rounded, level: 'good', message: `${rounded}:1 on dark. Readable as text.` }
  if (ratio >= MIN_UI_CONTRAST) return { ratio: rounded, level: 'ui_only', message: `${rounded}:1 on dark. Fine for buttons and icons, too faint for small text.` }
  return { ratio: rounded, level: 'poor', message: `${rounded}:1 on dark. Hard to see; pick a lighter colour.` }
}

/** Brand colours are a Suite feature; the workspace trial includes them so owners can try it. */
// Free is stored as a trialing plan, but it is not the trial (V2-REVIEW E2).
export const brandColorsAllowed = (org: OrgLike) => (isTrial(org) && accountTypeOf(org.subscription) !== 'free') || org.subscription?.plan === 'suite'

/**
 * The theme a workspace actually shows: its stored colours when the plan allows brand colours, else none
 * (Flowbit's). The single source for every surface that wears the brand: the app shell (themeCss) and
 * every PDF (lib/pdf/brand pdfBrandForOrg) read it, so the two can never drift apart.
 */
export const workspaceTheme = (org: OrgLike & { theme?: StoredTheme }): StoredTheme => (brandColorsAllowed(org) ? (org.theme ?? null) : null)

/** The Org fields workspaceTheme needs: load these wherever a brand colour is shown outside the app. */
export const WORKSPACE_THEME_FIELDS = { theme: 1, subscription: 1, createdAt: 1, status: 1, disabled: 1, deletedAt: 1, enabledProducts: 1, workspaceKind: 1 } as const

/** The primary colour a workspace shows on emails and public pages: Flowbit's unless its plan allows brand colours. */
export const workspacePrimary = (org: (OrgLike & { theme?: StoredTheme }) | null | undefined): string => resolveTheme(org ? workspaceTheme(org) : null).primary

/**
 * CSS custom properties for a theme: the raw tokens globals.css maps to
 * Tailwind utilities, plus the gradients built from them.
 */
export function themeVars(stored: StoredTheme): Record<string, string> {
  const t = resolveTheme(stored)
  const deep = `color-mix(in oklab, ${t.secondary} 55%, #0b0a0f)`
  const violet = `color-mix(in oklab, ${t.primary} 50%, ${t.secondary})`
  const mist = `color-mix(in oklab, ${t.accent} 55%, #ffffff)`
  return {
    '--orchid': t.primary,
    '--link': lightenForDarkText(t.primary),
    '--blush': t.accent,
    '--violet': violet,
    '--chip-active': t.secondary,
    '--grad-brand': `linear-gradient(120deg, ${deep} 0%, ${t.secondary} 40%, ${t.primary} 70%, ${t.accent} 100%)`,
    '--grad-button': `linear-gradient(90deg, ${buttonGradientStops(t).map(([color, stop]) => `${color} ${stop}%`).join(', ')})`,
    '--grad-rail': `linear-gradient(180deg, ${deep} 0%, ${t.secondary} 55%, color-mix(in oklab, ${t.primary} 60%, ${t.secondary}) 100%)`,
    '--grad-progress': `linear-gradient(90deg, ${t.accent}, ${t.primary} 60%, ${t.secondary})`,
    '--grad-text': `linear-gradient(90deg, ${t.accent} 0%, ${t.primary} 55%, ${violet} 100%)`,
    '--grad-button-alt': `linear-gradient(70deg, ${deep} 0%, ${t.secondary} 25%, ${t.primary} 50%, ${t.accent} 75%, ${mist} 92%, ${mist} 100%)`,
    '--grad-selected': `linear-gradient(135deg, #ffffff 0%, ${t.accent} 35%, ${t.primary} 60%, ${deep} 100%)`,
    '--grad-step': `linear-gradient(90deg, ${t.accent}, ${violet})`,
    '--grad-stroke-brand': `linear-gradient(100deg, ${t.primary} 0%, #3b2e3e 38%, #4c454c 72%, ${t.secondary} 100%)`,
    '--arc-glow': `color-mix(in srgb, ${violet} 50%, transparent)`,
    '--grad-arc-pill': `linear-gradient(90deg, color-mix(in srgb, ${violet} 38%, transparent), color-mix(in srgb, ${t.accent} 36%, transparent))`,
    '--grad-arc-word': `linear-gradient(90deg, ${t.accent}, ${t.primary})`,
    '--grad-brand-word': `linear-gradient(90deg, ${t.accent} 0%, ${t.primary} 55%, ${violet} 100%)`,
  }
}

/** `:root{…}` overrides for the shell; '' for the default theme so the stylesheet stays in charge. */
export function themeCss(stored: StoredTheme): string {
  if (isDefaultTheme(resolveTheme(stored))) return ''
  return `:root{${Object.entries(themeVars(stored)).map(([k, v]) => `${k}:${v}`).join(';')}}`
}
