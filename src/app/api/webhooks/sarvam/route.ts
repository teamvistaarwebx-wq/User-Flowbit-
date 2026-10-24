import { timingSafeEqual } from 'node:crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { hashToken } from '@/lib/auth/tokens'
import { dbConnect } from '@/lib/db'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { systemAiCtx } from '@/modules/work/meetings/ai/bot'
import { refreshTranscription } from '@/modules/work/meetings/ai/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Sarvam's batch job callback: the job's status (never the transcript). The
 * per-job token in X-SARVAM-JOB-CALLBACK-TOKEN must match the stored hash;
 * the transcript is then read through the API, after the 200.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get('x-sarvam-job-callback-token') ?? ''
  let jobId = ''
  try {
    const body = (await request.json()) as { job_id?: unknown }
    jobId = typeof body.job_id === 'string' ? body.job_id : ''
  } catch {
    return NextResponse.json({ error: 'Bad body.' }, { status: 400 })
  }
  if (!jobId || !token) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  await dbConnect()
  const transcript = await MeetingTranscript.findOne({ jobId }, { orgId: 1, requestedById: 1, callbackTokenHash: 1 }).lean()
  if (!transcript?.callbackTokenHash || !same(transcript.callbackTokenHash, hashToken(token))) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 })
  after(async () => {
    try {
      const ctx = transcript.requestedById ? await systemAiCtx(transcript.orgId, transcript.requestedById) : null
      if (ctx) await refreshTranscription(ctx, transcript._id)
    } catch (error) {
      console.error('[meetings-ai] callback processing failed', jobId, error)
    }
  })
  return NextResponse.json({ ok: true })
}
