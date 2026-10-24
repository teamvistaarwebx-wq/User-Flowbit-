import type { Metadata } from 'next'
import { first, type SearchParams } from '@/lib/list'
import { ConsoleAuthFrame } from '@/components/console/auth-frame'
import { StaffSetupForm } from '@/components/console/auth-forms'

export const metadata: Metadata = { title: 'Choose your password' }

/** The one-time link from an Admin (or the migration): choose the Console password. */
export default async function ConsoleSetupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const token = first((await searchParams).token) ?? ''
  return (
    <ConsoleAuthFrame title="Choose your Console password" subtitle="Then sign in and set up two-factor sign-in.">
      {token ? <StaffSetupForm token={token} /> : <p className="text-sm text-fg-2">This link is incomplete. Open the link from your email again, or ask an Admin for a new one.</p>}
    </ConsoleAuthFrame>
  )
}
