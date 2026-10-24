import 'server-only'
import { WaInboundClaim } from '@/models/whatsapp/WaInboundClaim'

const isDuplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000

/** Claims an inbound provider message id for handling: false when it was already claimed (a redelivery). */
export async function claimInbound(scope: string, providerId: string): Promise<boolean> {
  try {
    await WaInboundClaim.create({ scope, providerId })
    return true
  } catch (error) {
    if (isDuplicate(error)) return false
    throw error
  }
}

/** Gives a claim back when handling failed, so the provider's retry is handled. */
export async function releaseInbound(scope: string, providerId: string): Promise<void> {
  await WaInboundClaim.deleteOne({ scope, providerId })
}
