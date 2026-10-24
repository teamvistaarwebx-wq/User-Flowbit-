import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MEETING_CAPS, hoursLabel, meetingAllowance, meetingCapSeconds, mergeMeetingCaps } from '@/lib/meeting-caps'
import { presignUrl } from '@/lib/storage/presign'
import { matchOwner, mergeMinutes, minutesSchema, templateMinutes } from './minutes'
import { artifactsFromBot, BOT_ANNOUNCEMENT, BOT_NAME, botRequestBody, parseRecallTranscript, readRecallWebhook, recallProvider } from './recall'
import { isPurgeLive, purgeCutoff, retentionDaysOf } from './retention'
import { parseSarvamOutput, sarvamProvider } from './sarvam'
import { durationOf, transcriptText } from './transcription'

vi.mock('server-only', () => ({}))

type Call = { url: string; init?: RequestInit }
function fakeFetch(routes: (url: string, init?: RequestInit) => unknown) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const out = routes(url, init)
    if (out instanceof Response) return out
    return new Response(JSON.stringify(out ?? {}), { status: 200 })
  })
  return { impl, calls }
}

describe('Sarvam batch adapter (mocked)', () => {
  it('creates a diarized code-mix job, uploads to the presigned URL and starts it', async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.endsWith('/speech-to-text/job/v1')) return { job_id: 'job-1' }
      if (url.endsWith('/upload-files')) return { upload_urls: { 'rec.mp3': { file_url: 'https://blob.test/up?sig=1' } } }
      if (url.startsWith('https://blob.test/')) return new Response('', { status: 201 })
      if (url.endsWith('/job-1/start')) return { job_state: 'Running' }
      return new Response('nope', { status: 404 })
    })
    const provider = sarvamProvider('sk_test', impl)
    await expect(provider.start({ audio: Buffer.from('ID3'), fileName: 'rec.mp3', mime: 'audio/mpeg', callbackUrl: 'https://app.test/api/webhooks/sarvam', callbackToken: 'tok' })).resolves.toEqual({ jobId: 'job-1' })
    const create = calls[0]
    expect(create.url).toBe('https://api.sarvam.ai/speech-to-text/job/v1')
    expect((create.init?.headers as Record<string, string>)['api-subscription-key']).toBe('sk_test')
    expect(JSON.parse(String(create.init?.body))).toEqual({ job_parameters: { model: 'saaras:v4', mode: 'codemix', language_code: 'hi-IN', with_diarization: true }, callback: { url: 'https://app.test/api/webhooks/sarvam', auth_token: 'tok' } })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ job_id: 'job-1', files: ['rec.mp3'] })
    expect(calls[2].init?.method).toBe('PUT')
    expect((calls[2].init?.headers as Record<string, string>)['x-ms-blob-type']).toBe('BlockBlob')
    expect(calls[3].url).toBe('https://api.sarvam.ai/speech-to-text/job/v1/job-1/start')
  })

  it('polls: running, failed, and completed with the diarized output downloaded', async () => {
    let state = 'Running'
    const { impl } = fakeFetch((url) => {
      if (url.endsWith('/status')) return state === 'Completed' ? { job_state: 'Completed', job_details: [{ outputs: [{ file_name: '0.json' }] }] } : { job_state: state, error_message: 'bad audio' }
      if (url.endsWith('/download-files')) return { download_urls: { '0.json': { file_url: 'https://blob.test/0.json' } } }
      if (url === 'https://blob.test/0.json') return { language_code: 'hi-IN', diarized_transcript: { entries: [{ transcript: 'Namaste, chaliye start karte hain', start_time_seconds: 0.2, end_time_seconds: 3.1, speaker_id: '0' }, { transcript: 'Banner Friday tak bhej dunga', start_time_seconds: 3.4, end_time_seconds: 6.9, speaker_id: '1' }] } }
      return {}
    })
    const provider = sarvamProvider('sk_test', impl)
    await expect(provider.poll('job-1')).resolves.toEqual({ state: 'running' })
    state = 'Failed'
    await expect(provider.poll('job-1')).resolves.toEqual({ state: 'failed', error: 'bad audio' })
    state = 'Completed'
    const done = await provider.poll('job-1')
    expect(done).toMatchObject({ state: 'done', language: 'hi-IN', durationSeconds: 7 })
    expect(done.state === 'done' && done.segments.map((s) => s.speaker)).toEqual(['0', '1'])
  })

  it('reads a plain transcript when there is no diarization, and refuses a failed call', async () => {
    expect(parseSarvamOutput({ transcript: 'hello', timestamps: { end_time_seconds: [1, 2.5] } }).segments).toEqual([{ speaker: '', start: 0, end: 2.5, text: 'hello' }])
    const { impl } = fakeFetch(() => new Response('{"error":"quota"}', { status: 429 }))
    await expect(sarvamProvider('k', impl).start({ audio: Buffer.from('x'), fileName: 'a.mp3', mime: 'audio/mpeg' })).rejects.toThrow(/429/)
  })

  it('formats the transcript with speaker names and timestamps', () => {
    const segments = [{ speaker: '0', start: 0, end: 2, text: 'Hi' }, { speaker: '0', start: 2, end: 3, text: 'all' }, { speaker: '1', start: 65, end: 70, text: 'Hello' }]
    expect(transcriptText(segments, { 0: 'Priya' })).toBe('[0:00] Priya: Hi all\n[1:05] Speaker 1: Hello')
    expect(durationOf(segments)).toBe(70)
  })
})

