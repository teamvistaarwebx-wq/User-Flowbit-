'use server'

import { ok, publicAction } from '@/lib/actions'
import { flowbitSupplier, platformAdminEmails } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { assertRateLimit } from '@/lib/rate-limit'
import { requestIp, requestUserAgent } from '@/lib/request'
import { DemoRequest } from '@/models/marketing/DemoRequest'
import { recordHouseLead } from '@/modules/console/house-lead'
import type { DemoRequestResult } from './demo'
import { demoRecipients, demoRequestMail, demoRequestSchema, firstNameOf, isBot } from './demo-request'

/**
 * Public demo request from /contact: honeypot, 5 per hour per IP, stored as a
 * DemoRequest, then emailed to Flowbit staff (PLATFORM_ADMIN_EMAILS) and added
 * as a Lead in Vistaar's own Orbit (FLOWBIT_HOUSE_ORG_SLUG).
 */
export const submitDemoRequest = publicAction(demoRequestSchema, async (input) => {
  const thanks = { firstName: firstNameOf(input.name), email: input.email }
  if (isBot(input)) return ok<DemoRequestResult>(undefined, thanks)

  const ip = await requestIp()
  await assertRateLimit('contact', ip)

  const { name, email, company, phone, teamSize, products, message } = input
  const request = await DemoRequest.create({ name, email, company, phone, teamSize, products, message, ip, userAgent: await requestUserAgent() })
  recordHouseLead({ origin: 'demo_request', name, email, company, phone, teamSize, products, message })

  const mail = demoRequestMail(input)
  const body = emailLayout({ title: mail.subject, paragraphs: mail.paragraphs, footer: 'Sent from the demo form on the Flowbit website. Reply to the person directly at their email above.' })
  const sent = await sendMail({
    to: demoRecipients(platformAdminEmails(), flowbitSupplier().supportEmail),
    subject: mail.subject,
    ...body,
    kind: 'contact',
    entity: 'DemoRequest',
    entityId: request._id,
  })
  await DemoRequest.updateOne({ _id: request._id }, { $set: { mailId: sent.id } })
  // The request and its Outbox copy are stored either way; a failed send must not make the visitor submit twice.
  if (!sent.ok) console.error('[marketing] demo request saved but the staff email failed', { requestId: String(request._id), error: sent.error })

  return ok<DemoRequestResult>(undefined, thanks)
})
