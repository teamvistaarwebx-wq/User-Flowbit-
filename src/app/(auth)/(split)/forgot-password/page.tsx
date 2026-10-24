import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '../../_components/auth-card'
import { ForgotForm } from './forgot-form'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      brandWord={null}
      subtitle="Enter the email you sign in with and we will send you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-link transition-colors hover:text-blush">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthCard>
  )
}
