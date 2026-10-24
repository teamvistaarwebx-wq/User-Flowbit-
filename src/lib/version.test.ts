import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_VERSION, APP_VERSION_LABEL } from './version'

describe('version', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('reads "Flowbit 2.0"', () => {
    expect(APP_VERSION_LABEL).toBe('Flowbit 2.0')
  })
})
