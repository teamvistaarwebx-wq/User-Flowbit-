'use client'

import { Copy, CreditCard } from 'lucide-react'
import { useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { createPaymentLinkAction } from '@/modules/payments/actions'

/** Creates (or reuses) the Razorpay payment link for the invoice's balance and copies it. */
export function PaymentLinkButton({ id, url: initial }: { id: string; url: string | null }) {
  const [url, setUrl] = useState(initial)
  const [create, pending] = useAction(createPaymentLinkAction, { onDone: (r) => r.data?.url && setUrl(r.data.url) })
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Payment link copied.')
    } catch {
      toast.error('Could not copy. Select the link and copy it yourself.')
    }
  }
  if (!url) {
    return (
      <Button size="sm" variant="secondary" icon={<CreditCard className="size-3.5" />} loading={pending} onClick={() => create({ id })}>
        Create payment link
      </Button>
    )
  }
  return (
    <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
      <code className="min-w-0 flex-1 truncate text-xs text-white/80">{url}</code>
      <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => void copy(url)}>
        Copy
      </Button>
    </div>
  )
}
