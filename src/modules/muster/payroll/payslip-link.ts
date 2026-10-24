import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Types } from 'mongoose'
import { dbConnect } from '@/lib/db'
import { scoped } from '@/lib/db/scoped'
import { appUrl, serverEnv } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { checkOtp, generateOtp, hashOtp, OTP_REFUSAL, OTP_TTL_SECONDS } from '@/lib/otp'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { findStoredFile } from '@/lib/files'
import { Org } from '@/models/Org'
import { Employee } from '@/models/muster/Employee'
import { OtpChallenge } from '@/models/muster/OtpChallenge'
import { Payslip } from '@/models/muster/Payslip'
import { PayslipLink } from '@/models/muster/PayslipLink'
import { hashActionKey, newActionKey, readActionToken, signActionToken } from '@/modules/actionlinks/token'
import { cycleLabel } from './queries'

/**
 * The OTP-protected payslip link the WhatsApp bot hands out: the message says
 * only that a payslip is ready; the page sends a six-digit code to the work
 * email, and the PDF opens only after the right code, for 15 minutes.
 */

const LINK_TTL_MS = 7 * 24 * 3_600_000
export const PAYSLIP_SESSION_MS = 15 * 60_000
export const PAYSLIP_COOKIE = 'fb_ps'
const CODES_PER_HOUR = 5

const purposeOf = (linkId: string) => `payslip:${linkId}`

export async function issuePayslipLink(orgId: Types.ObjectId, input: { payslipId: Types.ObjectId; employeeId: Types.ObjectId; userId: Types.ObjectId }, now = new Date()): Promise<string> {
  const key = newActionKey()
  await PayslipLink.create({ orgId, keyHash: hashActionKey(key), payslipId: input.payslipId, employeeId: input.employeeId, userId: input.userId, expiresAt: new Date(now.getTime() + LINK_TTL_MS) })
  return appUrl(`/p/${signActionToken(key, serverEnv().APP_SECRET)}`)
}

export type PayslipLinkView = Readonly<{ linkId: string; orgId: Types.ObjectId; orgName: string; monthLabel: string; emailHint: string; payslipId: string; fileId: string | null; employeeId: string }>

const maskEmail = (email: string) => {
  const [user, domain] = email.split('@')
  return domain ? `${user.slice(0, 1)}•••@${domain}` : '•••'
}

/** The link behind a token, or null (bad signature, unknown, expired, the payslip withdrawn). */
export async function loadPayslipLink(token: string, now = new Date()): Promise<PayslipLinkView | null> {
  const key = readActionToken(token, serverEnv().APP_SECRET)
  if (!key) return null
  await dbConnect()
  const link = await PayslipLink.findOne({ keyHash: hashActionKey(key), expiresAt: { $gt: now } }).lean()
  if (!link) return null
  const [slip, employee, org] = await Promise.all([
    scoped(Payslip, link.orgId).findOne({ _id: link.payslipId, employeeId: link.employeeId, isPublished: true }).lean(),
    scoped(Employee, link.orgId).findById(link.employeeId, { workEmail: 1 }).lean(),
    Org.findById(link.orgId, { name: 1 }).lean(),
  ])
  if (!slip || !employee?.workEmail || !org) return null
  return { linkId: String(link._id), orgId: link.orgId, orgName: org.name, monthLabel: cycleLabel(slip), emailHint: maskEmail(employee.workEmail), payslipId: String(slip._id), fileId: slip.fileId ? String(slip.fileId) : null, employeeId: String(link.employeeId) }
}

/** Emails a code to the work email on record (never to an address typed on the page). */
export async function sendPayslipCode(view: PayslipLinkView, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const key of [`payslipCode:${view.linkId}`, `payslipCodeIp:${ip}`]) {
    const limited = await rateLimit(key, CODES_PER_HOUR, 60 * 60_000)
    if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSeconds) }
  }
  const employee = await scoped(Employee, view.orgId).findById(view.employeeId, { workEmail: 1, fullName: 1 }).lean()
  if (!employee?.workEmail) return { ok: false, error: 'There is no work email on your record. Ask HR.' }
  const code = generateOtp()
  await OtpChallenge.create({ orgId: view.orgId, email: employee.workEmail, codeHash: hashOtp(code, serverEnv().APP_SECRET), purpose: purposeOf(view.linkId), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
  const mail = emailLayout({ title: `${code} is your payslip code`, paragraphs: [`Use this code to open your ${view.monthLabel} payslip from ${view.orgName}. It works for 10 minutes.`, 'If you did not ask for it, ignore this email.'], workspace: view.orgName })
  await sendMail({ to: employee.workEmail, subject: `${code} is your payslip code`, ...mail, orgId: view.orgId, kind: 'security', secrets: [code] })
  return { ok: true }
}

export async function verifyPayslipCode(view: PayslipLinkView, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenge = await OtpChallenge.findOne({ orgId: view.orgId, purpose: purposeOf(view.linkId) }).sort({ createdAt: -1 })
  const result = checkOtp(challenge, code.trim(), serverEnv().APP_SECRET)
  if (challenge && result !== 'ok') await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } })
  if (result !== 'ok') return { ok: false, error: OTP_REFUSAL[result] }
  const consumed = await OtpChallenge.updateOne({ _id: challenge!._id, consumedAt: null }, { $set: { consumedAt: new Date() } })
  if (!consumed.modifiedCount) return { ok: false, error: OTP_REFUSAL.used }
  await PayslipLink.updateOne({ _id: view.linkId }, { $set: { verifiedAt: new Date() } })
  return { ok: true }
}

const sessionSig = (linkId: string, exp: number) => createHmac('sha256', serverEnv().APP_SECRET).update(`payslip:${linkId}:${exp}`).digest('base64url')

/** The cookie value that opens this link's PDF for 15 minutes after a correct code. */
export const payslipSession = (linkId: string, now = Date.now()): string => {
  const exp = now + PAYSLIP_SESSION_MS
  return `${linkId}.${exp}.${sessionSig(linkId, exp)}`
}

export function payslipSessionValid(value: string | undefined, linkId: string, now = Date.now()): boolean {
  const [id, expRaw, sig, extra] = (value ?? '').split('.')
  const exp = Number(expRaw)
  if (!id || !sig || extra !== undefined || id !== linkId || !Number.isFinite(exp) || exp < now) return false
  const expected = Buffer.from(sessionSig(linkId, exp))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export async function payslipFile(view: PayslipLinkView) {
  return view.fileId ? findStoredFile(view.orgId, view.fileId) : null
}

export const PAYSLIP_OTP_REFUSAL = OTP_REFUSAL
