import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PublicCard, PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { PortalSignInForm } from '@/components/portal/sign-in-form'
import { brandFor } from '@/modules/doclinks/load'
import { getPortalViewer, portalOrg, portalPath } from '@/modules/portal/session'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Client portal', robots: { index: false, follow: false } }

/** Sign in to a workspace's client portal with an emailed code. */
export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await portalOrg(slug)
  if (!found || !found.portalOn) return <Unavailable title="This portal is not available" body="Ask the team that sent you here for a fresh link." />
  if (await getPortalViewer(slug)) redirect(portalPath(slug))
  return (
    <PublicShell brand={await brandFor(found.org._id, null)}>
      <PublicCard className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold text-white">Client portal</h1>
        <p className="mb-5 mt-1 text-sm text-white/70">Your projects, approvals, invoices and files with {found.org.name}. Sign in with the email they invited.</p>
        <PortalSignInForm slug={slug} />
      </PublicCard>
    </PublicShell>
  )
}
