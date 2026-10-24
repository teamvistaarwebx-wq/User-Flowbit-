import { NextResponse, type NextRequest } from 'next/server'
import { orgByBrandKey } from '@/lib/email-brand'
import { storedFileResponse } from '@/lib/file-response'
import { findStoredFile } from '@/lib/files'

export const runtime = 'nodejs'

/** A workspace's logo for the email it sends its clients: PNG or JPEG only, by a random key. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const org = await orgByBrandKey(key)
  const file = org?.logoFileId ? await findStoredFile(org._id, String(org.logoFileId)) : null
  if (!file || !['image/png', 'image/jpeg'].includes(file.mime)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const response = await storedFileResponse(file, { disposition: 'inline', cacheControl: 'public, max-age=86400' })
  return response ?? NextResponse.json({ error: 'not found' }, { status: 404 })
}