describe('Recall notetaker (mocked)', () => {
  it('names and announces the bot; schedules only with ten minutes notice', () => {
    const now = new Date('2026-10-09T10:00:00Z')
    const later = botRequestBody({ meetingUrl: 'https://meet.google.com/abc-defg-hij', joinAt: new Date('2026-10-09T11:00:00Z'), metadata: { orgId: 'o', meetingId: 'm' } }, now)
    expect(later).toMatchObject({ bot_name: BOT_NAME, join_at: '2026-10-09T11:00:00.000Z', chat: { on_bot_join: { send_to: 'everyone', message: BOT_ANNOUNCEMENT } }, metadata: { orgId: 'o', meetingId: 'm' } })
    expect(BOT_NAME).toBe('Flowbit Notetaker')
    const soon = botRequestBody({ meetingUrl: 'https://meet.google.com/x', joinAt: new Date('2026-10-09T10:05:00Z'), metadata: {} }, now)
    expect(soon).not.toHaveProperty('join_at')
  })

  it('calls the region host with a Token header', async () => {
    const { impl, calls } = fakeFetch(() => ({ id: 'bot-1' }))
    await expect(recallProvider('rk', 'ap-northeast-1', impl).schedule({ meetingUrl: 'https://meet.google.com/x', joinAt: null, metadata: {} })).resolves.toEqual({ botId: 'bot-1' })
    expect(calls[0].url).toBe('https://ap-northeast-1.recall.ai/api/v1/bot/')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Token rk')
  })

  it('reads the recording and transcript from Retrieve Bot', async () => {
    const bot = { status_changes: [{ code: 'in_call_recording' }, { code: 'done' }], recordings: [{ status: { code: 'done' }, media_shortcuts: { audio_mixed: { data: { download_url: 'https://r.test/a.mp3' } }, transcript: { data: { download_url: 'https://r.test/t.json' } } } }] }
    expect(artifactsFromBot(bot)).toEqual({ status: 'done', audioUrl: 'https://r.test/a.mp3', transcriptUrl: 'https://r.test/t.json' })
    expect(artifactsFromBot({ status_changes: [{ code: 'joining_call' }] }).status).toBe('pending')
    expect(artifactsFromBot({ status_changes: [{ code: 'fatal' }] }).status).toBe('failed')
    const turns = [{ participant: { id: 1, name: 'Priya' }, words: [{ text: 'Banner', start_timestamp: { relative: 1.5 }, end_timestamp: { relative: 2 } }, { text: 'ready?', start_timestamp: { relative: 2.1 }, end_timestamp: { relative: 2.6 } }] }]
    expect(parseRecallTranscript(turns)).toEqual([{ speaker: 'Priya', start: 1.5, end: 2.6, text: 'Banner ready?' }])
    const { impl } = fakeFetch((url) => (url.endsWith('/bot/bot-1/') ? bot : turns))
    await expect(recallProvider('rk', 'us-west-2', impl).artifacts('bot-1')).resolves.toMatchObject({ status: 'done', audioUrl: 'https://r.test/a.mp3', transcript: [{ speaker: 'Priya' }] })
  })

  it('accepts only webhooks signed with the secret (Svix), with webhook-* or svix-* headers', () => {
    const key = Buffer.from('k'.repeat(24))
    const secret = `whsec_${key.toString('base64')}`
    const raw = JSON.stringify({ event: 'bot.done', data: { bot: { id: 'bot-1', metadata: { orgId: 'o1', meetingId: 'm1' } } } })
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = createHmac('sha256', key).update(`msg_1.${ts}.${raw}`).digest('base64')
    const headers = (prefix: string, signature = `v1,${sig}`) => (name: string) => ({ [`${prefix}-id`]: 'msg_1', [`${prefix}-timestamp`]: ts, [`${prefix}-signature`]: signature })[name] ?? null
    expect(readRecallWebhook(raw, headers('webhook'), secret)).toEqual({ event: 'bot.done', botId: 'bot-1', orgId: 'o1', meetingId: 'm1' })
    expect(readRecallWebhook(raw, headers('svix'), secret)?.botId).toBe('bot-1')
    expect(readRecallWebhook(raw, headers('webhook', 'v1,forged'), secret)).toBeNull()
    expect(readRecallWebhook(raw.replace('m1', 'm2'), headers('webhook'), secret)).toBeNull()
  })
})

