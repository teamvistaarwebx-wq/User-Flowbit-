import { consoleHostOf, isLoopbackHost } from './host'

/**
 * Absolute Console links for emails and scripts: the Console host in
 * production, the product URL's /console locally (where both share a host).
 * Pure: pass the environment.
 */
export function consoleUrl(path: string, env: Record<string, string | undefined> = process.env): string {
  const appUrl = (env.APP_URL?.trim() || 'http://127.0.0.1:4100').replace(/\/$/, '')
  const host = (() => {
    try {
      return new URL(appUrl).host
    } catch {
      return '127.0.0.1'
    }
  })()
  const clean = path.startsWith('/console') ? path : `/console${path === '/' ? '' : path}`
  return isLoopbackHost(host) ? `${appUrl}${clean}` : `https://${consoleHostOf(env)}${clean}`
}
