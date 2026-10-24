import { LegalDoc } from '@/components/marketing/legal-doc'
import { flowbitSupplier } from '@/lib/env'
import { privacyContent } from '@/modules/marketing/legal/privacy'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Privacy policy',
  description: 'What personal data Flowbit handles, why, which providers help run the service, how long it is kept and your rights.',
  path: '/legal/privacy',
})

export default function PrivacyPage() {
  const { legalName, supportEmail } = flowbitSupplier()
  return <LegalDoc content={privacyContent({ legalName, supportEmail })} current="/legal/privacy" />
}
