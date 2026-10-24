import { fetchWithTimeout, withTimeout } from '@/lib/fetch-timeout'
import { verifyResendWebhook } from '@/modules/messaging/signatures'
import { ProviderError, type Fetch, type TranscriptSegment } from './transcription'

/**
 * The meeting bot (Recall.ai), behind MeetingBotProvider. "Send notetaker"
 * schedules "Flowbit Notetaker" for the meeting link; it announces itself in
 * the meeting chat when it joins. Recall posts status webhooks (Svix-signed:
 * webhook-* or svix-* headers); when the bot is done we read its recording
 * (mixed audio) or transcript from Retrieve Bot and continue the same
 * pipeline as an upload. Auth: `Authorization: Token <key>`, region-local hosts.
 */

export const BOT_NAME = 'Flowbit Notetaker'
export const BOT_ANNOUNCEMENT = 'Hi, I am Flowbit Notetaker. I am recording and transcribing this meeting for its minutes. Ask the organiser to remove me if you do not agree.'
export const RECALL_REGIONS = ['us-west-2', 'us-east-1', 'eu-central-1', 'ap-northeast-1'] as const

export type ScheduleInput = Readonly<{ meetingUrl: string; joinAt: Date | null; metadata: Readonly<Record<string, string>> }>
export type BotArtifacts = Readonly<{ status: 'pending' | 'done' | 'failed'; audioUrl: string | null; transcript: TranscriptSegment[] | null; error?: string }>

export interface MeetingBotProvider {
  readonly name: string
  schedule(input: ScheduleInput): Promise<{ botId: string }>
  cancel(botId: string): Promise<void>
  artifacts(botId: string): Promise<BotArtifacts>
}

export const recallBase = (region: string) => `https://${(RECALL_REGIONS as readonly string[]).includes(region) ? region : 'us-west-2'}.recall.ai/api/v1`

/** Scheduled bots need ten minutes' notice; sooner means "join now". */
const SCHEDULE_LEAD_MS = 10 * 60_000

export function botRequestBody(input: ScheduleInput, now: Date = new Date()) {
  const scheduled = input.joinAt && input.joinAt.getTime() - now.getTime() >= SCHEDULE_LEAD_MS
  return {
    meeting_url: input.meetingUrl,
    bot_name: BOT_NAME,
    ...(scheduled ? { join_at: input.joinAt!.toISOString() } : {}),
    chat: { on_bot_join: { send_to: 'everyone', message: BOT_ANNOUNCEMENT } },
    recording_config: { audio_mixed_mp3: {} },
    automatic_leave: { waiting_room_timeout: 600, noone_joined_timeout: 600 },
    metadata: input.metadata,
  }
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})

/** Recall's transcript JSON (participants with words) → segments, one per participant turn. */
export function parseRecallTranscript(data: unknown): TranscriptSegment[] {
  if (!Array.isArray(data)) return []
  return data
    .map((turn) => {
      const t = obj(turn)
      const words = (Array.isArray(t.words) ? t.words : []).map(obj)
      const time = (w: Json | undefined, key: 'start_timestamp' | 'end_timestamp') => Number(obj(w?.[key]).relative ?? 0)
      return { speaker: String(obj(t.participant).name ?? obj(t.participant).id ?? ''), start: time(words[0], 'start_timestamp'), end: time(words[words.length - 1], 'end_timestamp'), text: words.map((w) => String(w.text ?? '')).join(' ').replace(/\s+/g, ' ').trim() }
    })
    .filter((s) => s.text)
}

