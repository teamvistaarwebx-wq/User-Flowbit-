import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClass } from '@/components/ui/button-styles'
import { readUnsubscribe } from '@/modules/messaging/unsubscribe'
import { AuthCard } from '../../../_components/auth-card'
import { UnsubscribeButton } from './unsubscribe-button'

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false } }

/** Public page behind every alert, digest and brief email's "Unsubscribe" link. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await readUnsubscribe(token)
  if (!view) {
    return (
      <AuthCard title="This link has expired" brandWord={null} subtitle="Open the latest email from Flowbit and use its Unsubscribe link, or change your notification settings after signing in.">
        <Link href="/login" className={buttonClass('outline', 'lg', 'h-[54px] w-full text-base')}>
          Go to sign in
        </Link>
      </AuthCard>
    )
  }
  const subtitle = view.optedOut
    ? `${view.claim.email} no longer gets alerts, digests or briefs from ${view.orgName}.`
    : `Stop alerts, digests and briefs from ${view.orgName} to ${view.claim.email}?`
  return (
    <AuthCard title={view.optedOut ? 'You are unsubscribed' : 'Unsubscribe'} brandWord={null} subtitle={subtitle}>
      <div className="space-y-4">
        <UnsubscribeButton token={token} optedOut={view.optedOut} />
        <p className="text-center text-xs text-fg-3">Security emails, payslips and documents someone sends you on purpose still arrive.</p>
      </div>
    </AuthCard>
  )
}
