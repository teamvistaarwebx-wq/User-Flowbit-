import 'server-only'
import type { Types } from 'mongoose'
import { storage } from '@/lib/storage'
import { Org } from '@/models/Org'
import { StoredFile } from '@/models/StoredFile'
import type { ExportFile, ExportRow, ExportSource } from './export'
import { workspaceProjection } from './export-fields'

/** Rows fetched from MongoDB per round trip; only this many are in memory beyond the export part being built. */
const CURSOR_BATCH = 500

/**
 * Reads one workspace for the export. Every query is filtered by its orgId,
 * and rows and files come through cursors (V2-REVIEW T3), never as one array.
 */
export function mongoExportSource(orgId: Types.ObjectId): ExportSource {
  return {
    workspace: async () => ((await Org.findById(orgId, workspaceProjection()).lean()) ?? {}) as ExportRow,
    rows: (c) => {
      const projection = Object.fromEntries((c.exportOmit ?? []).map((field) => [field, 0]))
      return c.model.find({ orgId }, projection).sort({ _id: 1 }).lean().cursor({ batchSize: CURSOR_BATCH }) as AsyncIterable<ExportRow>
    },
    files: async function* (maxBytes: number): AsyncGenerator<ExportFile | { skipped: number }> {
      const files = StoredFile.find({ orgId }, { name: 1, path: 1, size: 1 }).sort({ _id: 1 }).lean().cursor({ batchSize: CURSOR_BATCH })
      let total = 0
      let skipped = 0
      for await (const file of files) {
        if (total + (file.size ?? 0) > maxBytes) {
          skipped += 1
          continue
        }
        const data = await storage().get(file.path)
        if (!data) continue
        total += data.length
        yield { id: String(file._id), name: file.name, data }
      }
      yield { skipped }
    },
  }
}
