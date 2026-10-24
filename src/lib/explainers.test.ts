import { describe, expect, it } from 'vitest'
import { findPage } from './catalog'
import { CONCEPT_KEYS, EXPLAINERS } from './explainers'

describe('explainers', () => {
  it('has a short explainer for every concept', () => {
    for (const key of CONCEPT_KEYS) {
      const e = EXPLAINERS[key]
      expect(e.title.length, key).toBeGreaterThan(3)
      expect(e.body.length, key).toBeGreaterThan(0)
      expect(e.body.length, key).toBeLessThanOrEqual(3)
      for (const line of e.body) expect(line.length, `${key}: ${line}`).toBeLessThan(260)
    }
  })

  it('links only to catalog pages', () => {
    for (const key of CONCEPT_KEYS) {
      for (const link of EXPLAINERS[key].links ?? []) expect(findPage(link.href.split('?')[0])?.href, `${key} -> ${link.href}`).toBeDefined()
    }
  })
})
