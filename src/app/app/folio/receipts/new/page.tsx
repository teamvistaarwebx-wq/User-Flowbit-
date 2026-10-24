import type { Metadata } from 'next'
import { Banknote, Building2, Settings2 } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { first, type SearchParams } from '@/lib/list'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { receiptFormOptions } from '@/modules/folio/receipts/queries'
import { ReceiptForm } from '../_components/receipt-form'

export const metadata: Metadata = { title: 'Record payment' }

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'folio', perm: 'receipts.write' })
  const options = await receiptFormOptions(ctx)

  return (
    <>
      <PageHeader title="Record payment" description="Record money against a client, then say which bills it settles." breadcrumb={breadcrumbFor('/app/folio/receipts/new')} back={{ href: '/app/folio/receipts', label: 'Receipts' }} icon={<Banknote />} />
      {!options.entities.length ? (
        <Card variant="solid">
          <EmptyState icon={<Settings2 />} title="Set up your firm first" description="Receipts are numbered in the series of the firm whose bank received the money." action={ctx.can('folio.settings') ? <Button variant="primary" href="/app/folio/settings">Open Folio settings</Button> : undefined} />
        </Card>
      ) : !options.clients.length ? (
        <Card variant="solid">
          <EmptyState icon={<Building2 />} title="Add a client first" description="Money is always received against a client." action={ctx.can('clients.write') ? <Button variant="primary" href="/app/clients/new">Add client</Button> : undefined} />
        </Card>
      ) : (
        <ReceiptForm options={options} initialClientId={first(sp.clientId)} initialInvoiceId={first(sp.invoiceId)} />
      )}
    </>
  )
}
