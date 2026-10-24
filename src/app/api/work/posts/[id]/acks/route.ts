import { isValidObjectId } from 'mongoose'
import { NextResponse } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { isModerator, loadPost } from '@/modules/work/posts/access'
import { acksCsv } from '@/modules/work/posts/acks'
import { postTypeOf } from '@/modules/work/posts/post-types'
import { ackList } from '@/modules/work/posts/queries'

export const runtime = 'nodejs'

/** CSV of who has and has not acknowledged a policy post (its author and moderators only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('work') || !isValidObjectId(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  try {
    const post = await loadPost(ctx, id)
    if (String(post.authorId) !== String(ctx.memberId) && !isModerator(ctx)) return NextResponse.json({ error: 'Only the author or a moderator can export this list.' }, { status: 403 })
    if (postTypeOf(post.category) !== 'policy') return NextResponse.json({ error: 'Only policy posts have acknowledgements.' }, { status: 400 })
    const body = `﻿${acksCsv(await ackList(ctx, post))}`
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="acknowledgements-${id}-${todayIST()}.csv"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    console.error('[posts acks csv]', id, error)
    return NextResponse.json({ error: 'Could not build the list. Try again.' }, { status: 500 })
  }
}
