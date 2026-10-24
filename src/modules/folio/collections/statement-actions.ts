'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { UserError, NotFoundError } from '@/lib/errors'
import { emailBrandFor } from '@/lib/email-brand'
import { emailLayout, sendMail } from '@/lib/mail'
import { ensureDocLink } from '@/modules/doclinks/links'
import { email, isoDate, listOf, objectId, optionalText, requiredText } from '@/lib/validation'
import { FolioMessage } from '@/models/folio/MessageLog'
import { renderStatementPdf } from '@/modules/folio/queries/statement-pdf'
import { paragraphsOf } from './compose'
import { recipientsFor } from './recipients'

/** Emails a client their statement of account with the PDF attached. Recipients are resolved on the server. */
export const emailStatementAction = action(
  z.object({
    clientId: objectId,
    from: isoDate.optional(),
    to: isoDate.optional(),
    recipientIds: listOf(z.string().min(1).max(60)).refine((v) => v.length > 0, 'Pick at least one recipient'),
    cc: email.optional(),
    subject: requiredText('Subject', 200),
    message: optionalText(5000),
  }),
  async (input, ctx) => {
    const list = await recipientsFor(ctx, input.clientId)
    const chosen = list.filter((r) => input.recipientIds.includes(r.id) && r.email)
    if (!chosen.length) throw new UserError('None of the chosen contacts has an email address.', { recipientIds: 'Pick a contact with an email' })
    const rendered = await renderStatementPdf(ctx, input.clientId, { from: input.from, to: input.to })
    if (!rendered) throw new NotFoundError('That client')
    const paragraphs = input.message ? paragraphsOf(input.message) : [`Please find attached the statement of account for ${rendered.data.client.name}.`]
    const to = chosen.map((r) => r.email as string)
    const online = await ensureDocLink(ctx.orgId, { kind: 'statement', docId: rendered.data.client.id, clientId: rendered.data.client.id, memberId: ctx.memberId })
    const result = await sendMail({
      to,
      cc: input.cc,
      subject: input.subject,
      ...emailLayout({ title: input.subject, paragraphs, cta: { label: 'See what is due online', href: online.url }, brand: await emailBrandFor(ctx.orgId) }),
      attachments: [{ filename: rendered.filename, content: rendered.buffer, mime: 'application/pdf' }],
      orgId: ctx.orgId,
      kind: 'statement',
      entity: 'Client',
      entityId: input.clientId,
      retry: false,
    })
    const status = !result.ok ? 'failed' : result.provider === 'resend' ? 'sent' : 'logged'
    await ctx.db(FolioMessage).create({ kind: 'statement', clientId: input.clientId, channel: 'email', status, toAddress: to.join(', '), subject: input.subject, body: paragraphs.join('\n\n'), error: result.error, sentAt: result.ok ? new Date() : undefined, sentBy: ctx.memberId })
    if (!result.ok) throw new UserError(`The email failed: ${result.error ?? 'the provider refused it'}. Try again in a moment.`)
    await audit(ctx, { action: 'statement.emailed', entity: 'Client', entityId: input.clientId, product: 'folio', summary: `Statement for ${rendered.data.client.name} emailed to ${to.join(', ')}` })
    revalidatePath(`/app/folio/ledger/${input.clientId}`)
    const names = chosen.map((r) => r.name).join(', ')
    return ok(status === 'sent' ? `Statement emailed to ${names}.` : 'Logged. No email provider is configured, so nothing was delivered.')
  },
  { product: 'folio', perm: 'collections.write' },
)
