import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAVE_FAILED, isJsonResponse, readJsonBody, thrownErrorMessage } from './user-errors'

describe('isJsonResponse', () => {
  it('accepts application/json and +json types', () => {
    expect(isJsonResponse(new Response('{}', { headers: { 'content-type': 'application/json; charset=utf-8' } }))).toBe(true)
    expect(isJsonResponse(new Response('{}', { headers: { 'content-type': 'application/problem+json' } }))).toBe(true)
  })

  it('rejects HTML and missing content types', () => {
    expect(isJsonResponse(new Response('<html>', { headers: { 'content-type': 'text/html' } }))).toBe(false)
    expect(isJsonResponse(new Response(null))).toBe(false)
  })
})

describe('readJsonBody', () => {
  it('returns null for an HTML error page', async () => {
    expect(await readJsonBody(new Response('<html>', { status: 502, headers: { 'content-type': 'text/html' } }))).toBeNull()
  })

  it('parses a JSON body', async () => {
    expect(await readJsonBody(new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }))).toEqual({ a: 1 })
  })
})

describe('thrownErrorMessage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('never shows the thrown text and logs the error', () => {
    // Arrange
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('An error occurred in the Server Components render.')
    // Act
    const message = thrownErrorMessage(error)
    // Assert
    expect(message).toBe(SAVE_FAILED)
    expect(log).toHaveBeenCalledWith('[ui] action failed', error)
  })
})
