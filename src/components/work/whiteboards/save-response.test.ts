import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOARD_CONFLICT, BOARD_OFFLINE, BOARD_SAVE_FAILED, BOARD_TOO_LARGE, BoardSaveError, boardSaveErrorMessage, readBoardSave } from './save-response'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

describe('readBoardSave', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the new version and files on success', async () => {
    // Arrange
    const res = json({ version: 4, files: { a: { fileId: 'a', mimeType: 'image/png' } } })
    // Act
    const outcome = await readBoardSave(res)
    // Assert
    expect(outcome).toEqual({ kind: 'saved', version: 4, files: { a: { fileId: 'a', mimeType: 'image/png' } } })
  })

  it('does not parse an HTML 502 page and returns the generic message', async () => {
    const res = new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })
    const outcome = await readBoardSave(res)
    expect(outcome).toEqual({ kind: 'error', message: BOARD_SAVE_FAILED })
  })

  it('treats broken JSON as a failed save, not a parse error', async () => {
    const res = new Response('{"version":', { status: 200, headers: { 'content-type': 'application/json' } })
    expect(await readBoardSave(res)).toEqual({ kind: 'error', message: BOARD_SAVE_FAILED })
  })

  it('maps 413 to the too-large message without reading the body', async () => {
    const res = new Response('<html>Payload too large</html>', { status: 413 })
    expect(await readBoardSave(res)).toEqual({ kind: 'error', message: BOARD_TOO_LARGE })
  })

  it('returns a conflict with the server message, or the default one', async () => {
    expect(await readBoardSave(json({ error: 'Someone else saved.' }, 409))).toEqual({ kind: 'conflict', message: 'Someone else saved.' })
    expect(await readBoardSave(new Response('', { status: 409 }))).toEqual({ kind: 'conflict', message: BOARD_CONFLICT })
  })

  it('uses the server error text for a JSON refusal', async () => {
    expect(await readBoardSave(json({ error: 'You can only view this board.' }, 403))).toEqual({ kind: 'error', message: 'You can only view this board.' })
  })
})

describe('boardSaveErrorMessage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes our own messages through', () => {
    expect(boardSaveErrorMessage(new BoardSaveError(BOARD_TOO_LARGE))).toBe(BOARD_TOO_LARGE)
  })

  it('maps a failed fetch to the connection message and logs it', () => {
    // Arrange
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // Act
    const message = boardSaveErrorMessage(new TypeError('Failed to fetch'))
    // Assert
    expect(message).toBe(BOARD_OFFLINE)
    expect(log).toHaveBeenCalled()
  })
})
