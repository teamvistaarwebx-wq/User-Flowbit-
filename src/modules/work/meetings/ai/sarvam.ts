import { fetchWithTimeout, MEDIA_TIMEOUT_MS, PROVIDER_TIMEOUT_MS } from '@/lib/fetch-timeout'
import { ProviderError, durationOf, type Fetch, type JobResult, type StartInput, type TranscriptSegment, type TranscriptionProvider } from './transcription'

/**
 * Sarvam batch speech-to-text (docs.sarvam.ai, Batch API): create a job with
 * diarization, upload the audio to its presigned URL, start, then read the
 * status and download the output JSON (`diarized_transcript.entries` with
 * speaker_id and start/end seconds). Mode `codemix` keeps Hinglish natural.
 * Auth: the `api-subscription-key` header.
 */

export const SARVAM_BASE = 'https://api.sarvam.ai'
export const SARVAM_MODEL = 'saaras:v4'
export const SARVAM_MODE = 'codemix'
export const SARVAM_LANGUAGE = 'hi-IN'

type Json = Record<string, unknown>
/** Output JSON of a long meeting can be a few MB. */
const TRANSCRIPT_DOWNLOAD_TIMEOUT_MS = 30_000

async function call(fetchImpl: Fetch, key: string, path: string, init: { method: 'GET' | 'POST'; body?: Json }): Promise<Json> {
  const res = await fetchWithTimeout(`${SARVAM_BASE}${path}`, {
    method: init.method,
    headers: { 'api-subscription-key': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }, PROVIDER_TIMEOUT_MS, fetchImpl)
  const text = await res.text()
  if (!res.ok) throw new ProviderError(`Sarvam ${path.split('/').slice(-1)[0]} failed (${res.status}): ${text.slice(0, 200)}`)
  try {
    return text ? (JSON.parse(text) as Json) : {}
  } catch {
    throw new ProviderError('Sarvam sent a reply that is not JSON.')
  }
}

/** `{ "<file>": { file_url } }` or `{ "<file>": "<url>" }` → the URL for that file. */
function urlFor(map: unknown, file: string): string | null {
  const entry = map && typeof map === 'object' ? (map as Record<string, unknown>)[file] : null
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && typeof (entry as Json).file_url === 'string') return (entry as Json).file_url as string
  return null
}

/** One output file → segments (diarized entries, else one segment of the plain transcript). */
export function parseSarvamOutput(output: unknown): { segments: TranscriptSegment[]; language: string | null } {
  const o = (output && typeof output === 'object' ? output : {}) as Json
  const entries = ((o.diarized_transcript as Json | undefined)?.entries ?? []) as Json[]
  const segments: TranscriptSegment[] = Array.isArray(entries)
    ? entries
        .map((e) => ({ speaker: String(e.speaker_id ?? ''), start: Number(e.start_time_seconds ?? 0), end: Number(e.end_time_seconds ?? 0), text: String(e.transcript ?? '').trim() }))
        .filter((s) => s.text)
    : []
  if (!segments.length && typeof o.transcript === 'string' && o.transcript.trim()) {
    const ends = ((o.timestamps as Json | undefined)?.end_time_seconds ?? []) as number[]
    segments.push({ speaker: '', start: 0, end: Array.isArray(ends) && ends.length ? Number(ends[ends.length - 1]) : 0, text: o.transcript.trim() })
  }
  return { segments, language: typeof o.language_code === 'string' ? o.language_code : null }
}

export function sarvamProvider(apiKey: string, fetchImpl: Fetch = fetch): TranscriptionProvider {
  return {
    name: 'sarvam',
    async start(input: StartInput) {
      const job = await call(fetchImpl, apiKey, '/speech-to-text/job/v1', {
        method: 'POST',
        body: {
          job_parameters: { model: SARVAM_MODEL, mode: SARVAM_MODE, language_code: SARVAM_LANGUAGE, with_diarization: true, ...(input.numSpeakers ? { num_speakers: Math.min(20, Math.max(1, input.numSpeakers)) } : {}) },
          ...(input.callbackUrl ? { callback: { url: input.callbackUrl, auth_token: input.callbackToken ?? '' } } : {}),
        },
      })
      const jobId = typeof job.job_id === 'string' ? job.job_id : ''
      if (!jobId) throw new ProviderError('Sarvam did not return a job id.')
      const uploads = await call(fetchImpl, apiKey, '/speech-to-text/job/v1/upload-files', { method: 'POST', body: { job_id: jobId, files: [input.fileName] } })
      const uploadUrl = urlFor(uploads.upload_urls, input.fileName)
      if (!uploadUrl) throw new ProviderError('Sarvam did not return an upload URL.')
      const put = await fetchWithTimeout(uploadUrl, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': input.mime || 'application/octet-stream' }, body: new Uint8Array(input.audio) }, MEDIA_TIMEOUT_MS, fetchImpl)
      if (!put.ok) throw new ProviderError(`Uploading the recording to Sarvam failed (${put.status}).`)
      await call(fetchImpl, apiKey, `/speech-to-text/job/v1/${encodeURIComponent(jobId)}/start`, { method: 'POST' })
      return { jobId }
    },
    async poll(jobId: string): Promise<JobResult> {
      const status = await call(fetchImpl, apiKey, `/speech-to-text/job/v1/${encodeURIComponent(jobId)}/status`, { method: 'GET' })
      const state = String(status.job_state ?? '')
      if (state === 'Failed') return { state: 'failed', error: String(status.error_message ?? 'Sarvam could not transcribe the recording.').slice(0, 300) }
      if (state !== 'Completed') return { state: 'running' }
      const details = (Array.isArray(status.job_details) ? status.job_details : []) as Json[]
      const files = details.flatMap((d) => (Array.isArray(d.outputs) ? (d.outputs as Json[]) : [])).map((o) => String(o.file_name ?? '')).filter(Boolean)
      if (!files.length) return { state: 'failed', error: 'Sarvam finished without an output file.' }
      const downloads = await call(fetchImpl, apiKey, '/speech-to-text/job/v1/download-files', { method: 'POST', body: { job_id: jobId, files } })
      const segments: TranscriptSegment[] = []
      let language: string | null = null
      let offset = 0
      for (const file of files) {
        const url = urlFor(downloads.download_urls, file)
        if (!url) continue
        const res = await fetchWithTimeout(url, { method: 'GET' }, TRANSCRIPT_DOWNLOAD_TIMEOUT_MS, fetchImpl)
        if (!res.ok) throw new ProviderError(`Downloading the transcript failed (${res.status}).`)
        const parsed = parseSarvamOutput(await res.json())
        language ??= parsed.language
        segments.push(...parsed.segments.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset })))
        offset = durationOf(segments)
      }
      return { state: 'done', segments, language, durationSeconds: durationOf(segments) }
    },
  }
}
