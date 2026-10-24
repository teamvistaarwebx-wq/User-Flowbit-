'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { maskPreviewRow } from '@/lib/console/mask'
import { consoleAction, type StaffCtx } from '@/lib/console/session'
import { internalLocked, staffImportRefusal } from '@/lib/console/support-access'
import { NotFoundError } from '@/lib/errors'
import { objectId } from '@/lib/validation'
import { Org } from '@/models/Org'
import { SupportAccess } from '@/models/console/SupportAccess'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { importProductRefusal } from '@/modules/imports/product-gate'
import { IMPORTERS } from '@/modules/imports/registry'
import { confirmImport, previewImport, undoImport } from '@/modules/imports/run'
import { staffWorkspaceCtx } from '@/modules/imports/staff-ctx'
import type { ImportPreview } from '@/modules/imports/types'
import { sheetOf, uploadSchema } from '@/modules/imports/upload'

/**
 * Staff-run imports from the Console (console spec 9). Each call re-checks the
 * consent gate on the server: the owner accepted the DPA and an import grant
 * is approved and running. The batch is labelled "Imported by the Flowbit team".
 */

async function gate(p: StaffCtx, orgId: string) {
  const org = await p.raw(Org).findById(orgId, { name: 1, dpa: 1, deletedAt: 1, 'subscription.accountType': 1 }).lean()
  if (!org || org.deletedAt || internalLocked(org.subscription?.accountType, p.staff.isFounder)) throw new NotFoundError('That workspace')
  const grants = await p.forOrg(org._id).db(SupportAccess).find({ mode: 'import', staffId: p.staff.id }, { mode: 1, status: 1, hours: 1, approvedAt: 1, expiresAt: 1 }).lean()
  return { org, refusal: staffImportRefusal({ dpa: org.dpa, grants }) }
}

const staffUpload = uploadSchema.extend({ orgId: objectId })

export const staffPreviewImport = consoleAction('import.run', staffUpload, async (input, p) => {
  const { org, refusal } = await gate(p, input.orgId)
  if (refusal) return fail(refusal)
  const ctx = await staffWorkspaceCtx(org._id, p.staff.name)
  const off = importProductRefusal(ctx.has, IMPORTERS[input.kind])
  if (off) return fail(off)
  const checked: ImportPreview = await previewImport(IMPORTERS[input.kind], await sheetOf(input.file), ctx)
  // Staff never see salary, bank or PAN values, even in check messages (D3).
  const preview: ImportPreview = { ...checked, rows: checked.rows.map(maskPreviewRow) }
  await p.audit({ action: 'console.import_previewed', summary: `Checked a ${IMPORTERS[input.kind].label.toLowerCase()} file for ${org.name}`, meta: { orgId: input.orgId, rows: preview.total } })
  return ok(preview.summary, preview)
})

export const staffConfirmImport = consoleAction('import.run', staffUpload, async (input, p) => {
  const { org, refusal } = await gate(p, input.orgId)
  if (refusal) return fail(refusal)
  const importer = IMPORTERS[input.kind]
  const ctx = await staffWorkspaceCtx(org._id, p.staff.name)
  const off = importProductRefusal(ctx.has, importer)
  if (off) return fail(off)
  const result = await confirmImport(importer, await sheetOf(input.file), ctx, { source: 'staff', staffId: p.staff.id, name: p.staff.name }, input.file.name)
  await p.audit({ action: 'console.import_run', summary: `Imported ${result.imported} ${importer.label.toLowerCase()} into ${org.name}`, meta: { orgId: input.orgId, batchId: String(result.batchId), skipped: result.skipped } })
  revalidatePath(`/console/accounts/${input.orgId}`)
  return ok(`${result.imported} ${importer.label.toLowerCase()} imported into ${org.name}${result.skipped ? `; ${result.skipped} rows were left out` : ''}.`)
})

export const staffUndoImport = consoleAction('import.run', z.object({ orgId: objectId, batchId: objectId }), async (input, p) => {
  const { org, refusal } = await gate(p, input.orgId)
  if (refusal) return fail(refusal)
  // Staff undo only the Flowbit team's own batches; the workspace undoes its own in Settings → Import.
  const batch = await p.forOrg(org._id).db(ImportBatch).findById(input.batchId, { source: 1 }).lean()
  if (!batch || batch.source !== 'staff') throw new NotFoundError('That import')
  const ctx = await staffWorkspaceCtx(org._id, p.staff.name)
  const result = await undoImport(ctx, input.batchId, `Flowbit team (${p.staff.name})`)
  await p.audit({ action: 'console.import_undone', summary: `Undid an import of ${result.label.toLowerCase()} in ${org.name}`, meta: { orgId: input.orgId, batchId: input.batchId } })
  revalidatePath(`/console/accounts/${input.orgId}`)
  return ok(`Import undone: ${result.deleted} records removed.`)
})