describe('minutes', () => {
  const members = [{ id: 'a', name: 'Priya Sharma' }, { id: 'b', name: 'Rohit Verma' }, { id: 'c', name: 'Rohit Kumar' }, { id: 'd', name: 'Aditi Singh' }]

  it('matches owners: exact, a unique first name, attendees first; ambiguous stays empty', () => {
    expect(matchOwner('Priya', members.slice(0, 1), members)).toBe('a')
    expect(matchOwner('priya sharma', [], members)).toBe('a')
    expect(matchOwner('Rohit', [], members)).toBeNull()
    expect(matchOwner('Rohit', [members[2]], members)).toBe('c')
    expect(matchOwner('Someone', [], members)).toBeNull()
    expect(matchOwner(null, [], members)).toBeNull()
  })

  it('reads the model reply and drops a bad due date', () => {
    const parsed = minutesSchema.parse({ agenda: ['Homepage'], notes: [], decisions: ['Go with option B'], actionItems: [{ title: 'Send banner', owner: 'Priya', due: 'Friday' }] })
    expect(parsed.actionItems[0]).toMatchObject({ title: 'Send banner', due: null })
  })

  it('fills an empty agenda, appends minutes to the notes and adds only new action items', () => {
    const minutes = minutesSchema.parse({ agenda: ['Homepage'], notes: ['Two options shown'], decisions: ['Option B'], actionItems: [{ title: 'Send banner', owner: 'Priya', due: '2026-10-16' }, { title: 'Book shoot', owner: 'Nobody' }] })
    const out = mergeMinutes({ agenda: '', notes: 'Earlier note', actionItems: [{ title: 'book shoot' }] }, minutes, (o) => matchOwner(o, [], members), '9 Oct 2026')
    expect(out.agenda).toBe('- Homepage')
    expect(out.notes).toBe('Earlier note\n\nMinutes (9 Oct 2026)\n\nNotes:\n- Two options shown\n\nDecisions:\n- Option B')
    expect(out.newItems).toEqual([{ title: 'Send banner', assigneeId: 'a', dueDate: '2026-10-16' }])
    expect(mergeMinutes({ agenda: 'Kept', notes: null, actionItems: [] }, minutes, () => null, 'x').agenda).toBeNull()
  })

  it('without AI, quotes the transcript and invents nothing', () => {
    const m = templateMinutes('[0:00] A: hi\n[0:05] B: hello', 'AI is not set up on this server')
    expect(m.notes[0]).toMatch(/not drafted \(AI is not set up/)
    expect(m.actionItems).toEqual([])
  })
})

describe('hours cap', () => {
  it('Free 0, Trial 1 h, paid 5 h per seat; Console values merged over the defaults', () => {
    expect(meetingCapSeconds(DEFAULT_MEETING_CAPS, 'free', 10)).toBe(0)
    expect(meetingCapSeconds(DEFAULT_MEETING_CAPS, 'trial', 10)).toBe(3600)
    expect(meetingCapSeconds(DEFAULT_MEETING_CAPS, 'paid', 4)).toBe(4 * 5 * 3600)
    expect(meetingCapSeconds(DEFAULT_MEETING_CAPS, 'internal', 0)).toBe(5 * 3600)
    expect(mergeMeetingCaps({ trial: 2, paidPerSeat: -1, free: 'x' })).toEqual({ free: 0, trial: 2, paidPerSeat: 5 })
  })

  it('refuses a recording longer than what is left', () => {
    expect(meetingAllowance(3600, 3000, 300)).toMatchObject({ allowed: true, leftSeconds: 600 })
    expect(meetingAllowance(3600, 3000, 900)).toMatchObject({ allowed: false })
    expect(meetingAllowance(0, 0, 1).allowed).toBe(false)
    expect(hoursLabel(5400)).toBe('1 h 30 min')
  })
})

describe('retention', () => {
  it('defaults to 90 days, stays within bounds, and is a dry run unless the flag is on', () => {
    expect(retentionDaysOf({})).toBe(90)
    expect(retentionDaysOf({ meetingsAi: { retentionDays: 30 } })).toBe(30)
    expect(retentionDaysOf({ meetingsAi: { retentionDays: 1 } })).toBe(90)
    expect(purgeCutoff(90, new Date('2026-10-09T00:00:00Z')).toISOString()).toBe('2026-07-11T00:00:00.000Z')
    expect(isPurgeLive('')).toBe(false)
    expect(isPurgeLive(undefined)).toBe(false)
    expect(isPurgeLive('1')).toBe(true)
    expect(isPurgeLive('TRUE')).toBe(true)
  })
})

describe('direct upload signing', () => {
  it('matches AWS’s SigV4 example and uses path style on R2', () => {
    const aws = presignUrl({ region: 'us-east-1', bucket: 'examplebucket', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }, { method: 'GET', key: 'test.txt', expiresSeconds: 86400, now: new Date('2013-05-24T00:00:00Z') })
    expect(aws).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
    const r2 = presignUrl({ endpoint: 'https://acc.r2.cloudflarestorage.com', region: 'auto', bucket: 'flowbit', accessKeyId: 'a', secretAccessKey: 'b' }, { method: 'PUT', key: 'org/2026-10/id-My Rec.mp3', expiresSeconds: 900 })
    expect(r2.startsWith('https://acc.r2.cloudflarestorage.com/flowbit/org/2026-10/id-My%20Rec.mp3?')).toBe(true)
  })
})

// --- Pipeline with the database, Claude and storage faked -----------------------------------------
const askClaudeJson = vi.fn()
vi.mock('@/modules/work/arc/claude', () => ({ askClaudeJson: (...a: unknown[]) => askClaudeJson(...a) }))
vi.mock('@/lib/notify', () => ({ notifyMembers: vi.fn(async () => 1) }))
vi.mock('@/models/User', () => ({ User: { find: () => ({ lean: async () => [{ _id: 'u1', name: 'Priya Sharma' }, { _id: 'u2', name: 'Rohit Verma' }] }) } }))
vi.mock('@/lib/files', () => ({ readStoredFile: async () => ({ file: {}, data: Buffer.from('audio') }) }))
vi.mock('@/modules/console/settings-query', () => ({ consoleSettings: async () => ({ meetings: { caps: { free: 0, trial: 1, paidPerSeat: 5 } } }) }))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<typeof import('@/lib/env')>()), serverEnv: () => ({ APP_SECRET: 's'.repeat(40), SARVAM_API_KEY: '' }), appUrl: (p = '') => `https://app.test${p}`, isRecallConfigured: () => false }))

