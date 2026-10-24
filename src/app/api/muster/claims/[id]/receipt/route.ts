import { NextResponse, type NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { storedFileResponse } from '@/lib/file-response'
import { findStoredFile } from '@/lib/files'
import { Claim } from '@/models/muster/Claim'
import { ownEmployeeId, visibleEmployeeIds } from '@/modules/muster/people/scope'

const deny = (status: number, error: string) => NextResponse.json({ error }, { status })
const MISSING = 'The receipt file is missing from storage. Ask the claimant to send it again.'

export const runtime = 'nodejs'

/** A claim's receipt: claim readers (claims.read, person visible) and the claimant. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return deny(401, 'Sign in again.')
  if (!ctx.has('muster')) return deny(403, 'Muster is not active on this workspace.')
  const { id } = await params
  if (!isValidObjectId(id)) return deny(404, 'Receipt not found.')
  const claim = await ctx.db(Claim).findById(id, { employeeId: 1, attachments: 1 }).lean()
  if (!claim) return deny(404, 'Receipt not found.')
  const own = String(claim.employeeId) === ownEmployeeId(ctx)
  const visible = await visibleEmployeeIds(ctx)
  if (!own && !(ctx.can('claims.read') && (visible === null || visible.includes(String(claim.employeeId))))) return deny(404, 'Receipt not found.')
  const index = Math.max(0, Number(request.nextUrl.searchParams.get('n') ?? 0) || 0)
  const attachment = claim.attachments[index]
  if (!attachment) return deny(404, 'This claim has no receipt attached.')
  const file = await findStoredFile(ctx.orgId, String(attachment.fileId))
  if (!file) return deny(404, MISSING)
  const inline = /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.mime)
  return (await storedFileResponse(file, { disposition: inline ? 'inline' : 'attachment', cacheControl: 'private, no-store' })) ?? deny(404, MISSING)
}
