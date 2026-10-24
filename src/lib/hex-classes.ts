/**
 * Ratchet for arbitrary `[#hex]` Tailwind classes (R2 11.1). Colours belong in
 * tokens (globals.css, DESIGN.md §2) so a workspace theme can reach them. The
 * count may only go down: `scripts/check-hex-classes.ts` and
 * `hex-classes.test.ts` fail when it rises above HEX_CLASS_BASELINE.
 * After a sweep, lower the baseline to the new count.
 */

/** Current number of non-allowed `-[#hex]` classes under src. Lower it after a sweep; never raise it. */
export const HEX_CLASS_BASELINE = 721

/**
 * Figma literals with no token (DESIGN.md §2): dark ink on the light amber,
 * pink and orange pills. Add a value here only when DESIGN.md names it and
 * no token fits.
 */
export const ALLOWED_HEXES: readonly string[] = ['#3B2C0B', '#4A1D3F', '#3D1709']

/** Paths (prefixes, relative to the project root) that may use raw hex classes, such as marketing mock-ups that copy other products. */
export const ALLOWED_PATHS: readonly string[] = []

const HEX_CLASS = /-\[(#[0-9a-fA-F]{3,8})\]/g

export type HexClassHit = { file: string; hex: string }

/** Every `-[#hex]` class in one file's source, minus the allowed hex values. */
export function findHexClasses(file: string, source: string, allowedHexes: readonly string[] = ALLOWED_HEXES): HexClassHit[] {
  const allowed = new Set(allowedHexes.map((h) => h.toUpperCase()))
  return [...source.matchAll(HEX_CLASS)].map((m) => ({ file, hex: m[1].toUpperCase() })).filter((hit) => !allowed.has(hit.hex))
}

/** True for files the ratchet looks at: TS/TSX source that is not a test and not on the path allow-list. */
export function isCheckedFile(path: string, allowedPaths: readonly string[] = ALLOWED_PATHS): boolean {
  if (!/\.(ts|tsx)$/.test(path) || /\.test\.tsx?$/.test(path)) return false
  return !allowedPaths.some((prefix) => path.startsWith(prefix))
}

export type RatchetResult = { ok: boolean; count: number; baseline: number; message: string }

/** Compares a count with the baseline: above fails, below passes with a reminder to lower the baseline. */
export function compareWithBaseline(count: number, baseline: number = HEX_CLASS_BASELINE): RatchetResult {
  if (count > baseline) {
    return { ok: false, count, baseline, message: `${count} arbitrary [#hex] classes, above the baseline of ${baseline}. Use a colour token (text-fg-2, bg-success, bg-orchid/20…) or, for a Figma literal with no token, add it to ALLOWED_HEXES in src/lib/hex-classes.ts.` }
  }
  if (count < baseline) return { ok: true, count, baseline, message: `${count} arbitrary [#hex] classes, below the baseline of ${baseline}. Lower HEX_CLASS_BASELINE in src/lib/hex-classes.ts to ${count}.` }
  return { ok: true, count, baseline, message: `${count} arbitrary [#hex] classes (baseline ${baseline}).` }
}

/** Hits grouped by file, worst first, for the report. */
export function worstFiles(hits: HexClassHit[], limit = 10): { file: string; count: number }[] {
  const counts = hits.reduce<Record<string, number>>((acc, hit) => ({ ...acc, [hit.file]: (acc[hit.file] ?? 0) + 1 }), {})
  return Object.entries(counts)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, limit)
}
