import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isGoogleConfigured } from '@/lib/env'
import { first, type SearchParams } from '@/lib/list'
import { safeNextPath } from '@/lib/safe-next'
import { AuthCard, AuthError, OrDivider } from '../../_components/auth-card'
import { GoogleButton } from '../../_components/google-button'
import { ProductStrip } from '../../_components/product-strip'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on this server. Use your email and password.',
  google_failed: 'Google sign-in did not complete. Try again or use your email and password.',
  google_state: 'That Google sign-in link expired. Try again.',
  google_unverified: 'Your Google email is not verified. Verify it with Google or use a password.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const next = first(sp.next)
  const invite = first(sp.invite)
  const error = first(sp.error)
  if (await getSession()) redirect(invite ? `/invite/${encodeURIComponent(invite)}` : safeNextPath(next, '/app'))
  return (
    <AuthCard
      title="Sign in to"
      subtitle="Use the email your team invited you with."
      footer={
        <>
          New to Flowbit?{' '}
          <Link href={invite ? `/signup?invite=${invite}` : '/signup'} className="font-medium text-link transition-colors hover:text-blush">
            Create an account
          </Link>
          <ProductStrip className="mt-6 text-fg-2 lg:hidden" />
        </>
      }
    >
      {error && ERRORS[error] ? <AuthError>{ERRORS[error]}</AuthError> : null}
      <LoginForm next={next} invite={invite} email={first(sp.email)} />
      <OrDivider />
      <GoogleButton configured={isGoogleConfigured()} next={next} invite={invite} />
    </AuthCard>
  )
}
