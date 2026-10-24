import type { Metadata } from 'next'
import Link from 'next/link'
import { findInvite } from '@/lib/auth/invites'
import { getSession } from '@/lib/auth/session'
import { dbConnect } from '@/lib/db'
import { isGoogleConfigured } from '@/lib/env'
import { roleLabel } from '@/lib/permissions'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { buttonClass } from '@/components/ui/button-styles'
import { AuthCard, OrDivider } from '../../../_components/auth-card'
import { GoogleButton } from '../../../_components/google-button'
import { LoginForm } from '../../login/login-form'
import { SignupForm } from '../../signup/signup-form'
import { AcceptInviteButton, SwitchAccountButton } from './accept-button'

export const metadata: Metadata = { title: 'Join your team' }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await dbConnect()
  const invite = await findInvite(token)
  if (!invite) {
    return (
      <AuthCard title="This invite has expired" brandWord={null} subtitle="Invite links work for 7 days and only once. Ask the person who invited you to send a new one.">
        <Link href="/login" className={buttonClass('outline', 'lg', 'h-[54px] w-full text-base')}>
          Go to sign in
        </Link>
      </AuthCard>
    )
  }
  const [org, inviter, invitee, current] = await Promise.all([
    Org.findById(invite.orgId, { name: 1 }).lean(),
    invite.invitedBy ? User.findById(invite.invitedBy, { name: 1 }).lean() : null,
    User.findOne({ email: invite.email }, { passwordHash: 1, googleId: 1 }).lean(),
    getSession(),
  ])
  const orgName = org?.name ?? 'the workspace'
  const subtitle = `${inviter?.name ?? 'A teammate'} invited ${invite.email} to join ${orgName} as ${roleLabel(invite.role)}.`

  if (current) {
    const matches = current.user.email === invite.email
    return (
      <AuthCard title="Join" brandWord={orgName} subtitle={subtitle}>
        {matches ? (
          <AcceptInviteButton token={token} orgName={orgName} />
        ) : (
          <div className="space-y-4">
            <p className="rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              You are signed in as {current.user.email}. This invite is for {invite.email}.
            </p>
            <SwitchAccountButton token={token} />
          </div>
        )}
      </AuthCard>
    )
  }

  const hasAccount = Boolean(invitee?.passwordHash || invitee?.googleId)
  return (
    <AuthCard title={hasAccount ? 'Sign in to join' : 'Create your account for'} brandWord={orgName} subtitle={subtitle}>
      {hasAccount ? <LoginForm invite={token} email={invite.email} /> : <SignupForm invite={token} email={invite.email} />}
      <OrDivider />
      <GoogleButton configured={isGoogleConfigured()} invite={token} label="Continue with Google" />
    </AuthCard>
  )
}