type Row = Record<string, unknown> & { _id: string }
const tables: Record<string, Row[]> = {}
let seq = 0
function db(model: { modelName: string }) {
  const rows = () => (tables[model.modelName] ??= [])
  const pick = (f: Record<string, unknown>) => rows().find((r) => Object.entries(f).every(([k, v]) => (v && typeof v === 'object' && '$ne' in (v as object) ? r[k] !== (v as { $ne: unknown }).$ne : String(r[k]) === String(v)))) ?? null
  return {
    findById: (id: unknown) => ({ lean: async () => pick({ _id: id }) }),
    find: () => ({ lean: async () => rows() }),
    create: async (doc: Record<string, unknown>) => { const row = { _id: `id${++seq}`, ...doc }; rows().push(row); if (model.modelName === 'MeetingAiUsage' && rows().filter((r) => r.transcriptId === doc.transcriptId).length > 1) { rows().pop(); throw Object.assign(new Error('dup'), { code: 11000 }) } return row },
    updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown>; $push?: Record<string, { $each: unknown[] }> }) => { const r = pick(f); if (r) { Object.assign(r, u.$set ?? {}); for (const [k, v] of Object.entries(u.$push ?? {})) r[k] = [...((r[k] as unknown[]) ?? []), ...v.$each] } return { modifiedCount: r ? 1 : 0 } },
    findOneAndUpdate: (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => ({ lean: async () => { const r = pick(f); if (r) Object.assign(r, u.$set); return r } }),
    aggregate: async () => [{ seconds: rows().reduce((s, r) => s + Number(r.seconds ?? 0), 0) }],
  }
}
const M1 = 'aaaaaaaaaaaaaaaaaaaaaaa1'
const M2 = 'aaaaaaaaaaaaaaaaaaaaaaa2'
const trialOrg = { subscription: { status: 'trialing', plan: 'trial', accountType: 'trial', trialEndsAt: new Date(Date.now() + 5 * 86_400_000) } }
const ctx = { orgId: 'o1', memberId: M1, db, entitlements: { accountType: 'trial' }, org: trialOrg } as never

