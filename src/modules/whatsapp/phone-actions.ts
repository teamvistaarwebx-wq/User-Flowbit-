'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { serverEnv } from '@/lib/env'
import { checkOtp, generateOtp, hashOtp, OTP_REFUSAL, OTP_TTL_SECONDS } from '@/lib/otp'
import { PLATFORM_ORG_ID } from '@/lib/sequence'
import { Member } from '@/models/Member'
import { Message } from '@/models/messaging/Message'
import { User } from '@/models/User'
import { PhoneVerification } from '@/models/whatsapp/PhoneVerification'
import { CONSENT_NOTICE_VERSION } from '@/modules/messaging/consent'
import { enqueue } from '@/modules/messaging/send'
import { optIn, optOut } from '@/modules/messaging/suppression-store'
import { consoleSettings } from '@/modules/console/settings-query'
import { checkbox } from '@/lib/validation'
import { toE164 } from './phone'
import { interaktKeys } from './platform-sender'
import { otpParamKeys, renderWaTemplate } from './templates'
import { assertWhatsAppOn } from '@/modules/features/flags'

/**
 * Settings → Profile → WhatsApp (console spec 10): a number proved by a
 * WhatsApp OTP from Flowbit's OTP number, and the person's opt-in. Only owners
 * and admins get WhatsApp from Flowbit; customers' employees never do.
 */

const RESEND_AFTER_MS = 60_000
const MAX_CODES_PER_DAY = 5
const OPEN = { allowReadOnly: true, allowBlocked: true }

export const requestPhoneCode = action(
  z.object({ phone: z.string().trim().min(10, 'Enter a 10-digit mobile number').max(20) }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const phone = toE164(input.phone)
    if (!phone) return fail('Enter an Indian mobile number, like 98765 43210.', { phone: 'Not a valid mobile number' })
    if (!interaktKeys().otp) return fail('WhatsApp verification is not switched on yet. Try again later.')
    const since = new Date(Date.now() - 86_400_000)
    const recent = await PhoneVerification.find({ userId: ctx.userId, createdAt: { $gte: since } }, { createdAt: 1 }).sort({ createdAt: -1 }).lean()
    if (recent.length >= MAX_CODES_PER_DAY) return fail('Too many codes today. Try again tomorrow.')
    if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < RESEND_AFTER_MS) return fail('Wait a minute before asking for another code.')
    const code = generateOtp()
    await PhoneVerification.create({ userId: ctx.userId, phone, codeHash: hashOtp(code, serverEnv().APP_SECRET), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) })
    const { whatsapp } = await consoleSettings()
    const rendered = renderWaTemplate('otp', whatsapp.templates, { code }, { buttonValue: code })
    const sent = await enqueue({ channel: 'whatsapp', to: phone, kind: 'otp', event: 'security.phone_code', userId: ctx.userId, template: rendered.template, params: rendered.params, title: 'WhatsApp verification code', retry: false, essential: true })
    // No orgId: the person asked for this code themselves, so a past STOP must not block re-verifying.
    // The code never stays readable on the stored message.
    if (sent.id) await Message.updateOne({ _id: sent.id }, { $set: Object.fromEntries(otpParamKeys().map((k) => [`params.${k}`, '••••••'])) })
    if (!sent.ok) return fail(`WhatsApp could not send the code${sent.error ? `: ${sent.error}` : ''}. Check the number and try again.`)
    return ok('Code sent on WhatsApp. It works for 10 minutes.', { phone })
  },
  OPEN,
)

export const confirmPhoneCode = action(
  z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const challenge = await PhoneVerification.findOne({ userId: ctx.userId, consumedAt: null }).sort({ createdAt: -1 }).lean()
    const result = checkOtp(challenge, input.code, serverEnv().APP_SECRET)
    if (challenge && result !== 'ok') await PhoneVerification.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } })
    if (result !== 'ok') return fail(OTP_REFUSAL[result], { code: OTP_REFUSAL[result] })
    await PhoneVerification.updateOne({ _id: challenge!._id }, { $set: { consumedAt: new Date() } })
    await User.updateOne({ _id: ctx.userId }, { $set: { phone: challenge!.phone, phoneVerifiedAt: new Date() } })
    await audit(ctx, { action: 'profile.phone_verified', entity: 'User', entityId: ctx.userId, summary: 'Verified a WhatsApp number' })
    revalidatePath('/app/settings/profile')
    return ok('Number verified.')
  },
  OPEN,
)

export const setWhatsAppOptIn = action(
  z.object({ on: checkbox }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const user = await User.findById(ctx.userId, { phone: 1, phoneVerifiedAt: 1 }).lean()
    if (input.on && (!user?.phone || !user.phoneVerifiedAt)) return fail('Verify your number first.')
    const now = new Date()
    await User.updateOne({ _id: ctx.userId }, { $set: input.on ? { 'whatsapp.optedInAt': now, 'whatsapp.noticeVersion': CONSENT_NOTICE_VERSION } : { 'whatsapp.optedOutAt': now } })
    if (user?.phone) {
      const orgIds = await Member.distinct('orgId', { userId: ctx.userId, status: 'active' })
      for (const orgId of [PLATFORM_ORG_ID, ...orgIds]) {
        const change = { orgId, channel: 'whatsapp' as const, address: user.phone, source: 'settings' as const, userId: ctx.userId, scope: 'all' as const }
        await (input.on ? optIn(change) : optOut(change))
      }
    }
    await audit(ctx, { action: input.on ? 'profile.whatsapp_opt_in' : 'profile.whatsapp_opt_out', entity: 'User', entityId: ctx.userId, summary: input.on ? 'Turned on WhatsApp messages from Flowbit' : 'Turned off WhatsApp messages from Flowbit' })
    revalidatePath('/app/settings/profile')
    return ok(input.on ? 'WhatsApp messages from Flowbit are on.' : 'WhatsApp messages from Flowbit are off.')
  },
  OPEN,
)
