import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/console/session'
import { first, type SearchParams } from '@/lib/list'
import { safeNextPath } from '@/lib/safe-next'
import { ConsoleAuthFrame } from '@/components/console/auth-frame'
import { StaffSignInForm } from '@/components/console/auth-forms'

export const metadata: Metadata = { title: 'Sign in' }

/** Console sign-in, step 1 of 2. A Flowbit app account does not work here. */
export default async function ConsoleLoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const next = first((await searchParams).next)
  const state = await getStaffSession()
  if (state?.session.stage === 'full') redirect(safeNextPath(next, '/console'))
  return (
    <ConsoleAuthFrame title="Sign in to the Console" subtitle="For the Flowbit team. Your Console password and an authenticator code.">
      <StaffSignInForm next={next} />
    </ConsoleAuthFrame>
  )
}
