'use client'

import { BellRing, Plus } from 'lucide-react'
import type { ProductKey } from '@/lib/catalog'
import { requestProduct } from '@/modules/subscription/product-actions'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'

/**
 * Add to plan, for people who manage billing. There is no separate product
 * trial (D2): the 15-day trial is once per business, from Settings → Plan & billing.
 */
export function OwnerButtons({ product, addLabel }: { product: ProductKey; addLabel: string }) {
  return (
    <Button variant="primary" size="lg" icon={<Plus className="size-4" />} href={`/app/settings/subscription?add=${product}`}>
      {addLabel}
    </Button>
  )
}

/** Everyone else: one tap tells the workspace's billing admins. */
export function AskAdminButton({ product }: { product: ProductKey }) {
  const [ask, asking] = useAction(requestProduct, { noRefresh: true })
  return (
    <Button variant="primary" size="lg" icon={<BellRing className="size-4" />} loading={asking} onClick={() => ask({ product })}>
      Ask your admin
    </Button>
  )
}
