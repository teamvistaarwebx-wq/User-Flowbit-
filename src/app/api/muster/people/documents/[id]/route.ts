import type { NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { storedFileResponse } from '@/lib/file-response'
import { findStoredFile } from '@/lib/files'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'

const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
const missing = () => new Response('The file is missing from storage.', { status: 410 })

export const runtime = 'nodejs'

/**
 * An employee document: HR with people.read_sensitive who can see the person,
 * or the person themselves (their own documents on /app/me/documents).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx || !ctx.has('muster')) return new Response('Not allowed', { status: 403 })
  const { id } = await params
  if (!isValidObjectId(id)) return new Response('Not found', { status: 404 })
  const doc = await ctx.db(EmployeeDocument).findOne({ _id: id, deletedAt: null }).lean()
  if (!doc) return new Response('Not found', { status: 404 })
  const employeeId = String(doc.employeeId)
  const visible = await visibleEmployeeIds(ctx)
  const hr = ctx.can('people.read_sensitive') && (visible === null || visible.includes(employeeId))
  if (!hr && ownEmployeeId(ctx) !== employeeId) return new Response('Not found', { status: 404 })
  const file = await findStoredFile(ctx.orgId, String(doc.fileId))
  if (!file) return missing()
  const inline = INLINE.has(file.mime || '') && request.nextUrl.searchParams.get('download') !== '1'
  return (await storedFileResponse(file, { disposition: inline ? 'inline' : 'attachment', filename: doc.fileName, cacheControl: 'private, no-store' })) ?? missing()
}
