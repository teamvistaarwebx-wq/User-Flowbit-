import { isValidObjectId } from 'mongoose'
import { NextResponse } from 'next/server'
import { getStaffCtx } from '@/lib/console/session'
import { storedFileResponse } from '@/lib/file-response'
import { StoredFile } from '@/models/StoredFile'

export const runtime = 'nodejs'

/** Billing files for Console staff with billing access: payment screenshots and TDS certificates only. */
const BILLING_KINDS = ['payment_proof', 'tds_certificate']

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staff = await getStaffCtx()
  if (!staff) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!staff.can('billing.view') || !isValidObjectId(id)) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  const file = await staff.raw(StoredFile).findOne({ _id: id, kind: { $in: BILLING_KINDS } }).lean()
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  const scriptable = /svg|html|xml|javascript/i.test(file.mime)
  const response = await storedFileResponse(file, { disposition: scriptable ? 'attachment' : 'inline', cacheControl: 'private, max-age=60' })
  return response ?? NextResponse.json({ error: 'File not found.' }, { status: 404 })
}
