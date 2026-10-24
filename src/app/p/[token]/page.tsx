import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { PayslipCodeForm } from '@/components/actionlinks/payslip-code-form'
import { BrandButton, PublicCard, PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { WORKSPACE_THEME_FIELDS, workspacePrimary } from '@/lib/brand-theme'
import { Org } from '@/models/Org'
import { loadPayslipLink, PAYSLIP_COOKIE, payslipSessionValid } from '@/modules/muster/payroll/payslip-link'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Payslip', robots: { index: false, follow: false } }

/**
 * /p/<signed token>: a payslip link from the WhatsApp bot. No amounts here:
 * the PDF opens only after a code sent to the employee's work email.
 */
export default async function PayslipLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await loadPayslipLink(token)
  if (!view) return <Unavailable title="This link is not available" body="It may have expired. Send payslip to the WhatsApp bot for a new one." />
  const org = await Org.findById(view.orgId, WORKSPACE_THEME_FIELDS).lean()
  const verified = payslipSessionValid((await cookies()).get(PAYSLIP_COOKIE)?.value, view.linkId)
  const brand = { name: view.orgName, legalName: null, addressLines: [], gstin: null, email: null, phone: null, logoSrc: null, color: workspacePrimary(org) }
  return (
    <PublicShell brand={brand}>
      <PublicCard className="space-y-4">
        <h1 className="text-xl font-semibold text-white">Your {view.monthLabel} payslip</h1>
        {verified ? (
          <BrandButton href={`/p/${token}/pdf`} download>
            Download payslip (PDF)
          </BrandButton>
        ) : (
          <PayslipCodeForm token={token} emailHint={view.emailHint} />
        )}
        <p className="text-xs text-white/50">For your privacy, a code goes to your work email before the payslip opens. Do not share this link.</p>
      </PublicCard>
    </PublicShell>
  )
}
