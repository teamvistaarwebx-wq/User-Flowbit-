import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPage } from './catalog'
import { LEGACY_ROUTES, legacyRedirects } from './legacy-routes'

const SRC = join(__dirname, '..')

/** Every .ts/.tsx file under src (tests and this list excluded). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !path.endsWith('legacy-routes.ts') ? [path] : []
  })
}

describe('legacy routes', () => {
  it('lists each old path once', () => {
    const froms = LEGACY_ROUTES.map((r) => r.from)
    expect(new Set(froms).size).toBe(froms.length)
  })

  it('retires the old path: no catalog page and no page file', () => {
    for (const { from } of LEGACY_ROUTES) {
      expect(findPage(from)?.href, from).not.toBe(from)
      expect(existsSync(join(SRC, 'app', ...from.split('/').filter(Boolean), 'page.tsx')), from).toBe(false)
    }
  })

  it('points every redirect at a catalog page', () => {
    for (const { to } of LEGACY_ROUTES) expect(findPage(to.split('?')[0]), to).toBeDefined()
  })

  it('feeds next.config redirects, temporary and query-preserving', () => {
    expect(legacyRedirects()).toEqual(LEGACY_ROUTES.map((r) => ({ source: r.from, destination: r.to, permanent: false })))
    expect(readFileSync(join(SRC, '..', 'next.config.ts'), 'utf8')).toContain('legacyRedirects()')
  })

  it('leaves no in-app link to an old path', () => {
    const files = sourceFiles(SRC)
    for (const { from } of LEGACY_ROUTES) {
      const quoted = new RegExp(`['"\`]${from.replace(/[/-]/g, '\\$&')}(['"\`?#])`)
      const hits = files.filter((f) => quoted.test(readFileSync(f, 'utf8')))
      expect(hits, from).toEqual([])
    }
  })
})
