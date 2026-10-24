'use server'

import { revalidatePath } from 'next/cache'
import { staffMailTo } from '@/modules/muster/people/mail-to'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { companyProfileOf } from '@/lib/company-profile'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { saveFile } from '@/lib/files'
import { emailLayout, sendMail } from '@/lib/mail'
import { notifyMembers } from '@/lib/notify'
import { nextSeq } from '@/lib/sequence'
import { isoDate, objectId, requiredText } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { Letter } from '@/models/muster/Letter'
import { LetterTemplate } from '@/models/muster/LetterTemplate'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { letterReference, orgPrefix } from '@/modules/muster/payroll/numbers'
import { assertVisible, mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { getPolicy } from '@/modules/muster/settings/queries'
import { LETTERS_BY_CODE, isLetterApplicable, type LetterDefinition } from './catalogue'
import { letterFileName, renderLetterPdf } from './pdf'
import { chosenSigner, issueSnapshot, letterSignerFor, signerSnapshot, typedSigner } from './signatory'
import { getLetter, templateWording, variablesFor, type LetterRecord } from './queries'
import { inputProblems, missingPlaceholders, renderTemplate, statesPay } from './render'

const OPTS = { product: 'muster', perm: 'letters.write' } as const
const LIST = '/app/hr/letters'
const PAY_REFUSAL = 'This letter states pay, so it needs payroll access to draft or open.'

function guardLetter(ctx: Ctx, employeeId: string, definition: LetterDefinition, paysOut: boolean): string | null {
  if (paysOut && !ctx.can('payroll.read')) return PAY_REFUSAL
  const own = employeeId === ownEmployeeId(ctx)
  if (own && !mayDecideOwn(ctx)) return OWN_RECORD_REFUSAL
  return null
}

async function loadEditable(ctx: Ctx, id: string): Promise<{ letter: LetterRecord; definition: LetterDefinition } | string> {
  const letter = await getLetter(ctx, id)
  if (!letter) throw new NotFoundError('That letter')
  await assertVisible(ctx, String(letter.employeeId))
  const definition = LETTERS_BY_CODE.get(letter.templateCode)
  if (!definition) return 'That letter type no longer exists.'
  const refusal = guardLetter(ctx, String(letter.employeeId), definition, letter.statesPay)
  return refusal ?? { letter, definition }
}

const refresh = (id: string) => {
  revalidatePath(LIST)
  revalidatePath(`${LIST}/${id}`)
  revalidatePath('/app/me/letters')
}

export const draftLetter = action(
  z.object({ employeeId: objectId, templateCode: z.string().min(2).max(40) }),
  async ({ employeeId, templateCode }, ctx) => {
    await assertVisible(ctx, employeeId)
    const definition = LETTERS_BY_CODE.get(templateCode)
    if (!definition) return fail('Pick a letter from the list.', { templateCode: 'Pick a letter from the list' })
    const employee = await ctx.db(Employee).findById(employeeId, { fullName: 1, status: 1, employmentType: 1 }).lean()
    if (!employee) throw new NotFoundError('That employee')
    if (!isLetterApplicable(definition, employee.status, employee.employmentType)) return fail(`${definition.name} is only for interns.`)
    const wording = await templateWording(ctx, templateCode)
    const paysOut = statesPay(definition, wording)
    const refusal = guardLetter(ctx, employeeId, definition, paysOut)
    if (refusal) return fail(refusal)
    const issueDate = todayIST()
    const year = issueDate.slice(0, 4)
    const reference = letterReference(orgPrefix(ctx.org), year, await nextSeq(ctx.orgId, `letter:${year}`))
    const policy = await getPolicy(ctx)
    const company = letterSignerFor(companyProfileOf(ctx.org), policy.letterSignatories, templateCode)
    const signer = company ? signerSnapshot(company) : typedSigner(ctx.user.name, ctx.member.title || 'Authorised Signatory')
    const { signatoryName, signatoryDesignation } = signer
    const variables = (await variablesFor(ctx, { employeeId, templateCode, inputs: {}, reference, issueDate, signatoryName, signatoryDesignation })) ?? {}
    const letter = await ctx.db(Letter).create({
      employeeId,
      employeeName: employee.fullName,
      templateCode,
      templateName: definition.name,
      category: definition.category,
      referenceNumber: reference,
      issueDate,
      subject: renderTemplate(wording.subject, variables),
      body: renderTemplate(wording.body, variables),
      ...signer,
      inputs: {},
      variables,
      statesPay: paysOut,
      status: 'draft',
      createdBy: ctx.userId,
    })
    await audit(ctx, { action: 'letter.drafted', entity: 'Letter', entityId: letter._id, summary: `${definition.name} drafted for ${employee.fullName} (${reference})`, product: 'muster', meta: { employeeId } })
    revalidatePath(LIST)
    return ok(`${definition.name} drafted for ${employee.fullName}. Check the wording, then issue it.`, { id: String(letter._id) }, `${LIST}/${letter._id}`)
  },
  OPTS,
)

const editSchema = z.object({
  id: objectId,
  issueDate: isoDate,
  signatoryName: requiredText('Signatory name', 80),
  signatoryDesignation: requiredText('Signatory designation', 80),
  /** A company signatory's id, or 'custom' for the typed name (modules/muster/letters/signatory). */
  signatoryChoice: z.string().max(40).optional(),
  subject: requiredText('Subject', 200),
  body: requiredText('Body', 20000),
  inputs: z.record(z.string(), z.string().optional()).default({}),
  /** '1' while the wording follows the template: the server renders it from the inputs. '0' keeps HR's hand edits. */
  followTemplate: z.enum(['0', '1']).default('1'),
})

/** Format problems only: a required field left empty keeps its placeholder, which blocks issuing instead. */
const formatProblems = (definition: LetterDefinition, inputs: Record<string, string>) =>
  Object.fromEntries(Object.entries(inputProblems(definition, inputs)).filter(([key]) => inputs[key.replace(/^inputs\./, '')]?.trim()))

export const saveLetterDraft = action(
  editSchema,
  async (input, ctx) => {
    const loaded = await loadEditable(ctx, input.id)
    if (typeof loaded === 'string') return fail(loaded)
    const { letter, definition } = loaded
    if (letter.status !== 'draft') return fail('This letter has been issued, so its wording is locked.')
    if (Number.isNaN(Date.parse(`${input.issueDate}T00:00:00Z`))) return fail('Some fields need attention.', { issueDate: 'Use a real date' })
    const inputs = Object.fromEntries(Object.entries(input.inputs).map(([k, v]) => [k, (v ?? '').trim()]).filter(([k]) => definition.inputs.some((f) => f.name === k)))
    const problems = formatProblems(definition, inputs)
    if (Object.keys(problems).length) return fail('Some fields need attention.', problems)
    const signer = chosenSigner(companyProfileOf(ctx.org), input.signatoryChoice, { name: input.signatoryName, designation: input.signatoryDesignation })
    const variables = (await variablesFor(ctx, { employeeId: String(letter.employeeId), templateCode: letter.templateCode, inputs, reference: letter.referenceNumber, issueDate: input.issueDate, signatoryName: signer.signatoryName, signatoryDesignation: signer.signatoryDesignation })) ?? {}
    const follows = input.followTemplate === '1'
    const wording = follows ? await templateWording(ctx, letter.templateCode) : null
    const subject = wording ? renderTemplate(wording.subject, variables) : input.subject
    const body = wording ? renderTemplate(wording.body, variables) : input.body
    const done = await ctx.db(Letter).updateOne(
      { _id: letter._id, status: 'draft' },
      { $set: { issueDate: input.issueDate, ...signer, subject, body, inputs, variables, wordingEdited: !follows, statesPay: letter.statesPay || statesPay(definition, wording) } },
    )
    if (!done.matchedCount) return fail('This letter was issued meanwhile, so its wording is locked. The page has been refreshed.')
    await audit(ctx, { action: 'letter.draft_saved', entity: 'Letter', entityId: letter._id, summary: `Saved draft ${letter.templateName} for ${letter.employeeName}`, product: 'muster', meta: { followsTemplate: follows } })
    refresh(input.id)
    return ok(`Draft saved: ${letter.templateName} for ${letter.employeeName}${follows ? '' : ', with your edits to the wording'}.`)
  },
  OPTS,
)

export const issueLetter = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const loaded = await loadEditable(ctx, id)
    if (typeof loaded === 'string') return fail(loaded)
    const { letter } = loaded
    if (letter.status !== 'draft') return fail('This letter was already issued. The page has been refreshed.')
    const missing = [...new Set([...missingPlaceholders(letter.subject, {}), ...missingPlaceholders(letter.body, {})])]
    if (missing.length) return fail(`This letter still has placeholders that were never filled in: ${missing.map((m) => `{{${m}}}`).join(', ')}. Fill in the details, or edit the text directly.`)
    // The signatory's current signature and seal are fixed on the letter now, so every reprint matches the issue.
    const snapshot = issueSnapshot(companyProfileOf(ctx.org), letter)
    const pdf = await renderLetterPdf(ctx.org, { ...letter, ...snapshot })
    const file = await saveFile(ctx, { name: letterFileName(letter.referenceNumber, letter.employeeName), mime: 'application/pdf', data: pdf, kind: 'letter', entity: 'Letter', entityId: letter._id })
    const done = await ctx.db(Letter).updateOne({ _id: letter._id, status: 'draft' }, { $set: { status: 'issued', fileId: file._id, issuedBy: ctx.userId, issuedAt: new Date(), ...snapshot } })
    if (!done.modifiedCount) return fail('This letter was already issued. The page has been refreshed.')
    await audit(ctx, { action: 'letter.issued', entity: 'Letter', entityId: letter._id, summary: `${letter.templateName} issued to ${letter.employeeName} (${letter.referenceNumber})`, product: 'muster', meta: { employeeId: String(letter.employeeId) } })
    const employee = await ctx.db(Employee).findById(letter.employeeId, { memberId: 1 }).lean()
    if (employee?.memberId) await notifyMembers(ctx, [employee.memberId], { title: `Your ${letter.templateName} has been issued`, href: '/app/me/letters', kind: 'info', product: 'muster', event: 'letter.issued' })
    refresh(id)
    return ok(`${letter.templateName} issued to ${letter.employeeName} and filed on their profile. Email it or download the PDF below.`)
  },
  OPTS,
)

