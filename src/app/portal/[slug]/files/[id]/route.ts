import { NextResponse, type NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { storedFileResponse } from '@/lib/file-response'
import { findStoredFile } from '@/lib/files'
import { portalCanReadFile } from '@/modules/portal/queries'
import { getPortalViewer } from '@/modules/portal/session'

export const runtime = 'nodejs'

/** A shared file for a signed-in portal contact: only files of their shared projects or visible tasks, always as a download. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  const viewer = await getPortalViewer(slug)
  if (!viewer) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!isValidObjectId(id) || !(await portalCanReadFile(viewer, id))) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  const file = await findStoredFile(viewer.orgId, id)
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  const response = await storedFileResponse(file, { disposition: 'attachment', cacheControl: 'private, no-store' })
  return response ?? NextResponse.json({ error: 'File not found.' }, { status: 404 })
}
