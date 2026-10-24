import 'server-only'
import { Types } from 'mongoose'
import { ok, runChecked } from '@/lib/actions'
import { punch } from '@/lib/attendance'
import type { Ctx } from '@/lib/ctx'
import { formatTime, todayIST } from '@/lib/dates'
import { scoped } from '@/lib/db/scoped'
import { firstName } from '@/lib/utils'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { Employee } from '@/models/muster/Employee'
import { LeaveType } from '@/models/muster/LeaveType'
import { Payslip } from '@/models/muster/Payslip'
import { memberCtxFor } from '@/modules/briefs/send'
import { getLeaveBalances } from '@/modules/muster/leave/balances'
import { requestLeave } from '@/modules/muster/leave/request'
import { issuePayslipLink } from '@/modules/muster/payroll/payslip-link'
import { cycleLabel } from '@/modules/muster/payroll/queries'
import { senderConfig } from '../connection'
import { phonePattern } from '../phone'
import type { InteraktInboundEvent } from '../webhook-event'
import { sendWorkspaceText } from '../workspace-text'
import { botAccess } from './auth'
import type { BotHook } from './conversation'
import { botCopy } from './copy'
import { advanceLeaveFlow, LEAVE_STEPS, startLeaveFlow, type LeaveFlowData, type LeaveStep } from './flow'
import { isCancel, parseCommand, type BotCommand, type Lang } from './parse'
import { clearSession, saveSession, type BotSession } from './session'

/**
 * The employee WhatsApp bot (notifications-v2 §0b.17), opt-in per workspace:
 * check in (with a shared location) and out, leave balance, a guided leave
 * application and the payslip-ready link. It answers only verified, opted-in
 * employees of the workspace whose number received the message, and every
 * command runs the app's own code (punch, requestLeave, balances) through the
 * member's own context and the same `action()` checks.
 */

async function say(orgId: Types.ObjectId, phone: string, text: string): Promise<void> {
  if (!text) return
  const result = await sendWorkspaceText(orgId, phone, text)
  if (!result.ok) console.error('[whatsapp bot] reply not sent', String(orgId), result.error)
}

/** The active member of this workspace whose verified number wrote, with their context; null when the bot must stay quiet. */
async function botMember(orgId: Types.ObjectId, phone: string): Promise<Ctx | null> {
  const config = await senderConfig(orgId)
  const users = await User.find({ phone: phonePattern(phone) }, { phone: 1, phoneVerifiedAt: 1, whatsapp: 1 }).limit(10).lean()
  const members = users.length ? await scoped(Member, orgId).find({ userId: { $in: users.map((u) => u._id) }, status: 'active' }, { userId: 1, employeeId: 1 }).lean() : []
  const member = members[0]
  const user = member ? users.find((u) => String(u._id) === String(member.userId)) : undefined
  const access = botAccess(
    { connected: Boolean(config), mode: config?.mode ?? 'byo', botEnabled: Boolean(config?.botEnabled) },
    member && user ? { memberActive: true, employeeLinked: Boolean(member.employeeId), user: { id: String(user._id), phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, whatsapp: user.whatsapp } } : null,
  )
  if (!access.ok || !member) return null
  return memberCtxFor(orgId, member.userId)
}

async function ownEmployee(ctx: Ctx) {
  return ctx.member.employeeId ? ctx.db(Employee).findById(ctx.member.employeeId, { employmentType: 1, status: 1, joinDate: 1, exitDate: 1, fullName: 1 }).lean() : null
}

type Reply = (text: string) => Promise<void>

async function checkIn(ctx: Ctx, geo: { lat: number; lng: number }, lang: Lang, reply: Reply) {
  const result = await runChecked(ctx, {}, async (c) => ok((await punch(c, 'in', 'WhatsApp check-in', { source: 'whatsapp', geo })).message), 'bot:checkin')
  await reply(result.ok ? botCopy(lang).checkedIn(formatTime(new Date())) : botCopy(lang).failed(result.error))
}

async function checkOut(ctx: Ctx, lang: Lang, reply: Reply) {
  const result = await runChecked(ctx, {}, async (c) => ok((await punch(c, 'out', 'WhatsApp check-out', { source: 'whatsapp' })).message), 'bot:checkout')
  await reply(result.ok ? botCopy(lang).checkedOut(formatTime(new Date())) : botCopy(lang).failed(result.error))
}

async function balance(ctx: Ctx, lang: Lang, reply: Reply) {
  const copy = botCopy(lang)
  const result = await runChecked(ctx, { product: 'muster', allowReadOnly: true }, async (c) => {
    const employee = await ownEmployee(c)
    if (!employee) return ok(copy.notLinked)
    const { rows } = await getLeaveBalances(c, employee, todayIST())
    const lines = rows.filter((r) => r.remaining !== null).map((r) => `${r.name}: ${r.remaining} ${lang === 'hi' ? 'दिन' : r.remaining === 1 ? 'day' : 'days'}${r.pending ? ` (${r.pending} ${lang === 'hi' ? 'लंबित' : 'pending'})` : ''}`)
    return ok(lines.length ? [copy.balanceHead, ...lines].join('\n') : copy.noBalance)
  }, 'bot:balance')
  await reply(result.ok ? (result.message ?? '') : copy.failed(result.error))
}

