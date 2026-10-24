import type { Metadata } from 'next'
import Link from 'next/link'
import { findReset } from '@/lib/auth/reset'
import { dbConnect } from '@/lib/db'
import { buttonClass } from '@/components/ui/button-styles'
import { AuthCard } from '../../../_components/auth-card'
import { ResetForm } from './reset-form'

export const metadata: Metadata = { title: 'Choose a new password' }

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await dbConnect()
  const reset = await findReset(token)
  if (!reset) {
    return (
      <AuthCard title="This link has expired" brandWord={null} subtitle="Reset links work once and for 60 minutes. Request a fresh one.">
        <Link href="/forgot-password" className={buttonClass('primary', 'lg', 'h-[54px] w-full text-base')}>
          Request a new link
        </Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Choose a new password" brandWord={null} subtitle="You will be signed in on this device. Other sessions are signed out.">
      <ResetForm token={token} />
    </AuthCard>
  )
}
