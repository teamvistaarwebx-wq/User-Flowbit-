import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { readPendingSignIn } from '@/lib/auth/two-factor'
import { REMEMBER_DEVICE_DAYS } from '@/lib/auth/two-factor-core'
import { AuthCard } from '../../../_components/auth-card'
import { TwoFactorForm } from './two-factor-form'

export const metadata: Metadata = { title: 'Two-factor sign-in' }

/** The second step after a password, Google or a reset link, while the 10-minute pending cookie lives. */
export default async function TwoFactorPage() {
  if (await getSession()) redirect('/app')
  const pending = await readPendingSignIn()
  if (!pending) redirect('/login')
  return (
    <AuthCard
      title="One more step"
      brandWord={null}
      subtitle="Enter the 6-digit code from your authenticator app, or one of your recovery codes."
      footer={
        <Link href="/login" className="font-medium text-link transition-colors hover:text-blush">
          Start again
        </Link>
      }
    >
      <TwoFactorForm rememberDays={REMEMBER_DEVICE_DAYS} />
    </AuthCard>
  )
}
