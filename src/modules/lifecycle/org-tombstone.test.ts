import type { Schema } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { Org } from '@/models/Org'
import { ORG_KEPT, ORG_PERSONAL, ORG_TOMBSTONE_SET } from './org-tombstone'

const LISTED: ReadonlySet<string> = new Set([...ORG_KEPT, ...ORG_PERSONAL, ...ORG_TOMBSTONE_SET])

/** True when the path or one of its parents is in a list. */
function isListed(path: string): boolean {
  const parts = path.split('.')
  return parts.some((_, i) => LISTED.has(parts.slice(0, i + 1).join('.')))
}

/** Schema paths no list covers, walking into single nested subdocuments. */
function unlistedPaths(schema: Schema, prefix = ''): string[] {
  return Object.entries(schema.paths).flatMap(([name, type]) => {
    const path = `${prefix}${name}`
    if (isListed(path)) return []
    const nested = (type as { schema?: Schema; $isSingleNested?: boolean }).$isSingleNested ? (type as { schema?: Schema }).schema : undefined
    return nested ? unlistedPaths(nested, `${path}.`) : [path]
  })
}

describe('Org tombstone field lists (R3 M8)', () => {
  it('covers every Org schema path, so a new field is never kept by accident', () => {
    // Arrange, Act
    const unlisted = unlistedPaths(Org.schema)

    // Assert
    expect(unlisted).toEqual([])
  })

  it('drops the v2 company data a deleted workspace must not keep', () => {
    for (const field of ['profile', 'signatories', 'attendanceGeo', 'signupUtm', 'dpa.acceptedBy', 'security', 'breakTypes', 'brandKey']) {
      expect(ORG_PERSONAL).toContain(field)
    }
  })

  it('never both keeps and drops a field', () => {
    const kept = new Set<string>(ORG_KEPT)
    expect(ORG_PERSONAL.filter((f) => kept.has(f))).toEqual([])
  })
})
