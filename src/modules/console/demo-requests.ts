import 'server-only'
import type { StaffCtx } from '@/lib/console/session'
import { DemoRequest } from '@/models/marketing/DemoRequest'
import { DEMO_REQUEST_STATUSES } from '@/modules/marketing/demo'

const RECENT_DEMOS = 20

export type DemoRequestStatus = (typeof DEMO_REQUEST_STATUSES)[number]

export type DemoRequestRow = {
  id: string
  name: string
  email: string
  company: string
  phone: string
  teamSize: string
  products: string[]
  message: string
  status: DemoRequestStatus
  createdAt: string
}

/** The latest demo requests from /contact (not tenant data; Flowbit staff only) and how many are still new. */
export async function recentDemoRequests(p: StaffCtx): Promise<{ rows: DemoRequestRow[]; open: number }> {
  const [rows, open] = await Promise.all([
    p.raw(DemoRequest).find({}).sort({ createdAt: -1 }).limit(RECENT_DEMOS).lean(),
    p.raw(DemoRequest).countDocuments({ status: 'new' }),
  ])
  return {
    open,
    rows: rows.map((r) => ({
      id: String(r._id),
      name: r.name,
      email: r.email,
      company: r.company,
      phone: r.phone ?? '',
      teamSize: r.teamSize,
      products: r.products ?? [],
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}
