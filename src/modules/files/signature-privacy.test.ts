import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { canOpenFile } = await import('./access')
const { SEAL_KIND, SIGNATURE_KIND } = await import('@/lib/company-profile')

const SRC = path.join(process.cwd(), 'src')

function filesUnder(dir: string, match: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return filesUnder(full, match)
    return match(full) ? [full] : []
  })
}

/** A member who can do everything: even they never open a signature file. */
const ADMIN = {
  entitlements: { access: 'full' },
  can: () => true,
  canAny: () => true,
  has: () => true,
  role: 'owner',
} as never

describe('signature files stay private', () => {
  it('no member, however privileged, can open a signature or seal through /api/files', async () => {
    for (const kind of [SIGNATURE_KIND, SEAL_KIND, 'folio_signature']) {
      expect(await canOpenFile(ADMIN, { _id: 'a'.repeat(24), kind, entity: 'Org', entityId: 'b'.repeat(24) })).toBe(false)
    }
  })

  it('no route handler or page passes a signature or seal file id on (only whether one is set)', () => {
    const routes = filesUnder(path.join(SRC, 'app'), (f) => /\.(ts|tsx)$/.test(f))
    const offenders = routes.filter((f) => {
      // `Boolean(s.signatureFileId)` (has a signature) is fine; the id itself must never reach a page or a response.
      const text = readFileSync(f, 'utf8').replace(/Boolean\([^()]*\)/g, '')
      return text.includes(SIGNATURE_KIND) || text.includes(SEAL_KIND) || /sealFileId|signatureFileId/.test(text)
    })
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })

  it('the public file routes only serve their own kinds (portal: shared project files; console: billing proofs)', () => {
    const consoleRoute = readFileSync(path.join(SRC, 'app/api/console/files/[id]/route.ts'), 'utf8')
    expect(consoleRoute).toMatch(/BILLING_KINDS = \['payment_proof', 'tds_certificate'\]/)
    const brandLogo = readFileSync(path.join(SRC, 'app/api/public/brand/[key]/logo/route.ts'), 'utf8')
    expect(brandLogo).not.toMatch(/signat|seal/i)
  })
})

describe('signatory changes are guarded and audited', () => {
  const source = readFileSync(path.join(SRC, 'modules/settings/company-actions.ts'), 'utf8')
  const actionBody = (name: string) => {
    const start = source.indexOf(`export const ${name} = action(`)
    const next = source.indexOf('export const ', start + 1)
    return source.slice(start, next === -1 ? undefined : next)
  }
  for (const name of ['saveSignatory', 'setDefaultSignatory', 'removeSignatory', 'savePayslipSignature']) {
    it(`${name} needs org.manage, an owner or admin, and writes the audit log`, () => {
      const body = actionBody(name)
      expect(body).toContain('if (!canManageSignatories(ctx)) return fail(SIGNATORY_REFUSAL)')
      expect(body).toMatch(/\n  OPTS,\n\)/)
      expect(body).toMatch(/await audit\(ctx, \{\s*action: /)
    })
  }
  it('every action in the file runs with org.manage', () => {
    expect(source).toContain("const OPTS = { perm: 'org.manage' } as const")
    expect(source.match(/^ {2}OPTS,$/gm)?.length).toBe(source.match(/= action\(/g)?.length)
  })
})
