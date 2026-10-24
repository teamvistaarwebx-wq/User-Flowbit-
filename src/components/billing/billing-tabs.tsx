import { LinkTabs } from '@/components/ui/tabs'
import { whatsAppEnabled } from '@/modules/features/flags'

export const PLAN_TAB_HREF = '/app/settings/subscription'
export const BILLS_TAB_HREF = '/app/settings/subscription?tab=bills'

/** Settings → Plan & billing: the plan, bills and invoices, and the WhatsApp wallet (shown while WhatsApp is on). */
export async function BillingTabs() {
  const wallet = await whatsAppEnabled()
  return (
    <LinkTabs
      className="mb-4"
      tabs={[
        { href: PLAN_TAB_HREF, label: 'Plan' },
        { href: BILLS_TAB_HREF, label: 'Bills and invoices' },
        ...(wallet ? [{ href: '/app/settings/billing/wallet', label: 'WhatsApp wallet' }] : []),
      ]}
    />
  )
}
