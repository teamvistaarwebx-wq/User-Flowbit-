import { NextResponse } from 'next/server'
import { IMPORTERS } from '@/modules/imports/registry'
import { isImportKind } from '@/modules/imports/types'
import { toCsv } from '@/modules/muster/import/csv'

export const runtime = 'nodejs'

/** The CSV template of an importer: its columns and one example row (no workspace data, so no sign-in needed). */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params
  if (!isImportKind(kind)) return NextResponse.json({ error: 'Unknown import.' }, { status: 404 })
  const importer = IMPORTERS[kind]
  const columns = importer.columns.map((c) => c.key)
  const csv = toCsv([Object.fromEntries(importer.columns.map((c) => [c.key, c.example]))], columns)
  return new NextResponse(`﻿${csv}\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="flowbit-${kind.replace('_', '-')}-template.csv"`, 'cache-control': 'public, max-age=3600' } })
}
