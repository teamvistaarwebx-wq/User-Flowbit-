/**
 * Who gets WhatsApp A messages (console spec 10), pure: only a workspace's
 * owners and admins, only on a number they proved by OTP, only after they
 * opted in, and never after STOP. Customers' employees never get one.
 */

export const WA_RECIPIENT_ROLES: readonly string[] = ['owner', 'admin']

export type WaMemberLike = Readonly<{ role: string; status: string; userId: string }>
export type WaUserLike = Readonly<{
  id: string
  phone?: string | null
  phoneVerifiedAt?: Date | null
  whatsapp?: Readonly<{ optedInAt?: Date | null; optedOutAt?: Date | null }> | null
}>

/** True when this person may get WhatsApp from Flowbit on their stored number. */
export function canMessageOnWhatsApp(user: WaUserLike): boolean {
  if (!user.phone || !user.phoneVerifiedAt) return false
  const optedIn = user.whatsapp?.optedInAt
  const optedOut = user.whatsapp?.optedOutAt
  if (!optedIn) return false
  return !optedOut || optedOut.getTime() < optedIn.getTime()
}

/** E.164 numbers of the workspace's active owners and admins who may get WhatsApp; each number once. */
export function waRecipients(members: readonly WaMemberLike[], users: readonly WaUserLike[]): string[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const numbers = members
    .filter((m) => m.status === 'active' && WA_RECIPIENT_ROLES.includes(m.role))
    .map((m) => byId.get(m.userId))
    .filter((u): u is WaUserLike => Boolean(u) && canMessageOnWhatsApp(u!))
    .map((u) => u.phone!)
  return [...new Set(numbers)]
}
