import type { Metadata } from 'next'
import { signupSubtitle } from '@/lib/lifecycle-copy'
import { planConfig } from '@/modules/console/settings-query'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { findInvite } from '@/lib/auth/invites'
import { dbConnect } from '@/lib/db'
import { isGoogleConfigured } from '@/lib/env'
import { first, type SearchParams } from '@/lib/list'
import { parsePlanIntent, planIntentQuery } from '@/lib/plan-intent'
import { AuthCard, OrDivider } from '../../_components/auth-card'
import { GoogleButton } from '../../_components/google-button'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create your account' }

export default async function SignupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const invite = first(sp.invite)
  if (await getSession()) redirect(invite ? `/invite/${invite}` : '/app')
  await dbConnect()
  const pending = invite ? await findInvite(invite) : null
  // Pricing CTAs send ?plan=…; it is kept so Settings → Plan & billing preselects it after the trial.
  const intent = pending ? null : parsePlanIntent({ plan: first(sp.plan), products: first(sp.products), muster: first(sp.muster) })
  const planIntent = intent ? planIntentQuery(intent) : undefined
  return (
    <AuthCard
      title="Start with"
      subtitle={pending ? `Create your account to join with ${pending.email}.` : signupSubtitle(await planConfig())}
      footer={
        <>
          Already have an account?{' '}
          <Link href={invite ? `/login?invite=${invite}` : '/login'} className="font-medium text-link transition-colors hover:text-blush">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm invite={pending ? invite : undefined} email={pending?.email} planIntent={planIntent} />
      <OrDivider />
      <GoogleButton configured={isGoogleConfigured()} invite={pending ? invite : undefined} planIntent={planIntent} label="Sign up with Google" />
    </AuthCard>
  )
}
