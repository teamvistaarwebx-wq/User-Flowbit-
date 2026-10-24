import { normalizePhone } from '@/modules/whatsapp/phone'

/**
 * Per-person export and erasure (DPDP, notifications-v2 §0b.9) for a client
 * contact, a lead or a workspace member. Pure: which records hold the
 * person's data, what the export contains and what erasure does. The store
 * (./store) runs the steps through the workspace-scoped database, so a
 * request can only ever read or change its own workspace's rows.
 *
 * Erasure removes the person and their message trail; it keeps records the
 * business must keep by law (GST invoices, payroll and attendance), the
 * workspace's audit log, and the opt-out itself (the suppression row), so the
 * person is never messaged again if their number comes back.
 */

export type SubjectRef =
  | Readonly<{ kind: 'contact'; clientId: string; contactId: string }>
  | Readonly<{ kind: 'lead'; leadId: string }>
  | Readonly<{ kind: 'member'; memberId: string }>

export const SUBJECT_LABEL: Record<SubjectRef['kind'], string> = { contact: 'client contact', lead: 'lead', member: 'team member' }

/** The person as found in the workspace: the record and the email addresses and phone numbers that identify them. */
export type Subject = Readonly<{
  ref: SubjectRef
  /** The record itself (lead, contact with its client's name, member with the login's name and email). */
  record: Record<string, unknown>
  emails: readonly string[]
  /** E.164. */
  phones: readonly string[]
  /** Member: the login's user id (their bell rows, briefs and preferences). */
  userId?: string | null
  /** Member: active members must be disabled before their data is erased. */
  active?: boolean
}>

/** The collections the person's data can sit in, beyond the record itself. */
export const PRIVACY_COLLECTIONS = [
  'Message', 'ConsentLog', 'Suppression', 'WaThread', 'WaThreadMessage', 'WaBotSession', 'Activity', 'StageEvent', 'Deal',
  'Notification', 'Brief', 'NotificationPrefs', 'PortalContact', 'PortalSession', 'PortalCode', 'SequenceEnrollment',
] as const
export type PrivacyCollection = (typeof PRIVACY_COLLECTIONS)[number]

/** Rows whose `field` equals (or, for a list, contains) one of `anyOf`. */
export type Match = Readonly<{ field: string; anyOf: readonly string[] }>

export type EraseAction = Readonly<{ kind: 'delete' } | { kind: 'anonymise'; set: Readonly<Record<string, unknown>>; unset: readonly string[] } | { kind: 'keep' }>

export type Step = Readonly<{ collection: PrivacyCollection; match: Match; erase: EraseAction; label: string }>

const REMOVED = '[removed]'
/** A message log row keeps its date, channel, kind and status; who it went to and what it said go. */
const MESSAGE_ERASE: EraseAction = { kind: 'anonymise', set: { to: [REMOVED], subject: REMOVED }, unset: ['cc', 'html', 'text', 'title', 'body', 'params', 'attachments', 'headers', 'error', 'fallback', 'contactId'] }

const uniq = (values: readonly (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))]

/** Emails (lower case) and phones (E.164, plus the number as typed) that identify the person. */
export function identifiers(input: { emails?: readonly (string | null | undefined)[]; phones?: readonly (string | null | undefined)[] }): { emails: string[]; phones: string[] } {
  return {
    emails: uniq((input.emails ?? []).map((e) => e?.trim().toLowerCase())),
    phones: uniq((input.phones ?? []).map((p) => normalizePhone(p ?? ''))),
  }
}

/**
 * Where the person's data is, and what erasure does with each place. Steps
 * that depend on rows found earlier (thread messages of their WhatsApp
 * threads) are added by `followUpSteps`.
 */
export function privacySteps(subject: Subject): Step[] {
  const addresses = [...subject.emails, ...subject.phones]
  const steps: Step[] = []
  if (addresses.length) {
    steps.push({ collection: 'Message', match: { field: 'to', anyOf: addresses }, erase: MESSAGE_ERASE, label: 'Messages sent to them' })
    steps.push({ collection: 'ConsentLog', match: { field: 'address', anyOf: addresses }, erase: { kind: 'anonymise', set: { address: REMOVED }, unset: ['note'] }, label: 'Consent records' })
    steps.push({ collection: 'Suppression', match: { field: 'address', anyOf: addresses }, erase: { kind: 'keep' }, label: 'Opt-outs (kept, so they are never messaged again)' })
  }
  if (subject.phones.length) {
    steps.push({ collection: 'WaThread', match: { field: 'phone', anyOf: subject.phones }, erase: { kind: 'delete' }, label: 'WhatsApp conversations' })
    steps.push({ collection: 'WaBotSession', match: { field: 'phone', anyOf: subject.phones }, erase: { kind: 'delete' }, label: 'WhatsApp bot sessions' })
  }
  const ref = subject.ref
  if (ref.kind === 'lead') {
    steps.push({ collection: 'Activity', match: { field: 'leadId', anyOf: [ref.leadId] }, erase: { kind: 'delete' }, label: 'Lead activities' })
    steps.push({ collection: 'StageEvent', match: { field: 'entityId', anyOf: [ref.leadId] }, erase: { kind: 'delete' }, label: 'Lead stage history' })
    steps.push({ collection: 'Deal', match: { field: 'leadId', anyOf: [ref.leadId] }, erase: { kind: 'anonymise', set: {}, unset: ['leadId'] }, label: 'Deals from the lead (kept, unlinked)' })
    steps.push({ collection: 'SequenceEnrollment', match: { field: 'leadId', anyOf: [ref.leadId] }, erase: { kind: 'delete' }, label: 'Email sequence enrolments' })
  }
  if (ref.kind === 'contact') {
    steps.push({ collection: 'Activity', match: { field: 'contactId', anyOf: [ref.contactId] }, erase: { kind: 'anonymise', set: {}, unset: ['contactId'] }, label: 'Activities with them (kept, unlinked)' })
    steps.push({ collection: 'Deal', match: { field: 'contactId', anyOf: [ref.contactId] }, erase: { kind: 'anonymise', set: {}, unset: ['contactId'] }, label: 'Deals with them (kept, unlinked)' })
    if (subject.emails.length) steps.push({ collection: 'PortalContact', match: { field: 'email', anyOf: subject.emails }, erase: { kind: 'delete' }, label: 'Their client portal access' })
  }
  if (ref.kind === 'member' && subject.userId) {
    steps.push({ collection: 'Notification', match: { field: 'userId', anyOf: [subject.userId] }, erase: { kind: 'delete' }, label: 'Their bell notifications' })
    steps.push({ collection: 'Brief', match: { field: 'userId', anyOf: [subject.userId] }, erase: { kind: 'delete' }, label: 'Their briefs' })
    steps.push({ collection: 'NotificationPrefs', match: { field: 'userId', anyOf: [subject.userId] }, erase: { kind: 'delete' }, label: 'Their alert settings' })
  }
  return steps
}

