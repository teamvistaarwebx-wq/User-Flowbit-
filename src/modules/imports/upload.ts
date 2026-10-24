import 'server-only'
import { z } from 'zod'
import { UserError } from '@/lib/errors'
import { readSheet, type Sheet } from './sheet'
import { IMPORT_KINDS } from './types'

/** The upload every import action takes: the importer kind and the file (CSV or XLSX). */
export const uploadSchema = z.object({ kind: z.enum(IMPORT_KINDS), file: z.instanceof(File, { message: 'Choose a CSV or Excel file' }) })

export async function sheetOf(file: File): Promise<Sheet> {
  const sheet = readSheet(file.name, Buffer.from(await file.arrayBuffer()))
  if ('error' in sheet) throw new UserError(sheet.error)
  return sheet
}
