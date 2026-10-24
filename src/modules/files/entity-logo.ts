import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { saveUpload } from '@/lib/files'
import { ENTITY_LOGO_TYPES, isEntityLogoType, LOGO_MAX_BYTES } from '@/lib/entity-logo'

/** Stores a project or client logo (JPEG/PNG, already resized in the browser) and answers the new file id. */
export async function saveEntityLogo(ctx: Ctx, file: File, opts: { kind: 'project_logo' | 'client_logo'; entity: string; entityId: unknown }) {
  if (!isEntityLogoType(file.type)) throw new UserError('Use a JPEG or PNG image.', { logo: 'JPEG or PNG only' })
  const stored = await saveUpload(ctx, file, { kind: opts.kind, entity: opts.entity, entityId: opts.entityId, accept: [...ENTITY_LOGO_TYPES], maxBytes: LOGO_MAX_BYTES })
  if (!stored) throw new UserError('Choose an image first.', { logo: 'Choose an image' })
  return stored._id
}
