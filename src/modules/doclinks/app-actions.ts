'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { objectId } from '@/lib/validation'
import { CreditNote } from '@/models/folio/CreditNote'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { canManageLink, ANY_LINK_WRITER, LINK_KINDS, type LinkKind } from './link-perms'
import { ensureDocLink, revokeDocLinks } from './links'

/** "Copy link" and "Turn off link" on a document page (members with write access to that document). */

const PATH = { invoice: 'invoices', quote: 'quotes', credit_note: 'credit-notes', receipt: 'receipts' } as const
const input = z.object({ kind: z.enum(LINK_KINDS), id: objectId })

async function ownDocument(ctx: Ctx, kind: LinkKind, id: string): Promise<{ clientId: unknown; status: string } | null> {
  const fields = { clientId: 1, status: 1 }
  if (kind === 'invoice') return ctx.db(Invoice).findById(id, fields).lean()
  if (kind === 'quote') return ctx.db(Quote).findById(id, fields).lean()
  if (kind === 'credit_note') return ctx.db(CreditNote).findById(id, fields).lean()
  return ctx.db(FolioReceipt).findById(id, fields).lean()
}

const NOT_YOURS = 'You do not have write access to this kind of document, so you cannot change its link.'

export const createDocLinkAction = action(
  input,
  async ({ kind, id }, ctx) => {
    if (!canManageLink(kind, (perm) => ctx.can(perm))) return fail(NOT_YOURS)
    const doc = await ownDocument(ctx, kind, id)
    if (!doc) return fail('That document was not found.')
    if (doc.status === 'draft' && kind !== 'quote') return fail('Issue it first: drafts have no public link.')
    const link = await ensureDocLink(ctx.orgId, { kind, docId: id, clientId: doc.clientId ? String(doc.clientId) : null, memberId: ctx.memberId })
    revalidatePath(`/app/folio/${PATH[kind]}/${id}`)
    return ok('Link ready.', { url: link.url })
  },
  { product: 'folio', anyPerm: [...ANY_LINK_WRITER] },
)

export const revokeDocLinkAction = action(
  input,
  async ({ kind, id }, ctx) => {
    if (!canManageLink(kind, (perm) => ctx.can(perm))) return fail(NOT_YOURS)
    const doc = await ownDocument(ctx, kind, id)
    if (!doc) return fail('That document was not found.')
    const count = await revokeDocLinks(ctx.orgId, kind, id, ctx.memberId)
    await audit(ctx, { action: 'doclink.revoked', entity: kind, entityId: id, product: 'folio', summary: `Turned off the public link of a ${kind.replace('_', ' ')}` })
    revalidatePath(`/app/folio/${PATH[kind]}/${id}`)
    return ok(count ? 'Link turned off. Anyone with the old link now sees "not available".' : 'There was no live link.')
  },
  { product: 'folio', anyPerm: [...ANY_LINK_WRITER] },
)
