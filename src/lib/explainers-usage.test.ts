import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONCEPT_KEYS } from './explainers'

const APP = join(__dirname, '..', 'app')
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.tsx') ? [join(dir, n)] : []))

describe('every explainer is shown somewhere (audit A, unexplained concepts)', () => {
  it('uses each concept on at least one page', () => {
    const source = files(APP).map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const key of CONCEPT_KEYS) expect(source.includes(`"${key}"`), key).toBe(true)
  })
})
