import { LegalDoc } from '@/components/marketing/legal-doc'
import { flowbitSupplier } from '@/lib/env'
import { termsContent } from '@/modules/marketing/legal/terms'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Terms of service',
  description: 'The terms for using Flowbit: workspaces, trial, plans and payment, your data, Arc, acceptable use and liability.',
  path: '/legal/terms',
})

export default function TermsPage() {
  const { legalName, supportEmail } = flowbitSupplier()
  return <LegalDoc content={termsContent({ legalName, supportEmail })} current="/legal/terms" />
}
