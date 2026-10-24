import { NextResponse } from 'next/server'
import { getCtx } from '@/lib/ctx'
import { Notification } from '@/models/Notification'

/** Enough recent alerts to group by object in the bell (modules/settings/bell). */
const RECENT = 40

/** Bell polling: unread count + the latest notifications for the signed-in member. */
export async function GET() {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  const Notes = ctx.db(Notification)
  const [count, items] = await Promise.all([
    Notes.countDocuments({ userId: ctx.userId, readAt: null }),
    Notes.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(RECENT).lean(),
  ])
  return NextResponse.json(
    {
      count,
      items: items.map((n) => ({ id: String(n._id), title: n.title, body: n.body, href: n.href, kind: n.kind, createdAt: n.createdAt, readAt: n.readAt ?? null })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
