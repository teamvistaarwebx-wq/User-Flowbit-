import type { Metadata } from 'next'
import { Building2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { PageHeader } from '@/components/ui/page-header'
import { ClientForm } from '@/components/clients/client-form'
import { SolidCard } from '@/components/orbit/parts'
import { EMPTY_CLIENT } from '@/modules/clients/values'
import { clientFormOptions } from '@/modules/clients/form-options'

export const metadata: Metadata = { title: 'New client' }

export default async function NewClientPage() {
  const ctx = await requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.write' })
  const options = await clientFormOptions(ctx)
  return (
    <>
      <PageHeader title="New client" description="GSTIN and state decide CGST + SGST or IGST on Folio invoices." breadcrumb={breadcrumbFor('/app/clients/new')} icon={<Building2 />} />
      <SolidCard className="max-w-5xl rounded-[12px] pt-5">
        <ClientForm values={{ ...EMPTY_CLIENT, ownerId: String(ctx.memberId) }} owners={options.owners} sources={options.sources} sectors={options.sectors} canEdit />
      </SolidCard>
    </>
  )
}
