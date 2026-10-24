'use client'

import { toast } from '@/lib/toast'
import type { CheckoutOptions } from '@/modules/subscription/checkout-types'

export const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

export type RazorpayResponse = { razorpay_payment_id: string; razorpay_signature: string; razorpay_subscription_id?: string; razorpay_order_id?: string }
type RazorpayInstance = { open: () => void }
type RazorpayCtor = new (options: CheckoutOptions & { handler: (r: RazorpayResponse) => void; modal: { ondismiss: () => void } }) => RazorpayInstance

/** Opens Razorpay Checkout (loaded by next/script) and resolves with the payment response, or null when closed. */
export function openRazorpay(options: CheckoutOptions): Promise<RazorpayResponse | null> {
  const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay
  if (!Razorpay) {
    toast.error('Razorpay Checkout did not load. Check your connection and try again.')
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const checkout = new Razorpay({
      ...options,
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => {
          toast.info('Payment window closed. Nothing was charged.')
          resolve(null)
        },
      },
    })
    checkout.open()
  })
}
