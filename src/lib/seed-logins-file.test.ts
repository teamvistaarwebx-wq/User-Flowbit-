import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_ROLE_KEYS } from '@/lib/permissions'
import { loginsFileName, loginsMarkdown, ROLE_PEOPLE, seedPeople } from '../../scripts/lib/seed-logins'

describe('seed logins file (scripts/lib/seed-logins)', () => {
  it('keeps seed-logins.local.md for the main flowbit database only', () => {
    expect(loginsFileName('flowbit')).toBe('seed-logins.local.md')
    expect(loginsFileName('flowbit_v2dev')).toBe('seed-logins.flowbit_v2dev.local.md')
    expect(loginsFileName('v2night')).toBe('seed-logins.v2night.local.md')
    expect(loginsFileName('../etc')).toBe('seed-logins.___etc.local.md')
    expect(() => loginsFileName(' ')).toThrow()
  })

  it('every per-database file stays git-ignored by *.local.md', () => {
    const ignore = readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8').split('\n').map((l) => l.trim())
    expect(ignore).toContain('*.local.md')
    expect(loginsFileName('anything')).toMatch(/\.local\.md$/)
  })

  it('lists the owner, one person per built-in role and the eight demo people', () => {
    expect(Object.keys(ROLE_PEOPLE)).toEqual([...BUILTIN_ROLE_KEYS])
    const people = seedPeople()
    expect(people).toHaveLength(BUILTIN_ROLE_KEYS.length + 8)
    expect(new Set(people.map((p) => p.email)).size).toBe(people.length)
    expect(people[0]).toMatchObject({ email: 'sanskaar@vistaarsws.com', role: expect.stringContaining('owner') })
    expect(people.at(-1)).toEqual({ role: 'member (demo)', name: 'Sneha Banerjee', email: 'sneha.banerjee@flowbit.test' })
  })

  it('writes the table the seed always wrote, with an optional note on top', () => {
    const text = loginsMarkdown([{ role: 'admin', name: 'Aditi Sharma', email: 'aditi.sharma@flowbit.test', password: 'pw' }], { generated: 'Generated now.', note: 'Reset 9 Oct for the `flowbit` demo DB' })
    expect(text.split('\n').slice(0, 3)).toEqual(['> Reset 9 Oct for the `flowbit` demo DB', '', '# Flowbit seed logins (local only, git-ignored)'])
    expect(text).toContain('| Role | Name | Email | Password |\n|---|---|---|---|\n| admin | Aditi Sharma | aditi.sharma@flowbit.test | `pw` |')
  })
})
