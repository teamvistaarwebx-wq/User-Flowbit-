import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/session'
import { first, type SearchParams } from '@/lib/list'
import { disabledWorkspaceNames, hasLiveWorkspace } from '@/lib/workspace'
import { planConfig } from '@/modules/console/settings-query'
import { OnboardingWizard } from './wizard'

export const metadata: Metadata = { title: 'Create your workspace' }

/**
 * Onboarding (Figma onboarding-a / onboarding-b): black, one plum glow breathing at the top-right, faint indigo
 * at the top-left, and the glass card in the middle with the ribbons bent behind its edges.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const { user } = await requireUser()
  // Deleted workspaces do not count (same rule as /app), or the two pages would redirect to each other forever.
  const hasWorkspace = await hasLiveWorkspace(user._id)
  if (hasWorkspace && first(sp.new) !== '1') redirect('/app')
  const [turnedOff, config] = await Promise.all([hasWorkspace ? [] : disabledWorkspaceNames(user._id), planConfig()])
  const notice = turnedOff.length
    ? `Your access to ${turnedOff.join(', ')} was turned off. Ask an owner or admin of that workspace to turn it back on, or create a new workspace below.`
    : undefined
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-black px-4 py-10 sm:py-[84px]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[75%] top-[4%] h-[1300px] w-[1300px] -translate-x-1/2 -translate-y-1/2 animate-[breathe_18s_var(--ease-in-out)_infinite] bg-[radial-gradient(closest-side,#7C5072_0%,rgba(124,80,114,0.6)_38%,rgba(116,76,106,0)_100%)]" />
        <div className="absolute -left-40 -top-40 h-[520px] w-[620px] bg-[radial-gradient(closest-side,rgba(28,14,64,0.7),rgba(7,4,16,0))]" />
      </div>
      {/* A way out: back to the current workspace (opened from "Create workspace"), or another account. */}
      <nav aria-label="Account" className="absolute right-4 top-4 z-20 flex items-center gap-4 text-sm text-white/70 sm:right-8 sm:top-6">
        {hasWorkspace ? (
          <Link href="/app" className="font-medium text-white transition-opacity hover:opacity-75">
            Cancel
          </Link>
        ) : null}
        <span className="hidden sm:inline">{user.email}</span>
        <form method="post" action="/api/auth/signout">
          <button type="submit" className="font-medium text-white transition-opacity hover:opacity-75">
            Sign out
          </button>
        </form>
      </nav>
      <OnboardingWizard email={user.email} notice={notice} verified={Boolean(user.emailVerifiedAt)} limits={{ freeSeats: config.freeSeats, freeMonths: config.freeMonths, trialDays: config.trialDays }} />
    </main>
  )
}
