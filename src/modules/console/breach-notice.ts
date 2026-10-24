/**
 * The breach notice Flowbit sends workspace owners (DPDP; docs/BREACH-RUNBOOK.md):
 * the words and the list of workspaces, pure. modules/console/breach-actions
 * sends it as essential mail (no unsubscribe) and logs it in both audit logs.
 */

export type BreachNoticeInput = Readonly<{
  /** Flowbit's incident reference, e.g. 'INC-2026-001'. */
  reference: string
  /** When it was found (IST date, 'YYYY-MM-DD'). */
  discoveredOn: string
  whatHappened: string
  dataAffected: string
  whatWeDid: string
  whatYouShouldDo: string
}>

export const MAX_BREACH_WORKSPACES = 500

/** Workspace ids (24 hex) and slugs from a pasted list (one per line, or separated by commas or spaces). */
export function parseWorkspaceList(text: string): { ids: string[]; slugs: string[] } {
  const tokens = [...new Set(text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
  return {
    ids: tokens.filter((t) => /^[a-f0-9]{24}$/.test(t)),
    slugs: tokens.filter((t) => !/^[a-f0-9]{24}$/.test(t) && /^[a-z0-9][a-z0-9-]{1,62}$/.test(t)),
  }
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

/** The email: plain words, the facts in a fixed order, and the 72-hour reminder for the workspace as data fiduciary. */
export function breachNoticeContent(input: BreachNoticeInput, workspace: string, supportEmail: string): { subject: string; title: string; paragraphs: string[] } {
  return {
    subject: `Security notice from Flowbit about ${workspace} (${input.reference})`,
    title: `A security incident affected data in ${workspace}`,
    paragraphs: [
      `We are writing because a security incident affected data that ${workspace} keeps in Flowbit. We found it on ${longDate(input.discoveredOn)}. Our reference is ${input.reference}.`,
      `What happened: ${input.whatHappened}`,
      `Which data: ${input.dataAffected}`,
      `What we have done: ${input.whatWeDid}`,
      `What you should do: ${input.whatYouShouldDo}`,
      'You decide why and how the data of your clients and team is used, so under the Digital Personal Data Protection Act you may need to tell the Data Protection Board and the people affected. The rules expect this within 72 hours of becoming aware. Reply to this email if you need anything from us for that, such as logs or a list of the records involved.',
      `Questions: ${supportEmail}. Quote ${input.reference}.`,
    ],
  }
}
