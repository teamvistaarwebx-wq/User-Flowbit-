import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Types } from 'mongoose'
import { WORKSPACE_THEME_FIELDS, workspacePrimary } from '@/lib/brand-theme'
import { dbConnect } from '@/lib/db'
import { appUrl } from '@/lib/env'
import type { EmailBrand } from '@/lib/mail'
import { Org } from '@/models/Org'

/**
 * A workspace's brand on the email it sends its own clients (invoices,
 * quotes, statements, reminders, automated messages): its name, primary
 * colour and logo. Mail clients block data URIs, so the logo is served from a
 * public URL keyed by a random value (no ids in it).
 */

const KEY = /^[A-Za-z0-9_-]{24}$/

/** The logo URL; `?v=<file id>` changes when the logo is replaced, so mail proxies holding the old one fetch the new one. */
export const brandLogoUrl = (brandKey: string, logoFileId?: unknown): string => {
  const base = appUrl(`/api/public/brand/${brandKey}/logo`)
  return logoFileId ? `${base}?v=${encodeURIComponent(String(logoFileId))}` : base
}

/** Never throws: on any problem the email simply goes with Flowbit's own look. */
export async function emailBrandFor(orgId: Types.ObjectId | string): Promise<EmailBrand | null> {
  try {
    await dbConnect()
    const org = await Org.findById(orgId, { ...WORKSPACE_THEME_FIELDS, name: 1, logoFileId: 1, brandKey: 1 }).lean()
    if (!org) return null
    let key = org.brandKey ?? null
    if (org.logoFileId && !key) {
      key = randomBytes(18).toString('base64url')
      await Org.updateOne({ _id: org._id, brandKey: { $exists: false } }, { $set: { brandKey: key } })
      key = (await Org.findById(org._id, { brandKey: 1 }).lean())?.brandKey ?? key
    }
    return { name: org.name, color: workspacePrimary(org), logoUrl: org.logoFileId && key ? brandLogoUrl(key, org.logoFileId) : null }
  } catch (error) {
    console.error('[email-brand] could not load the workspace brand', String(orgId), error)
    return null
  }
}

/** The workspace behind a logo URL key, or null. */
export async function orgByBrandKey(key: string) {
  if (!KEY.test(key)) return null
  await dbConnect()
  return Org.findOne({ brandKey: key, deletedAt: null }, { logoFileId: 1 }).lean()
}
