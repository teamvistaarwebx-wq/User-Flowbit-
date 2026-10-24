import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/console/session'
import { generateTotpSecret, otpauthUrl } from '@/lib/console/totp'
import { encryptionKey } from '@/lib/env'
import { first, type SearchParams } from '@/lib/list'
import { safeNextPath } from '@/lib/safe-next'
import { openSecret, sealSecret } from '@/lib/secret-box'
import { qrMatrix, qrPath } from '@/lib/upi'
import { StaffSession } from '@/models/console/StaffSession'
import { ConsoleAuthFrame } from '@/components/console/auth-frame'
import { EnrolForm } from '@/components/console/auth-forms'

export const metadata: Metadata = { title: 'Set up two-factor sign-in' }

/**
 * First sign-in: a new TOTP secret (kept sealed on the pending session until
 * confirmed), shown as a QR code and as text for manual entry.
 */
export default async function ConsoleEnrolPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const next = safeNextPath(first((await searchParams).next), '/console')
  const state = await getStaffSession()
  if (!state) redirect('/console/login')
  if (state.staff.totp?.enabledAt) redirect(state.session.stage === 'full' ? next : '/console/login/verify')
  const key = encryptionKey()
  if (!key) {
    return <ConsoleAuthFrame title="Two-factor sign-in is not available" subtitle="APP_ENCRYPTION_KEY is not set on this server. Ask the person who runs Flowbit to set it, then sign in again." />
  }
  let secret = openSecret(state.session.pendingTotpSealed, key)
  if (!secret) {
    secret = generateTotpSecret()
    await StaffSession.updateOne({ _id: state.session._id }, { $set: { pendingTotpSealed: sealSecret(secret, key) } })
  }
  const matrix = qrMatrix(otpauthUrl({ secret, account: state.staff.email }))
  const size = matrix.length + 4
  return (
    <ConsoleAuthFrame title="Set up two-factor sign-in" subtitle="The Console needs a code from an authenticator app (Google Authenticator, 1Password, Authy…) every time you sign in.">
      <div className="mb-5 flex flex-col items-center gap-3">
        <svg viewBox={`-2 -2 ${size} ${size}`} className="size-44 rounded-xl bg-white p-1" role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
          <path d={qrPath(matrix)} fill="#000" />
        </svg>
        <p className="text-center text-xs text-fg-2">Can&apos;t scan? Enter this key: <span className="break-all font-mono text-white">{secret.match(/.{1,4}/g)?.join(' ')}</span></p>
      </div>
      <EnrolForm next={next} />
    </ConsoleAuthFrame>
  )
}
