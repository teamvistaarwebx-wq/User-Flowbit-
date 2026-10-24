/**
 * Workspace avatar style (Settings → Appearance): initials on a colour, or a
 * generated pattern (a mirrored 5×5 grid from the name, like an identicon).
 * Pure and client-safe; the same name always gets the same colour and pattern.
 */

export const AVATAR_STYLES = ['initials', 'pattern'] as const
export type AvatarStyle = (typeof AVATAR_STYLES)[number]
export const AVATAR_STYLE_LABEL: Record<AvatarStyle, string> = { initials: 'Initials on a colour', pattern: 'Generated pattern' }

export const isAvatarStyle = (value: unknown): value is AvatarStyle => typeof value === 'string' && (AVATAR_STYLES as readonly string[]).includes(value)

/** Muted, warm fills: picked from the name so a person keeps their colour everywhere. */
export const AVATAR_FILLS = ['#784082', '#3E5A86', '#2E6B60', '#8A5A3A', '#5C4A8C', '#7A3E5C', '#4B6B3A', '#6A4E3E'] as const

export const nameHash = (value: string): number => [...value].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const avatarFill = (name: string): string => AVATAR_FILLS[nameHash(name) % AVATAR_FILLS.length]

const GRID = 5

/** The lit cells of the mirrored grid: columns 0–2 from the hash bits, 3–4 mirror 1–0. */
export function patternCells(name: string): boolean[][] {
  let bits = nameHash(`${name}:pattern`)
  const half = Array.from({ length: GRID }, () =>
    Array.from({ length: Math.ceil(GRID / 2) }, () => {
      const on = (bits & 1) === 1
      bits = (bits >>> 1) | ((bits & 1) << 31)
      return on
    }),
  )
  return half.map((row) => [...row, ...row.slice(0, GRID - row.length).reverse()])
}

/** A CSS url() of the pattern SVG on the person's fill colour. */
export function patternUrl(name: string): string {
  const cells = patternCells(name)
  const path = cells.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 6 6" shape-rendering="crispEdges"><rect x="-0.5" y="-0.5" width="6" height="6" fill="${avatarFill(name)}"/><path fill="rgba(255,255,255,0.62)" d="${path}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
