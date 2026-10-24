/**
 * Transcription providers (Meetings AI), behind one interface so Sarvam
 * (default: batch STT with diarization and Hinglish code-mix) and Deepgram
 * can be swapped. Pure types and helpers; adapters take `fetch` so tests
 * never reach the network.
 */

export type TranscriptSegment = Readonly<{ speaker: string; start: number; end: number; text: string }>

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type StartInput = Readonly<{
  audio: Buffer
  fileName: string
  mime: string
  /** Where the provider posts when the job ends (with `callbackToken`), when it supports callbacks. */
  callbackUrl?: string
  callbackToken?: string
  numSpeakers?: number
}>

export type JobResult =
  | Readonly<{ state: 'running' }>
  | Readonly<{ state: 'failed'; error: string }>
  | Readonly<{ state: 'done'; segments: TranscriptSegment[]; language: string | null; durationSeconds: number }>

export interface TranscriptionProvider {
  readonly name: string
  start(input: StartInput): Promise<{ jobId: string }>
  poll(jobId: string): Promise<JobResult>
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Length of the audio the segments cover (the last end), in whole seconds. */
export const durationOf = (segments: readonly TranscriptSegment[]): number => Math.ceil(segments.reduce((max, s) => Math.max(max, s.end), 0))

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** "[0:12] Priya: …" lines; speaker labels replaced by the names people set. Adjacent lines of one speaker are joined. */
export function transcriptText(segments: readonly TranscriptSegment[], names: Readonly<Record<string, string>> = {}, maxChars = 60_000): string {
  const lines: { speaker: string; start: number; text: string }[] = []
  for (const s of segments) {
    const speaker = names[s.speaker] || (s.speaker ? `Speaker ${s.speaker}` : 'Speaker')
    const last = lines[lines.length - 1]
    if (last && last.speaker === speaker) last.text = `${last.text} ${s.text}`.trim()
    else lines.push({ speaker, start: s.start, text: s.text.trim() })
  }
  const text = lines.map((l) => `[${clock(l.start)}] ${l.speaker}: ${l.text}`).join('\n')
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[transcript cut for length]` : text
}

export { clock as timestampLabel }
