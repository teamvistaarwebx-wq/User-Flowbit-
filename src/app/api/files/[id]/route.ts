import { NextResponse, type NextRequest } from 'next/server'
import { getCtx } from '@/lib/ctx'
import { storedFileResponse } from '@/lib/file-response'
import { findMemberWorkspaceLogo, findSharedAvatar, findStoredFile } from '@/lib/files'
import { canOpenFile } from '@/modules/files/access'

export const runtime = 'nodejs'

/**
 * Streams a stored file of the signed-in member's workspace when the member may
 * open the record it belongs to (modules/files/access). ?download=1 forces a download.
 * The bytes come from the storage driver (local disk or a private bucket); a bucket is never public.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  const { id } = await params
  // Until a required 2FA is set up, only the shell's avatars and logos open, never workspace files.
  const own = ctx.twoFactorMissing ? null : await findStoredFile(ctx.orgId, id)
  const file = own && (await canOpenFile(ctx, own)) ? own : own ? null : ((await findSharedAvatar(ctx.userId, id)) ?? (await findMemberWorkspaceLogo(ctx.userId, id)))
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  // Types a browser would execute (SVG, HTML, XML) are always downloaded, never rendered on our origin.
  const scriptable = /svg|html|xml|javascript/i.test(file.mime)
  const download = scriptable || request.nextUrl.searchParams.get('download') === '1'
  const response = await storedFileResponse(file, { disposition: download ? 'attachment' : 'inline', cacheControl: 'private, max-age=300' })
  return response ?? NextResponse.json({ error: 'File not found.' }, { status: 404 })
}
