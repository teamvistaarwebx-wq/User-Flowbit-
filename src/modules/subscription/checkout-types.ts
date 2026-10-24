/** Razorpay Checkout options sent to the browser (client-safe; never holds the secret). */
export type CheckoutOptions = {
  key: string
  subscription_id?: string
  order_id?: string
  amount?: number
  currency?: string
  name: string
  description: string
  prefill: { name?: string; email?: string; contact?: string }
  theme: { color: string }
}

/** What the checkout actions return: Razorpay options, or nothing when the payment was simulated. */
export type CheckoutStart = { mode: 'razorpay'; options: CheckoutOptions } | { mode: 'done' }
