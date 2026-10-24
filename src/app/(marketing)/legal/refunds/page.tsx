import { LegalDoc } from '@/components/marketing/legal-doc'
import { flowbitSupplier } from '@/lib/env'
import { refundsContent } from '@/modules/marketing/legal/refunds'
import { pageMetadata } from '@/modules/marketing/seo'

export const metadata = pageMetadata({
  title: 'Refunds & cancellation',
  description: 'How cancelling a Flowbit subscription works, what happens to your data, and when payments are refunded.',
  path: '/legal/refunds',
})

export default function RefundsPage() {
  const { legalName, supportEmail } = flowbitSupplier()
  return <LegalDoc content={refundsContent({ legalName, supportEmail })} current="/legal/refunds" />
}