/** Reads Retrieve Bot: done when a recording is done; the mixed audio URL and, when present, a transcript URL. */
export function artifactsFromBot(bot: unknown): { status: BotArtifacts['status']; audioUrl: string | null; transcriptUrl: string | null } {
  const b = obj(bot)
  const changes = (Array.isArray(b.status_changes) ? b.status_changes : []).map(obj)
  const last = String(changes[changes.length - 1]?.code ?? '')
  const recording = (Array.isArray(b.recordings) ? b.recordings : []).map(obj)[0]
  const shortcuts = obj(recording?.media_shortcuts)
  const audio = obj(obj(shortcuts.audio_mixed).data).download_url ?? obj(obj(shortcuts.video_mixed).data).download_url
  const transcript = obj(obj(shortcuts.transcript).data).download_url
  const failed = last === 'fatal'
  const done = last === 'done' || String(obj(recording?.status).code ?? '') === 'done'
  return { status: failed ? 'failed' : done ? 'done' : 'pending', audioUrl: typeof audio === 'string' ? audio : null, transcriptUrl: typeof transcript === 'string' ? transcript : null }
}

/** Recall's transcript JSON can be a few MB for a long meeting. */
const TRANSCRIPT_DOWNLOAD_TIMEOUT_MS = 30_000

export function recallProvider(apiKey: string, region: string, fetchImpl: Fetch = fetch): MeetingBotProvider {
  const base = recallBase(region)
  const headers = { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }
  const timed = withTimeout(fetchImpl)
  const call = async (path: string, init: RequestInit): Promise<Json> => {
    const res = await timed(`${base}${path}`, { ...init, headers })
    const text = await res.text()
    if (!res.ok) throw new ProviderError(`Recall ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text.slice(0, 200)}`)
    return text ? (JSON.parse(text) as Json) : {}
  }
  return {
    name: 'recall',
    async schedule(input) {
      const bot = await call('/bot/', { method: 'POST', body: JSON.stringify(botRequestBody(input)) })
      if (typeof bot.id !== 'string') throw new ProviderError('Recall did not return a bot id.')
      return { botId: bot.id }
    },
    async cancel(botId) {
      await call(`/bot/${encodeURIComponent(botId)}/`, { method: 'DELETE' })
    },
    async artifacts(botId) {
      const found = artifactsFromBot(await call(`/bot/${encodeURIComponent(botId)}/`, { method: 'GET' }))
      if (found.status !== 'done') return { status: found.status, audioUrl: null, transcript: null, ...(found.status === 'failed' ? { error: 'The notetaker could not record this meeting.' } : {}) }
      let transcript: TranscriptSegment[] | null = null
      if (found.transcriptUrl) {
        const res = await fetchWithTimeout(found.transcriptUrl, { method: 'GET' }, TRANSCRIPT_DOWNLOAD_TIMEOUT_MS, fetchImpl)
        if (res.ok) transcript = parseRecallTranscript(await res.json())
      }
      return { status: 'done', audioUrl: found.audioUrl, transcript: transcript?.length ? transcript : null }
    },
  }
}

export type RecallEvent = Readonly<{ event: string; botId: string | null; orgId: string | null; meetingId: string | null }>

/** Verifies the Svix signature (webhook-* or svix-* headers) and reads the event; null when it is not from Recall. */
export function readRecallWebhook(raw: string, header: (name: string) => string | null, secret: string, now: Date = new Date()): RecallEvent | null {
  const pick = (name: string) => header(`webhook-${name}`) ?? header(`svix-${name}`)
  if (!verifyResendWebhook(raw, { id: pick('id'), timestamp: pick('timestamp'), signature: pick('signature') }, secret, now)) return null
  let body: Json
  try {
    body = obj(JSON.parse(raw))
  } catch {
    return null
  }
  const data = obj(body.data)
  const bot = obj(data.bot)
  const metadata = obj(bot.metadata)
  return {
    event: String(body.event ?? ''),
    botId: typeof bot.id === 'string' ? bot.id : null,
    orgId: typeof metadata.orgId === 'string' ? metadata.orgId : null,
    meetingId: typeof metadata.meetingId === 'string' ? metadata.meetingId : null,
  }
}

/** Events after which the recording can be fetched. */
export const RECALL_DONE_EVENTS: readonly string[] = ['bot.done', 'recording.done', 'transcript.done']
export const RECALL_FAILED_EVENTS: readonly string[] = ['bot.fatal', 'recording.failed']
