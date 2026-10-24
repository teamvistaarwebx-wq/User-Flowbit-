import { NextResponse, type NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { pdfResponse } from '@/lib/pdf/base'
import { renderStatementPdf } from '@/modules/folio/queries/statement-pdf'
import { rangeFrom } from '../range'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Statement of account PDF: GET /api/folio/ledger/<clientId>/pdf?from&to */
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })
  if (!ctx.has('folio') || !ctx.can('folio.read')) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  const { clientId } = await params
  const rendered = await renderStatementPdf(ctx, clientId, rangeFrom(request.nextUrl.searchParams))
  if (!rendered) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
  return pdfResponse(rendered.buffer, rendered.filename, request.nextUrl.searchParams.get('download') !== '1')
}