export const emailLetter = action(
  z.object({ id: objectId, subject: requiredText('Subject', 200), body: requiredText('Message', 5000) }),
  async ({ id, subject, body }, ctx) => {
    const loaded = await loadEditable(ctx, id)
    if (typeof loaded === 'string') return fail(loaded)
    const { letter } = loaded
    if (letter.status !== 'issued') return fail('Only an issued letter can be emailed.')
    const employee = await ctx.db(Employee).findById(letter.employeeId, { workEmail: 1, personalEmail: 1, status: 1, exitDate: 1, memberId: 1 }).lean()
    const to = employee ? staffMailTo(employee, todayIST()) : null
    if (!employee || !to) return fail(`${letter.employeeName} has no email on record. Add one in their profile first.`)
    await ctx.db(Letter).updateOne({ _id: letter._id }, { $set: { emailSubject: subject, emailBody: body } })
    const pdf = await renderLetterPdf(ctx.org, letter)
    const mail = emailLayout({ title: subject, paragraphs: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), ...(employee.memberId ? { cta: { label: 'Open My letters', href: '/app/me/letters' } } : {}) })
    const sent = await sendMail({ to, subject, ...mail, attachments: [{ filename: letterFileName(letter.referenceNumber, letter.employeeName), content: pdf, mime: 'application/pdf', fileId: letter.fileId ?? undefined }], orgId: ctx.orgId, kind: 'letter', entity: 'Letter', entityId: letter._id, retry: false })
    if (!sent.ok) {
      await ctx.db(Letter).updateOne({ _id: letter._id }, { $set: { emailError: sent.error ?? 'Email could not be sent' } })
      refresh(id)
      return fail(`The email could not be sent (${sent.error ?? 'unknown error'}). The letter is still saved and can be downloaded.`)
    }
    if (sent.provider === 'outbox') {
      // Nothing left the building, so the letter is not marked emailed.
      await ctx.db(Letter).updateOne({ _id: letter._id }, { $set: { emailError: 'Email is not configured on this server, so it was not sent. It is in Settings → Email log.' } })
      refresh(id)
      return fail(`Email is not configured, so nothing was sent to ${to}; it is in Settings → Email log. The letter is still saved and can be downloaded.`)
    }
    await ctx.db(Letter).updateOne({ _id: letter._id }, { $set: { emailedAt: new Date() }, $unset: { emailError: 1 } })
    await audit(ctx, { action: 'letter.emailed', entity: 'Letter', entityId: letter._id, summary: `${letter.templateName} emailed to ${letter.employeeName}`, product: 'muster' })
    refresh(id)
    return ok(`${letter.templateName} emailed to ${to}.`)
  },
  OPTS,
)

