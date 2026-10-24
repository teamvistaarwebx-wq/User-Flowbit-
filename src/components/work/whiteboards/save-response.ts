import { readJsonBody } from '@/lib/user-errors'

export type StoredRef = { fileId: string; mimeType: string }

export const BOARD_TOO_LARGE = 'This board is too large to save. Remove some images.'
export const BOARD_SAVE_FAILED = 'Could not save the board.'
export const BOARD_OFFLINE = 'Could not save the board. Check your connection.'
export const BOARD_CONFLICT = 'This board changed elsewhere. Reload to see the latest.'

const HTTP_CONFLICT = 409
const HTTP_TOO_LARGE = 413

export type BoardSaveOutcome =
  | { kind: 'saved'; version: number; files?: Record<string, StoredRef> }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

type SaveBody = { version?: unknown; files?: Record<string, StoredRef>; error?: unknown }

const serverMessage = (body: SaveBody | null, fallback: string) => (typeof body?.error === 'string' && body.error.trim() ? body.error : fallback)

/** Turns the whiteboard PUT response into an outcome; non-JSON bodies (a 502 page) never surface as parse errors. */
export async function readBoardSave(res: Response): Promise<BoardSaveOutcome> {
  if (res.status === HTTP_TOO_LARGE) return { kind: 'error', message: BOARD_TOO_LARGE }
  const body = await readJsonBody<SaveBody>(res)
  if (res.status === HTTP_CONFLICT) return { kind: 'conflict', message: serverMessage(body, BOARD_CONFLICT) }
  if (res.ok && typeof body?.version === 'number') return { kind: 'saved', version: body.version, files: body.files }
  return { kind: 'error', message: serverMessage(body, BOARD_SAVE_FAILED) }
}

/** An error whose message is written for the user. */
export class BoardSaveError extends Error {}

/** Toast text for anything thrown during a save: our own messages pass through, the rest (a failed fetch) become the offline copy. */
export function boardSaveErrorMessage(error: unknown): string {
  if (error instanceof BoardSaveError) return error.message
  console.error('[whiteboard] save failed', error)
  return BOARD_OFFLINE
}
