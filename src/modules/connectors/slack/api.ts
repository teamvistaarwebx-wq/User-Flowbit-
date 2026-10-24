/**
 * A minimal Slack Web API client (fetch, injectable for tests). Errors come
 * back as { ok: false, error } like Slack's own responses; nothing throws.
 */

export type SlackResponse = Record<string, unknown> & { ok: boolean; error?: string }
export type Fetch = (input: string, init: RequestInit) => Promise<Response>

const BASE = 'https://slack.com/api/'

export async function slackApi(method: string, token: string | null, body: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<SlackResponse> {
  try {
    const form = !token
    const res = await fetchImpl(`${BASE}${method}`, {
      method: 'POST',
      headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: form ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString() : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const json = (await res.json()) as SlackResponse
    return json && typeof json.ok === 'boolean' ? json : { ok: false, error: 'bad_response' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 120) : 'network_error' }
  }
}

/** Posts to a response_url (slash commands, shortcuts): ephemeral by default. */
export async function respond(responseUrl: string, message: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) return
  await fetchImpl(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response_type: 'ephemeral', ...message }), signal: AbortSignal.timeout(8000) }).catch(() => undefined)
}