export const discardLetterDraft = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const loaded = await loadEditable(ctx, id)
    if (typeof loaded === 'string') return fail(loaded)
    const { letter } = loaded
    const done = await ctx.db(Letter).deleteOne({ _id: letter._id, status: 'draft' })
    if (!done.deletedCount) return fail('Only drafts can be discarded. An issued letter can be revoked instead.')
    await audit(ctx, { action: 'letter.discarded', entity: 'Letter', entityId: letter._id, summary: `Discarded draft ${letter.templateName} for ${letter.employeeName} (${letter.referenceNumber} stays unused)`, product: 'muster' })
    revalidatePath(LIST)
    return ok(`Draft discarded. Reference ${letter.referenceNumber} will not be reused.`, undefined, LIST)
  },
  OPTS,
)

export const revokeLetter = action(
  z.object({ id: objectId, reason: requiredText('Reason', 500) }),
  async ({ id, reason }, ctx) => {
    const loaded = await loadEditable(ctx, id)
    if (typeof loaded === 'string') return fail(loaded)
    const { letter } = loaded
    const done = await ctx.db(Letter).updateOne({ _id: letter._id, status: 'issued' }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: ctx.userId, revokeReason: reason } })
    if (!done.modifiedCount) return fail('Only an issued letter can be revoked.')
    await audit(ctx, { action: 'letter.revoked', entity: 'Letter', entityId: letter._id, summary: `${letter.templateName} for ${letter.employeeName} revoked (${letter.referenceNumber})`, product: 'muster', meta: { reason } })
    refresh(id)
    return ok(`${letter.templateName} for ${letter.employeeName} revoked. It stays on record, marked REVOKED.`)
  },
  OPTS,
)