describe('transcript → minutes pipeline', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k]
    tables.Meeting = [{ _id: 'meet1', title: 'Kalpa sync', startAt: new Date('2026-10-09T05:30:00Z'), organizerId: M1, attendees: [{ memberId: M2 }], agenda: '', notes: '', actionItems: [] }]
    tables.Member = [{ _id: M1, userId: 'u1' }, { _id: M2, userId: 'u2' }]
    tables.MeetingTranscript = [{ _id: 't1', meetingId: 'meet1', provider: 'sarvam', status: 'processing', jobId: 'job-1', segments: [] }]
    askClaudeJson.mockReset().mockResolvedValue({ ok: true, value: { agenda: ['Homepage'], notes: ['Shown two options'], decisions: ['Option B'], actionItems: [{ title: 'Send banner files', owner: 'Rohit', due: '2026-10-16' }] } })
  })

  it('stores the transcript once, counts the hours once, and drafts minutes into the meeting', async () => {
    const { finishTranscript } = await import('./pipeline')
    const segments = [{ speaker: '0', start: 0, end: 1800, text: 'Rohit banner Friday tak bhejega' }]
    await expect(finishTranscript(ctx, 't1' as never, { segments, language: 'hi-IN', durationSeconds: 1800 })).resolves.toBe(true)
    await expect(finishTranscript(ctx, 't1' as never, { segments, language: 'hi-IN', durationSeconds: 1800 })).resolves.toBe(false)
    expect(tables.MeetingAiUsage).toHaveLength(1)
    expect(tables.MeetingAiUsage[0]).toMatchObject({ seconds: 1800, provider: 'sarvam' })
    const meeting = tables.Meeting[0]
    expect(meeting.agenda).toBe('- Homepage')
    expect(String(meeting.notes)).toMatch(/Decisions:\n- Option B/)
    expect(meeting.actionItems).toEqual([expect.objectContaining({ title: 'Send banner files', dueDate: '2026-10-16', done: false })])
    expect(String((meeting.actionItems as { assigneeId: unknown }[])[0].assigneeId)).toBe(M2)
    const [, , input] = askClaudeJson.mock.calls[0] as [unknown, unknown, { task: string; prompt: string }]
    expect(input.task).toBe('minutes')
    expect(input.prompt).toMatch(/Speaker 0: Rohit banner Friday tak bhejega/)
    expect(meeting['ai.minutesSource']).toBe('ai')
  })

  it('falls back to the transcript when AI is over the cap', async () => {
    askClaudeJson.mockResolvedValue({ ok: false, reason: 'cap' })
    const { finishTranscript } = await import('./pipeline')
    await finishTranscript(ctx, 't1' as never, { segments: [{ speaker: '1', start: 0, end: 60, text: 'hello' }], language: null, durationSeconds: 60 })
    expect(String(tables.Meeting[0].notes)).toMatch(/monthly AI limit/)
    expect(tables.Meeting[0].actionItems).toEqual([])
  })

  it('refuses to start past the hours cap, before any upload', async () => {
    tables.MeetingAiUsage = [{ _id: 'u', seconds: 3500, transcriptId: 'x' }]
    const provider = { name: 'fake', start: vi.fn(), poll: vi.fn() }
    const { startTranscription } = await import('./pipeline')
    await expect(startTranscription(ctx, 'meet1' as never, { fileId: 'f1' as never, name: 'a.mp3', mime: 'audio/mpeg' }, { source: 'upload', seconds: 1200, provider })).rejects.toThrow(/left this month/)
    expect(provider.start).not.toHaveBeenCalled()
  })

  it('polls a job through the provider and finishes it', async () => {
    const provider = { name: 'fake', start: vi.fn(), poll: vi.fn(async () => ({ state: 'done' as const, segments: [{ speaker: '0', start: 0, end: 30, text: 'ok' }], language: 'hi-IN', durationSeconds: 30 })) }
    const { refreshTranscription } = await import('./pipeline')
    await expect(refreshTranscription(ctx, 't1', provider)).resolves.toBe('done')
    expect(tables.MeetingTranscript[0].status).toBe('done')
    await expect(refreshTranscription(ctx, 't1', provider)).resolves.toBe('done')
    expect(provider.poll).toHaveBeenCalledTimes(1)
  })
})
