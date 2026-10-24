import type { Metadata } from 'next'
import { breadcrumbFor } from '@/lib/catalog'
import { canManageSignatories, companyProfileOf } from '@/lib/company-profile'
import { requireMember } from '@/lib/ctx'
import { fileUrl } from '@/lib/files'
import { PageHeader } from '@/components/ui/page-header'
import { CompanyLogoCard } from '@/components/settings/company/logo-card'
import { CompanyProfileForm } from '@/components/settings/company/profile-form'
import { SignatoriesCard } from '@/components/settings/company/signatories-card'
import { SampleDataBar } from '@/components/activation/checklist-card'
import { workspaceHasSample } from '@/modules/activation/store'

export const metadata: Metadata = { title: 'Company profile' }

/** Settings → Company profile: the letterhead, the logo and the authorised signatories of every PDF. */
export default async function CompanyProfilePage() {
  const ctx = await requireMember({ perm: 'org.manage' })
  const profile = companyProfileOf(ctx.org)
  const hasSample = await workspaceHasSample(ctx)
  return (
    <>
      <PageHeader title="Company profile" help="company-sources" description="The one place for your company’s details, logo and authorised signatories. Payslips, letters, Form 130, receipts, statements, invoices and Flowbit’s bills to you read them from here; Folio firms and Form 130 can override a field, and say so." breadcrumb={breadcrumbFor('/app/settings/company')} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <CompanyProfileForm
            values={{
              legalName: profile.legalName,
              tradeName: profile.tradeName ?? '',
              gstRegistered: profile.gstRegistered,
              gstin: profile.gstin ?? '',
              pan: profile.pan ?? '',
              cinLlpin: profile.cinLlpin ?? '',
              website: profile.website ?? '',
              email: profile.email ?? '',
              phone: profile.phone ?? '',
              line1: profile.address.line1 ?? '',
              line2: profile.address.line2 ?? '',
              city: profile.address.city ?? '',
              state: profile.address.state ?? '',
              pincode: profile.address.pincode ?? '',
            }}
          />
        </div>
        <div className="col-span-12 space-y-4 xl:sticky xl:top-4 xl:col-span-5 xl:self-start">
          {hasSample ? <SampleDataBar /> : null}
          <CompanyLogoCard logoUrl={profile.logoFileId ? fileUrl(profile.logoFileId) : null} />
          <SignatoriesCard
            canManage={canManageSignatories(ctx)}
            signPayslips={profile.signPayslips}
            rows={profile.signatories.map((s) => ({ id: s.id, name: s.name, designation: s.designation, hasSignature: Boolean(s.signatureFileId), hasSeal: Boolean(s.sealFileId), isDefault: s.isDefault }))}
          />
        </div>
      </div>
    </>
  )
}
