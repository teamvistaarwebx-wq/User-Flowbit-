import { NextResponse, type NextRequest } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { NotFoundError, UserError } from '@/lib/errors'
import { readBodyLimited } from '@/lib/read-body'
import { loadBoard } from '@/modules/work/whiteboards/access'
import { MAX_SCENE_BYTES, saveSchema } from '@/modules/work/whiteboards/scene'
import { saveScene } from '@/modules/work/whiteboards/save'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Latest saved scene and version: GET /api/work/whiteboards/<id> (the editor re-reads after a reload). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return json({ error: 'Your session has ended. Sign in again to continue.' }, 401)
  if (!ctx.has('work')) return json({ error: "You don't have access to Flowbit Work." }, 403)
  const { id } = await params
  if (!isValidObjectId(id)) return json({ error: 'That whiteboard was not found.' }, 404)
  try {
    const board = await loadBoard(ctx, id)
    const scene = board.scene ?? { elements: [], appState: {}, files: {} }
    return json({ version: board.version, scene: { elements: scene.elements ?? [], appState: scene.appState ?? {}, files: scene.files ?? {} } })
  } catch (error) {
    if (error instanceof NotFoundError) return json({ error: 'That whiteboard was not found.' }, 404)
    console.error('[whiteboards] read failed', { id, orgId: String(ctx.orgId) }, error)
    return json({ error: 'Could not load the board.' }, 500)
  }
}

/** Autosave: PUT /api/work/whiteboards/<id> with { version, elements, appState, files, thumbnail? }. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  if (!ctx) return json({ error: 'Your session has ended. Sign in again to continue.' }, 401)
  if (!ctx.has('work') || !ctx.can('whiteboards.write')) return json({ error: "You don't have permission to edit whiteboards." }, 403)
  if (ctx.readOnly) return json({ error: 'Your workspace is read-only. Choose a plan to keep editing.' }, 403)
  const { id } = await params
  if (!isValidObjectId(id)) return json({ error: 'That whiteboard was not found.' }, 404)
  const raw = await readBodyLimited(request, MAX_SCENE_BYTES)
  if (raw === null) return json({ error: 'This board is too large to save. Remove some images.' }, 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'The board could not be read. Reload and try again.' }, 400)
  }
  const parsed = saveSchema.safeParse(body)
  if (!parsed.success) return json({ error: 'The board could not be read. Reload and try again.' }, 400)
  try {
    const result = await saveScene(ctx, id, parsed.data)
    if ('conflict' in result) return json({ error: 'This board changed elsewhere. Reload to see the latest.' }, 409)
    return json(result)
  } catch (error) {
    if (error instanceof UserError) return json({ error: error.message }, 400)
    console.error('[whiteboards] save failed', { id, orgId: String(ctx.orgId) }, error)
    return json({ error: 'Could not save the board. Check your connection and try again.' }, 500)
  }
}
