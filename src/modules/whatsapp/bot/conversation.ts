import 'server-only'
import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { runActionLink } from '@/modules/actionlinks/execute'
import { parseQuickReply } from '@/modules/actionlinks/token'
import { resolveDocLink } from '@/modules/doclinks/links'
import { normalizeUtr, UTR_PATTERN } from '@/modules/doclinks/access'
import { respondToQuote, shareUtr } from '@/modules/doclinks/respond'
import type { InteraktInboundEvent } from '../webhook-event'
import { sendWorkspaceText } from '../workspace-text'
import { botCopy } from './copy'
import { detectLang, isCancel, type Lang } from './parse'
import { clearSession, loadSession, saveSession, type BotSession } from './session'

/**
 * Inbound WhatsApp on a workspace's own number that Flowbit answers itself,
 * before it lands in the inbox: quick-reply buttons (Approve / Reject, Mark
 * done / Snooze, Accept a quote, "I've paid"), the follow-up they start (a
 * UTR, a reason for rejecting) and the employee bot. Returns true when the
 * message was handled here. Every lookup stays in the webhook's workspace.
 */

export type BotHook = (orgId: Types.ObjectId, event: InteraktInboundEvent, session: BotSession | null, lang: Lang) => Promise<boolean>

const WHATSAPP_META = { ip: 'whatsapp', userAgent: 'WhatsApp quick reply' } as const

async function say(orgId: Types.ObjectId, phone: string, text: string): Promise<void> {
  if (!text) return
  const result = await sendWorkspaceText(orgId, phone, text)
  if (!result.ok) console.error('[whatsapp bot] reply not sent', String(orgId), result.error)
}

/** A doc link from a button is honoured only when it belongs to this workspace. */
async function docLinkHere(orgId: Types.ObjectId, token: string, kind: 'quote' | 'invoice') {
  const resolved = await resolveDocLink(token)
  return resolved.state === 'active' && resolved.link.kind === kind && String(resolved.link.orgId) === String(orgId) ? resolved.link : null
}

async function quickReply(orgId: Types.ObjectId, event: InteraktInboundEvent, lang: Lang): Promise<boolean> {
  const copy = botCopy(lang)
  const parsed = parseQuickReply(event.payload)
  if (!parsed) {
    // One of our buttons with a payload we no longer understand: say so instead of filing it as a chat.
    if (event.payload?.startsWith('fb1:')) await say(orgId, event.phone, copy.openApp)
    return Boolean(event.payload?.startsWith('fb1:'))
  }
  if (parsed.type === 'action') {
    const result = await runActionLink({ token: parsed.token, choice: parsed.choice, note: null, viewer: { phone: event.phone, orgId: String(orgId) } })
    if (!result.ok && result.reason === 'note' && result.row) {
      await saveSession(orgId, event.phone, { flow: 'reject_note', step: 'note', data: { token: parsed.token }, lang, memberId: result.row.memberId })
      await say(orgId, event.phone, copy.askRejectNote)
      return true
    }
    await say(orgId, event.phone, result.message)
    return true
  }
  if (parsed.type === 'quote_accept') {
    const link = await docLinkHere(orgId, parsed.docToken, 'quote')
    if (!link) return say(orgId, event.phone, copy.openApp).then(() => true)
    const result = await respondToQuote(parsed.docToken, { decision: 'accept', name: event.name?.trim() || event.phone, comment: `Accepted on WhatsApp from ${event.phone}`, ...WHATSAPP_META })
    await say(orgId, event.phone, result === 'ok' ? 'Thank you. The quote is accepted and the team has been told.' : result === 'missing' ? copy.openApp : result.error)
    return true
  }
  const link = await docLinkHere(orgId, parsed.docToken, 'invoice')
  if (!link) return say(orgId, event.phone, copy.openApp).then(() => true)
  await saveSession(orgId, event.phone, { flow: 'utr', step: 'utr', data: { docToken: parsed.docToken }, lang, memberId: null })
  await say(orgId, event.phone, copy.askUtr)
  return true
}

/** The answer to a question asked by a button (UTR, reason for rejecting). Other flows belong to the bot hook. */
async function followUp(orgId: Types.ObjectId, event: InteraktInboundEvent, session: BotSession): Promise<boolean> {
  const copy = botCopy(session.lang)
  if (session.flow !== 'utr' && session.flow !== 'reject_note') return false
  if (isCancel(event.text)) {
    await clearSession(orgId, event.phone)
    await say(orgId, event.phone, copy.cancelled)
    return true
  }
  if (session.flow === 'utr') {
    const utr = normalizeUtr(event.text)
    if (!UTR_PATTERN.test(utr)) return say(orgId, event.phone, copy.badUtr).then(() => true)
    const result = await shareUtr(String(session.data.docToken ?? ''), { utr, amountPaise: null, note: `Shared on WhatsApp from ${event.phone} on ${formatDate(new Date())}`, ...WHATSAPP_META })
    await clearSession(orgId, event.phone)
    await say(orgId, event.phone, result === 'ok' ? copy.utrThanks : result === 'missing' ? copy.openApp : result.error)
    return true
  }
  const result = await runActionLink({ token: String(session.data.token ?? ''), choice: 'reject', note: event.text, viewer: { phone: event.phone, orgId: String(orgId) } })
  if (!result.ok && result.reason === 'note') return say(orgId, event.phone, result.message).then(() => true)
  await clearSession(orgId, event.phone)
  await say(orgId, event.phone, result.message)
  return true
}

export async function handleConversation(orgId: Types.ObjectId, event: InteraktInboundEvent, bot?: BotHook): Promise<boolean> {
  const session = await loadSession(orgId, event.phone)
  const lang = detectLang(event.text) ?? session?.lang ?? 'en'
  if (event.payload) {
    if (await quickReply(orgId, event, lang)) return true
  }
  if (session && (await followUp(orgId, event, { ...session, lang }))) return true
  return bot ? bot(orgId, event, session, lang) : false
}