/** Collections whose rows decide the follow-up steps: their children must be found before they go. */
const PARENT_COLLECTIONS = ['WaThread', 'PortalContact'] as const satisfies readonly PrivacyCollection[]

const idsOf = (rows: readonly Record<string, unknown>[] | undefined) => (rows ?? []).map((r) => String(r._id))

/** The messages of the WhatsApp threads, and the portal sign-in sessions and codes, found for the person. */
export function followUpSteps(found: Readonly<Partial<Record<PrivacyCollection, readonly Record<string, unknown>[]>>>): Step[] {
  const threadIds = idsOf(found.WaThread)
  const portalIds = idsOf(found.PortalContact)
  return [
    ...(threadIds.length ? [{ collection: 'WaThreadMessage', match: { field: 'threadId', anyOf: threadIds }, erase: { kind: 'delete' }, label: 'WhatsApp messages' } as const] : []),
    ...(portalIds.length
      ? [
          { collection: 'PortalSession', match: { field: 'contactId', anyOf: portalIds }, erase: { kind: 'delete' }, label: 'Client portal sessions' } as const,
          { collection: 'PortalCode', match: { field: 'contactId', anyOf: portalIds }, erase: { kind: 'delete' }, label: 'Client portal sign-in codes' } as const,
        ]
      : []),
  ]
}

export type PrivacyStore = Readonly<{
  find: (collection: PrivacyCollection, match: Match) => Promise<Record<string, unknown>[]>
  apply: (collection: PrivacyCollection, match: Match, erase: Exclude<EraseAction, { kind: 'keep' }>) => Promise<number>
  /** Removes the record itself: the lead, the contact from its client, or the member's own contact details. */
  eraseRecord: (subject: Subject) => Promise<void>
}>

export type SubjectExport = Readonly<{ subject: string; exportedAt: string; record: Record<string, unknown>; data: Record<string, unknown[]>; kept: string[] }>

/** Everything the workspace holds about the person, as one JSON document. */
export async function exportSubject(store: PrivacyStore, subject: Subject, now: Date): Promise<SubjectExport> {
  const steps = privacySteps(subject)
  const found: Partial<Record<PrivacyCollection, Record<string, unknown>[]>> = {}
  for (const step of steps) found[step.collection] = await store.find(step.collection, step.match)
  for (const step of followUpSteps(found)) found[step.collection] = await store.find(step.collection, step.match)
  return {
    subject: SUBJECT_LABEL[subject.ref.kind],
    exportedAt: now.toISOString(),
    record: subject.record,
    data: Object.fromEntries(Object.entries(found).filter(([, rows]) => rows && rows.length)) as Record<string, unknown[]>,
    kept: KEPT_BY_LAW[subject.ref.kind],
  }
}

/** What erasure keeps, per kind of person, and why (shown before confirming and in the export). */
export const KEPT_BY_LAW: Record<SubjectRef['kind'], string[]> = {
  contact: ['Invoices, quotes, receipts and credit notes keep the client details printed on them (GST law: 6 years).', 'Opt-outs are kept so they are never messaged again.'],
  lead: ['Opt-outs are kept so they are never messaged again.'],
  member: ['Payroll, attendance and leave records are kept (labour and tax law).', 'The audit log keeps what they did in the workspace.', 'Their Flowbit login is theirs: they delete it themselves.', 'Opt-outs are kept so they are never messaged again.'],
}

export type ErasureResult = Readonly<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }>

/** Erases the person: refuses an active member (disable them first), then every step, then the record itself. */
export async function eraseSubject(store: PrivacyStore, subject: Subject): Promise<ErasureResult> {
  if (subject.ref.kind === 'member' && subject.active) return { ok: false, error: 'Disable this member first (Settings → Members), then erase their data.' }
  const steps = privacySteps(subject)
  const parents: Partial<Record<PrivacyCollection, Record<string, unknown>[]>> = {}
  for (const step of steps) {
    if ((PARENT_COLLECTIONS as readonly PrivacyCollection[]).includes(step.collection)) parents[step.collection] = await store.find(step.collection, step.match)
  }
  const all = [...followUpSteps(parents), ...steps]
  const counts: Record<string, number> = {}
  for (const step of all) {
    if (step.erase.kind === 'keep') continue
    counts[step.collection] = await store.apply(step.collection, step.match, step.erase)
  }
  await store.eraseRecord(subject)
  return { ok: true, counts }
}
