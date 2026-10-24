'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { canManageSignatories, companyProfileOf, SEAL_KIND, SIGNATURE_KIND } from '@/lib/company-profile'
import { companyProfileSchema, signatorySchema } from '@/lib/company-profile-schema'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { deleteStoredFile, saveFile } from '@/lib/files'
import { PDF_IMAGE_TYPES, sniffPdfImage } from '@/lib/image-bytes'
import { checkbox } from '@/lib/validation'
import { Org } from '@/models/Org'

const PAGE = '/app/settings/company'
const OPTS = { perm: 'org.manage' } as const
const IMAGE_MAX_BYTES = 1024 * 1024
const SIGNATORY_REFUSAL = 'Only owners and admins can add or change authorised signatories.'

const done = (message: string) => {
  revalidatePath('/app', 'layout')
  return ok(message)
}

/** Saves a PNG or JPEG checked by its bytes (the browser converts SVG and WebP to PNG before upload); null when none was picked. */
async function saveImage(ctx: Ctx, file: File | null | undefined, kind: string, label: string): Promise<Types.ObjectId | null> {
  if (!file || file.size === 0) return null
  const field = kind === 'logo' ? 'logo' : kind === SEAL_KIND ? 'seal' : 'signature'
  if (file.size > IMAGE_MAX_BYTES) throw new UserError(`${label} must be 1 MB or smaller.`, { [field]: 'Use an image up to 1 MB' })
  const data = Buffer.from(await file.arrayBuffer())
  const mime = sniffPdfImage(data)
  if (!mime || !PDF_IMAGE_TYPES.includes(mime)) throw new UserError(`${label} must be a PNG or JPEG image.`, { [field]: 'PNG or JPEG only' })
  const stored = await saveFile(ctx, { name: file.name, mime, data, kind, entity: 'Org', entityId: ctx.orgId })
  return stored._id
}

/** Legal name, GST registration, PAN, CIN/LLPIN, contact details and the address every PDF prints. */
export const saveCompanyProfile = action(
  companyProfileSchema,
  async (input, ctx) => {
    const registered = input.gstRegistered === 'yes'
    const profile = {
      ...(ctx.org.profile ? { signPayslips: Boolean(ctx.org.profile.signPayslips) } : {}),
      legalName: input.legalName,
      tradeName: input.tradeName,
      gstRegistered: registered,
      pan: input.pan,
      cinLlpin: input.cinLlpin,
      website: input.website,
      email: input.email,
      phone: input.phone,
    }
    const address = { line1: input.line1, line2: input.line2, city: input.city, state: input.state, pincode: input.pincode, country: 'India' }
    const was = companyProfileOf(ctx.org)
    const before = { legalName: was.legalName, tradeName: was.tradeName, gstRegistered: was.gstRegistered, gstin: was.gstin, pan: was.pan, cinLlpin: was.cinLlpin, website: was.website, email: was.email, phone: was.phone, address: was.address }
    await Org.updateOne(
      { _id: ctx.orgId },
      { $set: { profile, address, state: input.state, ...(registered && input.gstin ? { gstin: input.gstin } : {}) }, ...(registered ? {} : { $unset: { gstin: 1 } }) },
    )
    const after = { legalName: input.legalName, tradeName: input.tradeName ?? null, gstRegistered: registered, gstin: registered ? (input.gstin ?? null) : null, pan: input.pan ?? null, cinLlpin: input.cinLlpin ?? null, website: input.website ?? null, email: input.email ?? null, phone: input.phone ?? null, address: { ...address, line2: address.line2 ?? null } }
    await audit(ctx, { action: 'org.profile_saved', entity: 'Org', entityId: ctx.orgId, summary: `Company profile saved for ${input.legalName}`, changes: { before, after } })
    return done('Company profile saved. New PDFs print these details.')
  },
  OPTS,
)

/** The company logo: a PNG or JPEG (the browser turns SVG and WebP into a resized PNG first). */
export const uploadCompanyLogo = action(
  z.object({ logo: z.instanceof(File, { error: 'Choose an image' }) }),
  async ({ logo }, ctx) => {
    const fileId = await saveImage(ctx, logo, 'logo', 'The logo')
    if (!fileId) return fail('Choose an image first.', { logo: 'Choose an image' })
    const previous = ctx.org.logoFileId
    await Org.updateOne({ _id: ctx.orgId }, { $set: { logoFileId: fileId } })
    if (previous) await deleteStoredFile(ctx.orgId, String(previous))
    await audit(ctx, { action: 'org.updated', entity: 'Org', entityId: ctx.orgId, summary: 'Company logo updated' })
    return done('Logo updated.')
  },
  OPTS,
)

export const removeCompanyLogo = action(
  z.object({}),
  async (_input, ctx) => {
    const previous = ctx.org.logoFileId
    if (!previous) return fail('There is no logo to remove.')
    await Org.updateOne({ _id: ctx.orgId }, { $unset: { logoFileId: 1 } })
    await deleteStoredFile(ctx.orgId, String(previous))
    await audit(ctx, { action: 'org.updated', entity: 'Org', entityId: ctx.orgId, summary: 'Company logo removed' })
    return done('Logo removed.')
  },
  OPTS,
)

type StoredSignatory = { _id: Types.ObjectId; name: string; designation: string; signatureFileId?: Types.ObjectId | null; sealFileId?: Types.ObjectId | null; isDefault?: boolean | null }

