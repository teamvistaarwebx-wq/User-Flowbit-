'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { companyProfileOf } from '@/lib/company-profile'
import { MusterPolicy } from '@/models/muster/Policy'
import { LETTERS_BY_CODE } from '@/modules/muster/letters/catalogue'
import { getPolicy } from './queries'

/**
 * Muster settings → Letter signatories: which authorised signatory signs each letter type by default.
 * Picking from the company profile's signatories is HR's call; adding or changing them stays with owners and admins.
 */
export const saveLetterSignatories = action(
  z.object({ signer: z.record(z.string(), z.string().optional()).default({}) }),
  async ({ signer }, ctx) => {
    const ids = new Set(companyProfileOf(ctx.org).signatories.map((s) => s.id))
    const unknown = Object.entries(signer).find(([code, id]) => !LETTERS_BY_CODE.has(code) || (id && !ids.has(id)))
    if (unknown) return fail('A signatory was removed meanwhile. The page has been refreshed; choose again.')
    const next = Object.fromEntries(Object.entries(signer).filter((e): e is [string, string] => Boolean(e[1])))
    const before = (await getPolicy(ctx)).letterSignatories
    await ctx.db(MusterPolicy).updateOne({}, { $set: { letterSignatories: next } }, { upsert: true })
    await audit(ctx, { action: 'letter.signatories_saved', entity: 'MusterPolicy', summary: `Default letter signatories saved (${Object.keys(next).length} letter types named, the rest use the company default)`, product: 'muster', changes: { before, after: next } })
    revalidatePath('/app/hr/settings')
    return ok('Letter signatories saved. New drafts use them.')
  },
  { product: 'muster', perm: 'hr.settings' },
)
