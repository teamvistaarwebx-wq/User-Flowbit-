import { canMessageOnWhatsApp, type WaUserLike } from '../recipients'

/**
 * Who the employee bot answers (pure). Only a workspace that switched the bot
 * on and is connected with its own Interakt account (BYO), and only a number
 * that belongs to an active member who verified it by OTP and opted in to
 * WhatsApp. Everyone else's messages stay ordinary inbox chats.
 */

export type BotWorkspace = Readonly<{ connected: boolean; mode: 'byo' | 'managed'; botEnabled: boolean }>
export type BotPerson = Readonly<{ memberActive: boolean; employeeLinked: boolean; user: WaUserLike }>

export type BotAccess = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'bot_off' | 'not_byo' | 'not_member' | 'not_verified' | 'not_linked' }>

export function botAccess(workspace: BotWorkspace, person: BotPerson | null): BotAccess {
  if (!workspace.connected || !workspace.botEnabled) return { ok: false, reason: 'bot_off' }
  if (workspace.mode !== 'byo') return { ok: false, reason: 'not_byo' }
  if (!person || !person.memberActive) return { ok: false, reason: 'not_member' }
  if (!canMessageOnWhatsApp(person.user)) return { ok: false, reason: 'not_verified' }
  if (!person.employeeLinked) return { ok: false, reason: 'not_linked' }
  return { ok: true }
}