export const saveLetterTemplate = action(
  z.object({ code: z.string().min(2).max(40), subject: requiredText('Subject', 200), body: requiredText('Body', 20000) }),
  async ({ code, subject, body }, ctx) => {
    const definition = LETTERS_BY_CODE.get(code)
    if (!definition) throw new NotFoundError('That letter type')
    if (!ctx.can('payroll.read') && /\{\{\s*salary\./.test(`${subject} ${body}`)) return fail('Salary placeholders need payroll access. Remove them, or ask someone with payroll access to add them.')
    await ctx.db(LetterTemplate).findOneAndUpdate({ code }, { $set: { name: definition.name, category: definition.category, subject, body, isActive: true, updatedBy: ctx.userId, updatedByName: ctx.user.name } }, { upsert: true })
    await audit(ctx, { action: 'letter.template_saved', entity: 'LetterTemplate', entityId: code, summary: `Wording of ${definition.name} edited`, product: 'muster' })
    revalidatePath(LIST)
    return ok(`${definition.name} saved. New drafts use this wording; letters already written keep theirs.`)
  },
  { product: 'muster', perm: 'letters.templates' },
)

export const resetLetterTemplate = action(
  z.object({ code: z.string().min(2).max(40) }),
  async ({ code }, ctx) => {
    const definition = LETTERS_BY_CODE.get(code)
    if (!definition) throw new NotFoundError('That letter type')
    await ctx.db(LetterTemplate).deleteOne({ code })
    await audit(ctx, { action: 'letter.template_reset', entity: 'LetterTemplate', entityId: code, summary: `${definition.name} reset to the shipped wording`, product: 'muster' })
    revalidatePath(LIST)
    return ok(`${definition.name} is back to the shipped wording.`)
  },
  { product: 'muster', perm: 'letters.templates' },
)

