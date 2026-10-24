import 'server-only'
import type { Types } from 'mongoose'
import { Member } from '@/models/Member'

/** Seats in use: active and invited members (disabled members free their seat). */
export async function countSeats(orgId: Types.ObjectId): Promise<number> {
  return Member.countDocuments({ orgId, status: { $in: ['active', 'invited'] } })
}
