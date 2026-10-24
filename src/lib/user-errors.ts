/** Shown when a save fails for a reason the user cannot act on (a dropped connection, a framework error). */
export const SAVE_FAILED = 'Could not save. Check your connection and try again.'

const JSON_TYPE = /\bapplication\/(?:[\w.+-]+\+)?json\b/i

/** True when the response says its body is JSON (an HTML error page from a proxy is not). */
export const isJsonResponse = (res: Pick<Response, 'headers'>) => JSON_TYPE.test(res.headers.get('content-type') ?? '')

/**
 * Reads a JSON body only when the server sent JSON. A 502 page, an empty body
 * or broken JSON gives `null`, never a "Unexpected token '<'" error.
 */
export async function readJsonBody<T>(res: Response): Promise<T | null> {
  if (!isJsonResponse(res)) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Text for an error thrown by a server action or fetch. Thrown errors are
 * transport or framework failures, so their own text is never shown.
 */
export function thrownErrorMessage(error: unknown, fallback = SAVE_FAILED): string {
  console.error('[ui] action failed', error)
  return fallback
}
