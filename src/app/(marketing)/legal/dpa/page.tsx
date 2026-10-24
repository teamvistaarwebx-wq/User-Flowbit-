import { LegalDoc } from '@/components/marketing/legal-doc'
import { flowbitSupplier } from '@/lib/env'
import { dpaContent } from '@/modules/marketing/legal/dpa'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Data processing terms',
  description: 'How Flowbit processes the personal data in your workspace: roles, staff access, security, sub-processors, breaches and deletion.',
  path: '/legal/dpa',
})

export default function DpaPage() {
  const { legalName, supportEmail } = flowbitSupplier()
  return <LegalDoc content={dpaContent({ legalName, supportEmail })} current="/legal/dpa" />
}
