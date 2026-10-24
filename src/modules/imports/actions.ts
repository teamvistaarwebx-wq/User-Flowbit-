'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import type { Ctx } from '@/lib/ctx'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { IMPORTERS, type AnyImporter } from './registry'
import { confirmImport, previewImport, undoImport } from './run'
import { isImportKind, type ImportPreview } from './types'
import { sheetOf, uploadSchema } from './upload'

/** Settings → Import (self-serve, console spec 9): each importer checks its own product and permission. */

function allowed(ctx: Ctx, importer: AnyImporter): string | null {
  if (importer.product && !ctx.has(importer.product)) return `${importer.label} needs a product that is not on in this workspace.`
  if (!ctx.can(importer.perm)) return `You don't have permission to import ${importer.label.toLowerCase()}.`
  return null
}

const refresh = () => revalidatePath('/app/settings/import', 'layout')

export const previewImportAction = action(uploadSchema, async (input, ctx) => {
  const importer = IMPORTERS[input.kind]
  const refusal = allowed(ctx, importer)
  if (refusal) return fail(refusal)
  const preview: ImportPreview = await previewImport(importer, await sheetOf(input.file), ctx)
  return ok(preview.summary, preview)
})

export const confirmImportAction = action(uploadSchema, async (input, ctx) => {
  const importer = IMPORTERS[input.kind]
  const refusal = allowed(ctx, importer)
  if (refusal) return fail(refusal)
  const result = await confirmImport(importer, await sheetOf(input.file), ctx, { source: 'self', userId: ctx.userId, name: ctx.user.name }, input.file.name)
  refresh()
  return ok(`${result.imported} ${importer.label.toLowerCase()} imported${result.skipped ? `; ${result.skipped} rows were left out` : ''}. You can undo this for 7 days.`, undefined, '/app/settings/import')
})

/** Undo needs the same right as importing that kind (read from the stored batch, never from the request). */
export const undoImportAction = action(z.object({ batchId: objectId }), async (input, ctx) => {
  const batch = await ctx.db(ImportBatch).findById(input.batchId, { kind: 1 }).lean()
  if (!batch || !isImportKind(batch.kind)) throw new NotFoundError('That import')
  const refusal = allowed(ctx, IMPORTERS[batch.kind])
  if (refusal) return fail(refusal)
  const result = await undoImport(ctx, input.batchId, ctx.user.name)
  refresh()
  return ok(`Import of ${result.label.toLowerCase()} undone: ${result.deleted} records removed.`)
})
