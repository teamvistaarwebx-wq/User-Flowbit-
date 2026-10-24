import 'server-only'
import { isRazorpayConfigured, serverEnv } from '@/lib/env'
import { liveFetch } from '@/modules/whatsapp/platform-sender'
import { flowbitRazorpay, type FlowbitRazorpay } from './razorpay-client'

/** Flowbit's own Razorpay client with the RAZORPAY_* keys; null when they are not set (bills go out without a link). */
export function liveFlowbitRazorpay(): FlowbitRazorpay | null {
  if (!isRazorpayConfigured()) return null
  const env = serverEnv()
  return flowbitRazorpay(liveFetch, { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET })
}