async function payslip(ctx: Ctx, lang: Lang, reply: Reply) {
  const copy = botCopy(lang)
  const result = await runChecked(ctx, { product: 'muster', allowReadOnly: true }, async (c) => {
    if (!c.member.employeeId) return ok(copy.notLinked)
    const slip = await c.db(Payslip).findOne({ employeeId: c.member.employeeId, isPublished: true }).sort({ year: -1, month: -1 }).lean()
    if (!slip) return ok(copy.noPayslip)
    const url = await issuePayslipLink(c.orgId, { payslipId: slip._id, employeeId: slip.employeeId, userId: c.userId })
    return ok(copy.payslipReady(cycleLabel(slip), url))
  }, 'bot:payslip')
  await reply(result.ok ? (result.message ?? '') : copy.failed(result.error))
}

async function startLeave(ctx: Ctx, phone: string, lang: Lang, reply: Reply) {
  if (!ctx.has('muster')) return reply(botCopy(lang).failed('Muster is not on for this workspace.'))
  const types = await ctx.db(LeaveType).find({ isActive: true }, { name: 1 }).sort({ displayOrder: 1, code: 1 }).limit(9).lean()
  if (!types.length) return reply(botCopy(lang).noBalance)
  const outcome = startLeaveFlow(types.map((t) => ({ id: String(t._id), name: t.name })), lang)
  await saveSession(ctx.orgId, phone, { flow: 'leave', step: outcome.next!.step, data: outcome.next!.data as Record<string, unknown>, lang, memberId: String(ctx.memberId) })
  await reply(outcome.reply)
}

async function continueLeave(ctx: Ctx, phone: string, session: BotSession, text: string, lang: Lang, reply: Reply) {
  const step = (LEAVE_STEPS as readonly string[]).includes(session.step) ? (session.step as LeaveStep) : 'type'
  const outcome = advanceLeaveFlow(step, session.data as unknown as LeaveFlowData, text, { today: todayIST(), lang })
  if (outcome.next) await saveSession(ctx.orgId, phone, { ...session, step: outcome.next.step, data: outcome.next.data as Record<string, unknown>, lang })
  else await clearSession(ctx.orgId, phone)
  if (!outcome.submit) return reply(outcome.reply)
  const submit = outcome.submit
  const result = await runChecked(ctx, { product: 'muster' }, (c) => requestLeave(c, submit), 'bot:leave')
  await reply(result.ok ? (result.message ?? '') : botCopy(lang).failed(result.error))
}

async function runCommand(ctx: Ctx, command: BotCommand, phone: string, lang: Lang, reply: Reply) {
  const copy = botCopy(lang)
  switch (command) {
    case 'checkin':
      await saveSession(ctx.orgId, phone, { flow: 'checkin', step: 'location', data: {}, lang, memberId: String(ctx.memberId) })
      return reply(copy.shareLocation)
    case 'checkout':
      return checkOut(ctx, lang, reply)
    case 'balance':
      return balance(ctx, lang, reply)
    case 'leave':
      return startLeave(ctx, phone, lang, reply)
    case 'payslip':
      return payslip(ctx, lang, reply)
    case 'cancel':
      await clearSession(ctx.orgId, phone)
      return reply(copy.cancelled)
    case 'menu':
      return reply(copy.menu(firstName(ctx.user.name) || ctx.user.name))
  }
}

export const handleBotMessage: BotHook = async (orgId: Types.ObjectId, event: InteraktInboundEvent, session: BotSession | null, lang: Lang) => {
  const inFlow = session && (session.flow === 'checkin' || session.flow === 'leave')
  const command = parseCommand(event.text)
  // Only commands, a shared location and the answers to the bot's own questions are the bot's; anything else is a chat for the inbox.
  if (!inFlow && !command && !event.location) return false
  const ctx = await botMember(orgId, event.phone)
  if (!ctx) return false
  if (inFlow && session.memberId && session.memberId !== String(ctx.memberId)) {
    await clearSession(orgId, event.phone)
    return false
  }
  const reply: Reply = (text) => say(orgId, event.phone, text)
  if (session?.flow === 'checkin') {
    if (event.location) {
      await clearSession(orgId, event.phone)
      await checkIn(ctx, event.location, lang, reply)
    } else if (isCancel(event.text)) {
      await clearSession(orgId, event.phone)
      await reply(botCopy(lang).cancelled)
    } else if (command && command !== 'checkin') {
      await clearSession(orgId, event.phone)
      await runCommand(ctx, command, event.phone, lang, reply)
    } else {
      await reply(botCopy(lang).locationNeeded)
    }
    return true
  }
  if (session?.flow === 'leave') {
    await continueLeave(ctx, event.phone, session, event.text, lang, reply)
    return true
  }
  // A location sent without asking is a check-in.
  if (event.location && !command) {
    await checkIn(ctx, event.location, lang, reply)
    return true
  }
  await runCommand(ctx, command!, event.phone, lang, reply)
  return true
}

