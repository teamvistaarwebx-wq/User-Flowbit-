/**
 * What the owner of a tasks+ address is told (in the app) when a mail to it is
 * refused, so it does not vanish silently. Pure; one notice per reason a day.
 */

const TITLE = 'An email to your tasks+ address did not become a task'

const BODIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^sender authentication failed/, "The sender's SPF, DKIM or DMARC check failed, so it may not really be from them."],
  [/not a member/, 'It came from an address that is not a member of this workspace.'],
  [/only the address owner/, "It came from a teammate. Only you can mail your address unless an admin turns on 'Allow teammates to email my address' in Settings → Security."],
  [/daily limit/, 'The workspace reached its daily limit of emailed tasks. Try again tomorrow.'],
  [/cannot create tasks/, "The sender's role can't create tasks in Work."],
  [/read-only/, 'The workspace is read-only. An owner can restore it in Settings → Plan & billing.'],
]

export function rejectionNotice(reason: string, day: string, ownerId: string): { title: string; body: string; dedupeKey: string } {
  const body = BODIES.find(([pattern]) => pattern.test(reason))?.[1] ?? `It was refused: ${reason}.`
  const kind = reason.replace(/\s*\(.*\)$/, '').replace(/[^a-z]+/gi, '-').toLowerCase()
  return { title: TITLE, body, dedupeKey: `mail-task-rejected:${ownerId}:${kind}:${day}` }
}
