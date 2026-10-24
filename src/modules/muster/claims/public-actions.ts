'use server'

import { z } from 'zod'
import { fail, ok, publicAction } from '@/lib/actions'
import { todayIST } from '@/lib/dates'
import { serverEnv } from '@/lib/env'
import { saveUpload } from '@/lib/files'
import { emailLayout, sendMail } from '@/lib/mail'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { email, isoDate, objectId, optionalText, paise } from '@/lib/validation'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { Member } from '@/models/Member'
import { OtpChallenge } from '@/models/muster/OtpChallenge'
import { RECEIPT_TYPES } from './constants'
import { receiptMatches } from './receipt-sniff'
import { eligibleEmployee, endSession, formBySlug, formDb, linkedClaimant, readSession, startSession } from './public'
import { claimAmountProblem, claimWindowProblem, expenseDateProblem } from './rules'
import { OTP_HOURLY_LIMIT, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, generateOtp, hashOtp, verifyOtpHash } from './session'

const OTP_WINDOW_MS = 3_600_000
const NOT_FOUND = 'This claim form does not exist. Check the link with HR.'
const slugField = z.string().trim().min(3).max(60)

export const requestClaimOtp = publicAction(z.object({ slug: slugField, email }), async ({ slug, email: address }) => {
  const found = await formBySlug(slug)
  if (!found) return fail(NOT_FOUND)
  const { form, org } = found
  const closed = claimWindowProblem(form)
  if (closed) return fail(closed)
  const limit = await rateLimit(`claim-otp:${form._id}:${address}`, OTP_HOURLY_LIMIT, OTP_WINDOW_MS)
  if (!limit.ok) return fail(rateLimitMessage(limit.retryAfterSeconds))
  const reply = `If ${address} can claim on this form, a six digit code is on its way. It lasts 10 minutes.`
  const employee = await eligibleEmployee(form, address)
  if (!employee) return ok(reply)
  const db = formDb(form.orgId)
  const purpose = `claim:${form._id}`
  // The in-memory limit resets with the process; the stored challenges are the durable count.
  const issued = await db(OtpChallenge).countDocuments({ email: address, purpose, createdAt: { $gt: new Date(Date.now() - OTP_WINDOW_MS) } })
  if (issued >= OTP_HOURLY_LIMIT) return fail(rateLimitMessage(OTP_WINDOW_MS / 1000))
  const code = generateOtp()
  await db(OtpChallenge).updateMany({ email: address, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } })
  await db(OtpChallenge).create({ email: address, purpose, codeHash: hashOtp(code, serverEnv().APP_SECRET), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
  const mail = emailLayout({
    title: `Your ${org.name} verification code`,
    paragraphs: [`Use ${code} to file expenses on "${form.name}". It lasts 10 minutes.`, 'If you did not ask for it, you can ignore this email.'],
  })
  await sendMail({ to: employee.workEmail, subject: `Your ${org.name} verification code`, ...mail, orgId: form.orgId, kind: 'claim_otp', entity: 'ClaimForm', entityId: form._id, secrets: [code] })
  return ok(reply)
})

/** A signed-in member linked to an employee files without the email code: their Flowbit login already proves who they are. */
export const continueAsLinkedEmployee = publicAction(z.object({ slug: slugField }), async ({ slug }) => {
  const found = await formBySlug(slug)
  if (!found) return fail(NOT_FOUND)
  const closed = claimWindowProblem(found.form)
  if (closed) return fail(closed)
  const claimant = await linkedClaimant(found.form)
  if (!claimant) return fail('Your Flowbit login cannot claim on this form. Verify with your work email instead.')
  await startSession(found.form, claimant.employeeId, claimant.email)
  return ok(`Signed in as ${claimant.name}. File your claim below.`)
})

export const verifyClaimOtp = publicAction(
  z.object({ slug: slugField, email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the six digit code') }),
  async ({ slug, email: address, code }) => {
    const found = await formBySlug(slug)
    if (!found) return fail(NOT_FOUND)
    const { form } = found
    const db = formDb(form.orgId)
    const challenge = await db(OtpChallenge).findOne({ email: address, purpose: `claim:${form._id}`, consumedAt: null }).sort({ createdAt: -1 }).lean()
    if (!challenge) return fail('That code did not match.', { code: 'That code did not match.' })
    if (challenge.expiresAt < new Date()) return fail('That code has expired. Request a new one.', { code: 'That code has expired. Request a new one.' })
    // Each guess takes an attempt atomically before it is judged, so parallel guesses cannot all slip under the limit.
    const slot = await db(OtpChallenge).updateOne({ _id: challenge._id, consumedAt: null, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { $inc: { attempts: 1 } })
    if (!slot.modifiedCount) return fail('Too many attempts. Request a new code.', { code: 'Too many attempts. Request a new code.' })
    if (!verifyOtpHash(code, challenge.codeHash, serverEnv().APP_SECRET)) return fail('That code did not match.', { code: 'That code did not match.' })
    const employee = await eligibleEmployee(form, address)
    if (!employee) return fail('This email can no longer claim on this form. Speak to HR.')
    const consumed = await db(OtpChallenge).updateOne({ _id: challenge._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
    if (!consumed.modifiedCount) return fail('That code was already used. Request a new one.')
    await startSession(form, String(employee._id), address)
    return ok(`Verified as ${employee.fullName}. File your claim below.`)
  },
)

const claimSchema = z.object({
  slug: slugField,
  categoryId: objectId,
  expenseDate: isoDate,
  amount: paise,
  vendor: optionalText(120),
  purpose: z.string({ error: 'Say what it was for' }).trim().min(3, 'Say what it was for, in a few words').max(200),
  project: optionalText(120),
  description: optionalText(1000),
  paymentMethod: optionalText(40),
  receipt: z.instanceof(File).optional(),
})

export const submitClaim = publicAction(claimSchema, async (input) => {
  const found = await formBySlug(input.slug)
  if (!found) return fail(NOT_FOUND)
  const { form } = found
  const session = await readSession(form)
  if (!session) return fail('Your session on this form has ended. Verify your work email again above; the claim you typed is kept.')
  const closed = claimWindowProblem(form)
  if (closed) return fail(closed)
  const employee = await eligibleEmployee(form, session.email)
  if (!employee || String(employee._id) !== session.employeeId) return fail('This email can no longer claim on this form. Speak to HR.')
  const db = formDb(form.orgId)

  const category = form.categoryIds.some((id) => String(id) === input.categoryId) ? await db(ClaimCategory).findOne({ _id: input.categoryId, isActive: true }).lean() : null
  if (!category) return fail('Some fields need attention.', { categoryId: 'Pick one of the categories on this form' })
  const dateProblem = expenseDateProblem(input.expenseDate, todayIST())
  if (dateProblem) return fail('Some fields need attention.', { expenseDate: dateProblem })
  const amountProblem = claimAmountProblem(input.amount, { formCap: form.maxClaimAmount, categoryCap: category.maxAmount, categoryName: category.name })
  if (amountProblem) return fail('Some fields need attention.', { amount: amountProblem })
  const receipt = input.receipt && input.receipt.size > 0 ? input.receipt : null
  if (form.requiresReceipt && !receipt) return fail('Some fields need attention.', { receipt: 'This form needs a receipt. Attach a photo or PDF of it.' })
  if (receipt && !RECEIPT_TYPES.includes(receipt.type)) return fail('Some fields need attention.', { receipt: 'Attach a PDF or a photo (PNG, JPEG, WebP or HEIC).' })
  if (receipt && !receiptMatches(receipt.type, new Uint8Array(await receipt.slice(0, 16).arrayBuffer()))) return fail('Some fields need attention.', { receipt: 'That file is not really a PDF or a photo. Attach the receipt itself.' })

  const claim = await db(Claim).create({
    formId: form._id,
    employeeId: employee._id,
    categoryId: category._id,
    expenseDate: input.expenseDate,
    amountClaimed: input.amount,
    vendor: input.vendor,
    purpose: input.purpose,
    project: input.project,
    description: input.description,
    paymentMethod: input.paymentMethod,
    status: 'submitted',
  })
  if (receipt) {
    const member = employee.memberId ? await db(Member).findById(employee.memberId, { userId: 1 }).lean() : null
    const uploader = member?.userId ?? form.createdBy ?? form.orgId
    try {
      const file = await saveUpload({ orgId: form.orgId, userId: uploader }, receipt, { kind: 'receipt', entity: 'Claim', entityId: claim._id, accept: RECEIPT_TYPES })
      if (file) await db(Claim).updateOne({ _id: claim._id }, { $set: { attachments: [{ fileId: file._id, fileName: file.name, mimeType: file.mime, sizeBytes: file.size }] } })
    } catch (error) {
      await db(Claim).deleteOne({ _id: claim._id })
      return fail(error instanceof Error && error.name === 'UserError' ? error.message : 'The receipt could not be stored, so the claim was not filed. Try again in a moment.', { receipt: 'The receipt could not be stored' })
    }
  }
  await notifyPermission({ orgId: form.orgId, userId: null }, 'claims.review', {
    title: `${employee.fullName} filed a claim for ${formatINR(input.amount)}`,
    body: `${input.purpose} · ${form.name}`,
    href: '/app/hr/claims',
    kind: 'approval',
    product: 'muster',
    event: 'claim.submitted',
    action: { kind: 'claim', id: String(claim._id) },
  })
  return ok(`Claim for ${formatINR(input.amount)} submitted: ${input.purpose}. HR reviews it, and you are emailed the decision.`)
})

export const endClaimSession = publicAction(z.object({ slug: slugField }), async ({ slug }) => {
  const found = await formBySlug(slug)
  if (!found) return fail(NOT_FOUND)
  await endSession(found.form)
  return ok('Signed out of this form.')
})
