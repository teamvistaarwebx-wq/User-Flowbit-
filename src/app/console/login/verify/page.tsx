import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/console/session'
import { first, type SearchParams } from '@/lib/list'
import { safeNextPath } from '@/lib/safe-next'
import { ConsoleAuthFrame } from '@/components/console/auth-frame'
import { StaffCodeForm } from '@/components/console/auth-forms'

export const metadata: Metadata = { title: 'Two-factor sign-in' }

export default async function ConsoleVerifyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const next = first((await searchParams).next)
  const state = await getStaffSession()
  if (!state) redirect('/console/login')
  if (state.session.stage === 'full') redirect(safeNextPath(next, '/console'))
  if (!state.staff.totp?.enabledAt) redirect('/console/login/enrol')
  return (
    <ConsoleAuthFrame title="Enter your code" subtitle={`Signed in as ${state.staff.email}.`}>
      <StaffCodeForm next={next} />
    </ConsoleAuthFrame>
  )
}
