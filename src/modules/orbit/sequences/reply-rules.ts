import { createHmac } from 'node:crypto'

/**
 * Reply detection for Orbit sequences (pure):
 *  - without Gmail access: each enrolment has its own reply address (VERP
 *    style), reply+<enrolmentId>-<signature>@<INBOUND_EMAIL_DOMAIN>, copied on
 *    Reply-To of Flowbit-sent sequence mail. The signature is an HMAC of the
 *    enrolment id under APP_SECRET, so an address cannot be guessed or made
 *    up for another lead; a reply there stops only that enrolment.
 *  - with Gmail reply detection (gmail.readonly, behind GMAIL_REPLY_DETECTION):
 *    a Gmail thread the sequence started counts as replied once someone other
 *    than the sender writes in it (auto-replies ignored).
 */

export const REPLY_SIG_LENGTH = 16

export const enrollmentReplySig = (secret: string, enrollmentId: string) =>
  createHmac('sha256', secret).update(`sequence-reply:${enrollmentId.toLowerCase()}`).digest('base64url').replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, REPLY_SIG_LENGTH)

export const enrollmentReplyAddress = (secret: string, enrollmentId: string, domain: string) =>
  `reply+${enrollmentId.toLowerCase()}-${enrollmentReplySig(secret, enrollmentId)}@${domain.trim().toLowerCase()}`

const bare = (raw: string) => (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim().toLowerCase()

/** The enrolment id and signature of a reply+…@domain address among the recipients, or null. The signature is not checked here. */
export function parseEnrollmentReply(recipients: readonly string[], domain: string): { enrollmentId: string; sig: string } | null {
  const want = domain.trim().toLowerCase()
  for (const raw of recipients) {
    const [local, host] = bare(raw).split('@')
    if (!local || host !== want) continue
    const m = new RegExp(`^reply\\+([a-f0-9]{24})-([a-z0-9]{${REPLY_SIG_LENGTH}})$`).exec(local)
    if (m) return { enrollmentId: m[1], sig: m[2] }
  }
  return null
}

export type ThreadMessage = { from: string; autoSubmitted?: string | null }

/** An automatic reply (out-of-office, delivery report) never counts as a reply. */
const isAutomatic = (m: ThreadMessage) => Boolean(m.autoSubmitted && m.autoSubmitted.trim().toLowerCase() !== 'no')

/** Whether anyone other than the sender wrote in the thread (a human reply). */
export function threadHasReply(messages: readonly ThreadMessage[], senderEmail: string): boolean {
  const sender = senderEmail.trim().toLowerCase()
  return messages.some((m) => !isAutomatic(m) && bare(m.from) !== '' && bare(m.from) !== sender)
}

/** "Re: Quick question" subjects that look like auto-replies are left alone. */
export const looksAutomatic = (subject: string) => /^(auto(matic)?[ -]?reply|out of (the )?office|undeliverable|delivery status notification)/i.test(subject.trim())
