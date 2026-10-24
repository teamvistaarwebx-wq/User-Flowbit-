'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Download, FileAudio, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { hoursLabel } from '@/lib/meeting-caps'
import { toast } from '@/lib/toast'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limit'
import { cancelNotetakerAction, deleteMeetingAiData, fetchFromBotAction, finishRecordingUpload, nameSpeakerAction, prepareRecordingUpload, redraftMinutesAction, refreshTranscriptAction, sendNotetakerAction, uploadRecording } from '@/modules/work/meetings/ai/actions'
import type { MeetingAiView } from '@/modules/work/meetings/ai/view'

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' | 'warning' }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  processing: { label: 'Transcribing', tone: 'info' },
  done: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}
const BOT: Record<string, string> = { booking: 'Booking…', scheduled: 'Booked', joined: 'In the call', done: 'Finished', failed: 'Failed', cancelled: 'Called off' }

const FAILED = 'The upload did not go through. Check your connection and try again.'

/** Reads the recording's length in the browser (the hours cap needs it before upload). */
function mediaSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(el.duration) ? Math.ceil(el.duration) : 0)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    el.src = url
  })
}

function UploadRecording({ meetingId, direct }: { meetingId: string; direct: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const upload = (file: File) =>
    start(async () => {
      try {
        const durationSeconds = await mediaSeconds(file)
        if (!durationSeconds) return void toast.error('Could not read the length of that recording. Use an MP3, M4A, WAV, MP4 or WebM file.')
        const facts = { id: meetingId, name: file.name, mime: file.type || 'audio/mpeg', size: file.size, durationSeconds }
        const plan = direct ? await prepareRecordingUpload(facts) : null
        if (plan && !plan.ok) return void toast.error(plan.error)
        if (plan?.ok && plan.data?.mode === 'direct') {
          const put = await fetch(plan.data.url, { method: 'PUT', body: file, headers: { 'Content-Type': facts.mime } })
          if (!put.ok) return void toast.error(FAILED)
          const done = await finishRecordingUpload({ ...facts, fileId: plan.data.fileId, key: plan.data.key })
          if (!done.ok) return void toast.error(done.error)
          toast.success(done.message ?? 'Uploaded.')
        } else {
          if (file.size > MAX_UPLOAD_BYTES) return void toast.error('This server takes recordings up to the upload limit. Ask your admin to set up S3 or R2 storage for larger files.')
          const data = new FormData()
          data.set('id', meetingId)
          data.set('durationSeconds', String(durationSeconds))
          data.set('recording', file)
          const res = await uploadRecording(data)
          if (!res.ok) return void toast.error(res.error)
          toast.success(res.message ?? 'Uploaded.')
        }
        router.refresh()
      } catch (error) {
        console.error('[meetings-ai] upload failed', error)
        toast.error(FAILED)
      } finally {
        if (input.current) input.current.value = ''
      }
    })
  return (
    <>
      <input ref={input} type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button size="sm" variant="secondary" loading={pending} icon={<Upload className="size-3.5" />} onClick={() => input.current?.click()}>
        Upload recording
      </Button>
    </>
  )
}

function SpeakerNames({ meetingId, speakers }: { meetingId: string; speakers: { key: string; name: string }[] }) {
  const [run, pending] = useAction(nameSpeakerAction)
  if (!speakers.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {speakers.map((s) => (
        <label key={s.key} className="grid gap-1 text-xs text-fg-2">
          Speaker {s.key}
          <Input defaultValue={s.name} placeholder="Name" maxLength={80} disabled={pending} className="h-9 text-xs" onBlur={(e) => e.target.value.trim() !== s.name && run({ id: meetingId, speaker: s.key, name: e.target.value })} />
        </label>
      ))}
    </div>
  )
}

/** Meeting page: recording → transcript → minutes, the notetaker, usage and the delete buttons. */
export function MeetingAiCard({ meetingId, view, editable }: { meetingId: string; view: MeetingAiView; editable: boolean }) {
  const [refresh, refreshing] = useAction(refreshTranscriptAction)
  const [redraft, redrafting] = useAction(redraftMinutesAction)
  const [cancel, cancelling] = useAction(cancelNotetakerAction)
  const [fetchBot, fetching] = useAction(fetchFromBotAction)
  const [open, setOpen] = useState(false)
  const t = view.transcript
  const status = t ? STATUS[t.status] : null
  return (
    <Card variant="solid">
      <CardHeader label="Meetings AI" icon={<Sparkles />} description={`Transcript and minutes. ${hoursLabel(view.usage.usedSeconds)} of ${hoursLabel(view.usage.capSeconds)} used this month.`} />
      {!view.configured.transcription ? <p className="mb-3 text-xs text-warning">Transcription is not set up on this server yet (SARVAM_API_KEY).</p> : null}
      <div className="space-y-3">
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <UploadRecording meetingId={meetingId} direct={view.configured.direct} />
            {view.notetaker.canSend && view.configured.bot ? (
              <ConfirmDialog
                tone="primary"
                trigger={<Button size="sm" variant="secondary" icon={<Bot className="size-3.5" />}>Send notetaker</Button>}
                title="Send Flowbit Notetaker?"
                description={`It joins the call, announces itself in the chat and records the audio. Attendees get an email notice; the recording and transcript are deleted after ${view.retentionDays} days.`}
                confirmLabel="Send notetaker"
                onConfirm={() => sendNotetakerAction({ id: meetingId })}
              />
            ) : null}
            {view.notetaker.canFetch ? <Button size="sm" variant="ghost" loading={fetching} icon={<Download className="size-3.5" />} onClick={() => fetchBot({ id: meetingId })}>Fetch from bot</Button> : null}
            {view.notetaker.status === 'scheduled' ? <Button size="sm" variant="ghost" loading={cancelling} icon={<X className="size-3.5" />} onClick={() => cancel({ id: meetingId })}>Call off notetaker</Button> : null}
          </div>
        ) : null}
        {view.notetaker.status !== 'none' ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-2"><Bot className="size-3.5" /> Notetaker: <Badge tone={view.notetaker.status === 'failed' ? 'danger' : 'neutral'}>{BOT[view.notetaker.status] ?? view.notetaker.status}</Badge>{view.notetaker.error ? <span>{view.notetaker.error}</span> : null}</p>
        ) : null}
        {view.recording ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-white">
            <FileAudio className="size-4 text-icon-muted" />
            <a href={view.recording.url} className="min-w-0 flex-1 truncate hover:underline">{view.recording.name}</a>
            {editable ? <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />}>Delete</Button>} title="Delete the recording?" description="The audio is removed for good. The transcript and minutes stay." confirmLabel="Delete recording" onConfirm={() => deleteMeetingAiData({ id: meetingId, what: 'recording' })} /> : null}
          </p>
        ) : null}
        {t && status ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {t.minutesAt ? <span className="text-xs text-fg-2">{t.minutesSource === 'ai' ? 'Minutes drafted into the notes and action items' : 'Notes quote the transcript (no AI)'}</span> : null}
              {t.error ? <span className="text-xs text-danger">{t.error}</span> : null}
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                {t.status === 'processing' || t.status === 'queued' ? <Button size="sm" variant="ghost" loading={refreshing} icon={<RefreshCw className="size-3.5" />} onClick={() => refresh({ id: meetingId })}>Check now</Button> : null}
                {t.status === 'done' ? <Button size="sm" variant="ghost" loading={redrafting} icon={<Sparkles className="size-3.5" />} onClick={() => redraft({ id: meetingId })}>Draft minutes again</Button> : null}
                {t.status === 'done' ? <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide transcript' : 'Show transcript'}</Button> : null}
                <ConfirmDialog trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />}>Delete transcript</Button>} title="Delete the transcript?" description="The transcript is removed for good. The minutes in the notes and the action items stay." confirmLabel="Delete transcript" onConfirm={() => deleteMeetingAiData({ id: meetingId, what: 'transcript' })} />
              </div>
            ) : null}
            {open && t.status === 'done' ? (
              <div className="space-y-3">
                {editable ? <SpeakerNames meetingId={meetingId} speakers={t.speakers} /> : null}
                <ol className="max-h-[420px] space-y-2 overflow-y-auto rounded-[10px] bg-white/[0.03] p-3 text-sm">
                  {t.segments.map((s, i) => (
                    <li key={i}><span className="text-xs tabular-nums text-fg-3">{s.at}</span> <span className="font-medium text-white">{s.speaker}:</span> <span className="text-white/85">{s.text}</span></li>
                  ))}
                  {t.more ? <li className="text-xs text-fg-2">…and {t.more} more lines.</li> : null}
                </ol>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-fg-2">Upload the recording (MP3, M4A, WAV or video, up to 2 hours), or send the notetaker to a Meet, Zoom or Teams call. Hinglish is fine. Minutes go into the notes and action items wait for you to create tasks.</p>
        )}
      </div>
    </Card>
  )
}
