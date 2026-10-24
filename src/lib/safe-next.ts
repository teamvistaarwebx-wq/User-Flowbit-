const PLACEHOLDER_ORIGIN = 'https://flowbit.invalid'

/**
 * A same-site path to send someone to after sign-in, or `fallback`. Refuses
 * protocol-relative ('//evil'), backslash ('/\evil') and control-character
 * tricks by resolving against a placeholder origin and requiring it to stay put.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.includes('\\') || /[\u0000-\u001f\u007f]/.test(next)) return fallback
  try {
    const url = new URL(next, PLACEHOLDER_ORIGIN)
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