const storedSignatories = (ctx: Ctx): StoredSignatory[] => (ctx.org.signatories ?? []).map((s) => ({ _id: s._id, name: s.name, designation: s.designation, signatureFileId: s.signatureFileId ?? null, sealFileId: s.sealFileId ?? null, isDefault: Boolean(s.isDefault) }))

/** One default at most: `defaultId` when given, else whoever already was. */
const withDefault = (list: StoredSignatory[], defaultId: string | null): StoredSignatory[] => (defaultId ? list.map((s) => ({ ...s, isDefault: String(s._id) === defaultId })) : list)

const signatoryForm = signatorySchema.extend({
  signature: z.instanceof(File).optional(),
  seal: z.instanceof(File).optional(),
})

/**
 * Adds or edits an authorised signatory. A replaced signature or seal file is kept (issued HR letters
 * reprint with the image they were issued with); it stays private either way.
 */
export const saveSignatory = action(
  signatoryForm,
  async (input, ctx) => {
    if (!canManageSignatories(ctx)) return fail(SIGNATORY_REFUSAL)
    const list = storedSignatories(ctx)
    const existing = input.id ? list.find((s) => String(s._id) === input.id) : null
    if (input.id && !existing) return fail('That signatory was removed meanwhile. The page has been refreshed.')
    const signatureFileId = await saveImage(ctx, input.signature, SIGNATURE_KIND, 'The signature')
    if (!existing && !signatureFileId) return fail('Add the signature image.', { signature: 'Add a signature image' })
    const sealFileId = await saveImage(ctx, input.seal, SEAL_KIND, 'The seal')
    const id = existing?._id ?? new Types.ObjectId()
    const next: StoredSignatory = {
      _id: id,
      name: input.name,
      designation: input.designation,
      signatureFileId: signatureFileId ?? existing?.signatureFileId ?? null,
      sealFileId: sealFileId ?? (input.removeSeal ? null : (existing?.sealFileId ?? null)),
      isDefault: input.isDefault || list.length === 0 || Boolean(existing?.isDefault),
    }
    const merged = existing ? list.map((s) => (String(s._id) === String(id) ? next : s)) : [...list, next]
    await Org.updateOne({ _id: ctx.orgId }, { $set: { signatories: withDefault(merged, next.isDefault ? String(id) : null) } })
    const changes = [signatureFileId ? 'new signature' : null, sealFileId ? 'new seal' : input.removeSeal && existing?.sealFileId ? 'seal removed' : null, next.isDefault ? 'default' : null].filter(Boolean)
    await audit(ctx, {
      action: existing ? 'org.signatory_updated' : 'org.signatory_added',
      entity: 'Org',
      entityId: ctx.orgId,
      summary: `${existing ? 'Authorised signatory updated' : 'Authorised signatory added'}: ${input.name}, ${input.designation}${changes.length ? ` (${changes.join(', ')})` : ''}`,
      meta: { signatoryId: String(id), before: existing ? { name: existing.name, designation: existing.designation } : null },
    })
    return done(`${input.name} ${existing ? 'saved' : 'added as an authorised signatory'}.`)
  },
  OPTS,
)

export const setDefaultSignatory = action(
  z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }),
  async ({ id }, ctx) => {
    if (!canManageSignatories(ctx)) return fail(SIGNATORY_REFUSAL)
    const list = storedSignatories(ctx)
    const chosen = list.find((s) => String(s._id) === id)
    if (!chosen) return fail('That signatory was removed meanwhile. The page has been refreshed.')
    await Org.updateOne({ _id: ctx.orgId }, { $set: { signatories: withDefault(list, id) } })
    await audit(ctx, { action: 'org.signatory_default', entity: 'Org', entityId: ctx.orgId, summary: `${chosen.name} is now the default authorised signatory`, meta: { signatoryId: id } })
    return done(`${chosen.name} now signs documents by default.`)
  },
  OPTS,
)

export const removeSignatory = action(
  z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }),
  async ({ id }, ctx) => {
    if (!canManageSignatories(ctx)) return fail(SIGNATORY_REFUSAL)
    const list = storedSignatories(ctx)
    const gone = list.find((s) => String(s._id) === id)
    if (!gone) return fail('That signatory was already removed.')
    const rest = list.filter((s) => String(s._id) !== id)
    // The first remaining signatory takes over as default (lib/company-profile reads it that way too).
    const next = gone.isDefault && rest.length ? withDefault(rest, String(rest[0]._id)) : rest
    await Org.updateOne({ _id: ctx.orgId }, { $set: { signatories: next } })
    await audit(ctx, { action: 'org.signatory_removed', entity: 'Org', entityId: ctx.orgId, summary: `Authorised signatory removed: ${gone.name}, ${gone.designation}`, meta: { signatoryId: id } })
    return done(`${gone.name} removed. Letters already issued keep their signature.`)
  },
  OPTS,
)

/** Payslips print the default signatory's signature instead of the computer-generated line. */
export const savePayslipSignature = action(
  z.object({ signPayslips: checkbox }),
  async ({ signPayslips }, ctx) => {
    if (!canManageSignatories(ctx)) return fail(SIGNATORY_REFUSAL)
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'profile.signPayslips': signPayslips } })
    await audit(ctx, { action: 'org.signatory_payslips', entity: 'Org', entityId: ctx.orgId, summary: signPayslips ? 'Payslips now carry the default signature' : 'Payslips are computer-generated without a signature' })
    revalidatePath(PAGE)
    return ok(signPayslips ? 'Payslips will carry the default signatory’s signature.' : 'Payslips stay computer-generated, with no signature.')
  },
  OPTS,
)
