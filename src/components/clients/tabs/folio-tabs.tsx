import type { ComponentType, ReactNode } from 'react'
import { Lock, ReceiptIndianRupee } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>

/**
 * Loads a Folio-owned component by name (guarded: Clients must render even if
 * Folio's files fail to load). Contract: docs/archive/porting/folio.md section 9.
 */
async function folioComponent(load: () => Promise<Record<string, unknown>>, name: string): Promise<AnyComponent | null> {
  try {
    const mod = await load()
    return ((mod[name] ?? mod.default) as AnyComponent | undefined) ?? null
  } catch (error) {
    console.error(`[clients] Folio component ${name} failed to load`, error)
    return null
  }
}

export function FolioLocked({ title = "Billing with Folio isn't on your plan" }: { title?: string }) {
  return (
    <Card variant="table" className="flex flex-col items-center gap-1.5 py-12 text-center">
      <Lock className="mb-2 size-8 text-icon-muted" strokeWidth={1.25} />
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="max-w-sm text-[13px] text-fg-2">GST invoices, receipts and a running ledger for this client live in Folio.</p>
      <div className="mt-3"><Button size="sm" variant="secondary" href="/app/settings/subscription?add=folio">See plans</Button></div>
    </Card>
  )
}

function Unavailable({ what }: { what: string }): ReactNode {
  return (
    <Card variant="table" className="flex items-center gap-3 text-sm text-fg-2">
      <ReceiptIndianRupee className="size-5 text-icon-muted" /> {what} could not be loaded. Open it in Folio instead.
    </Card>
  )
}

export async function FolioInvoices({ clientId }: { clientId: string }) {
  const Tab = await folioComponent(() => import('@/components/folio/ClientInvoicesTab'), 'ClientInvoicesTab')
  return Tab ? <Tab clientId={clientId} /> : <Unavailable what="Invoices for this client" />
}

export async function FolioLedger({ clientId, from, to }: { clientId: string; from?: string; to?: string }) {
  const Tab = await folioComponent(() => import('@/components/folio/ClientLedgerTab'), 'ClientLedgerTab')
  return Tab ? <Tab clientId={clientId} from={from} to={to} /> : <Unavailable what="The ledger" />
}

export async function FolioBillingProfile({ clientId }: { clientId: string }) {
  const Card_ = await folioComponent(() => import('@/components/folio/BillingProfileCard'), 'BillingProfileCard')
  return Card_ ? <Card_ clientId={clientId} /> : null
}
