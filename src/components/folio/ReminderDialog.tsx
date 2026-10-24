'use client'

import { useState, type ReactNode } from 'react'
import { ExternalLink, Mail, MessageCircle, Send } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Segmented } from '@/components/ui/tabs'
import { useAction } from '@/components/ui/action-form'
import { previewReminderAction, recordWhatsAppAction, sendReminderAction, sendWhatsAppReminderAction, type ReminderPreview } from '@/modules/folio/collections/actions'
import { whatsappLink } from '@/modules/folio/collections/compose'
import { Note } from './ui'

type Channel = 'email' | 'whatsapp'

type ReminderDialogProps = { invoiceId: string; invoiceNumber: string; trigger: ReactNode; defaultChannel?: Channel }

/**
 * Compose a payment reminder for one invoice: the text is drafted on the
 * server from the invoice, the recipient is picked from the client's billing
 * contacts (resolved again on the server), and the person can edit the words.
 */
export function ReminderDialog({ invoiceId, invoiceNumber, trigger, defaultChannel = 'email' }: ReminderDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ReminderPreview | null>(null)
  const [channel, setChannel] = useState<Channel>(defaultChannel)
  const [recipientId, setRecipientId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [opened, setOpened] = useState(false)
  const close = () => setOpen(false)
  const [send, sending] = useAction(sendReminderAction, { onDone: close })
  const [record, recording] = useAction(recordWhatsAppAction, { onDone: close })
  const [sendTemplate, sendingTemplate] = useAction(sendWhatsAppReminderAction, { onDone: close })
  const connected = Boolean(preview?.whatsappConnected)

  const load = async () => {
    setLoading(true)
    try {
      const res = await previewReminderAction({ invoiceId })
      if (!res.ok || !res.data) {
        toast.error(res.ok ? 'Could not draft the reminder.' : res.error)
        setOpen(false)
        return
      }
      const p = res.data
      setPreview(p)
      setSubject(p.subject)
      setBody(p.body)
      setMessage(p.whatsapp)
      setRecipientId(p.recipients.find((r) => (defaultChannel === 'email' ? r.email : r.whatsapp))?.id ?? '')
      setOpened(false)
    } catch {
      toast.error('Could not draft the reminder. Check your connection and try again.')
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void load()
  }

  const usable = (preview?.recipients ?? []).filter((r) => (channel === 'email' ? r.email : r.whatsapp))
  const chosen = usable.find((r) => r.id === recipientId)
  const link = channel === 'whatsapp' && chosen ? whatsappLink(chosen.whatsapp, message) : null

  const switchChannel = (c: Channel) => {
    setChannel(c)
    setRecipientId((preview?.recipients ?? []).find((r) => (c === 'email' ? r.email : r.whatsapp))?.id ?? '')
    setOpened(false)
  }

  const footer =
    channel === 'email' ? (
      <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={!chosen || !subject.trim() || !body.trim()} onClick={() => send({ invoiceId, recipientId, subject, body })}>
        Send email
      </Button>
    ) : connected ? (
      <Button variant="primary" icon={<MessageCircle className="size-4" />} loading={sendingTemplate} disabled={!chosen} onClick={() => sendTemplate({ invoiceId, recipientId })}>
        Send on WhatsApp
      </Button>
    ) : (
      <>
        <Button variant="secondary" icon={<ExternalLink className="size-4" />} disabled={!link} onClick={() => { if (link) { window.open(link, '_blank', 'noopener,noreferrer'); setOpened(true) } }}>
          Open WhatsApp
        </Button>
        <Button variant="primary" loading={recording} disabled={!chosen || !opened || !message.trim()} onClick={() => record({ invoiceId, recipientId, body: message })}>
          Record as sent
        </Button>
      </>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange} trigger={trigger} title={`Remind about ${invoiceNumber}`} description={preview ? <span className="inline-flex items-center gap-2">Tone <Badge>{preview.toneLabel}</Badge></span> : 'Drafting from the invoice…'} size="lg" footer={preview ? footer : null}>
      {loading || !preview ? (
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-40 animate-pulse rounded-[14px] bg-white/[0.06]" />
        </div>
      ) : (
        <div className="space-y-4">
          <Segmented<Channel> value={channel} onChange={switchChannel} options={[{ value: 'email', label: <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" /> Email</span> }, { value: 'whatsapp', label: <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" /> WhatsApp</span> }]} />
          {usable.length ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-white">To</span>
              <Select value={recipientId || undefined} onValueChange={setRecipientId} placeholder="Choose a contact" options={usable.map((r) => ({ value: r.id, label: r.name, hint: (channel === 'email' ? r.email : r.whatsapp) ?? undefined }))} />
            </label>
          ) : (
            <Note tone="warning">
              Nobody on this client can receive a {channel === 'email' ? 'reminder email' : 'WhatsApp'}. Add a billing contact with {channel === 'email' ? 'an email address' : 'a phone number'} on the client’s billing settings.
            </Note>
          )}
          {channel === 'email' ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-white">Subject</span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-white">Message</span>
                <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </>
          ) : connected ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-white">Message</span>
              <p className="whitespace-pre-wrap rounded-[14px] bg-white/[0.04] p-3 text-sm text-fg-2 ring-1 ring-inset ring-white/10">{preview.templatePreview}</p>
              <span className="block text-xs text-fg-2">Sent from your workspace&apos;s WhatsApp number with your approved reminder template and a View and pay button. The wording follows the template.</span>
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-white">Message</span>
              <Textarea rows={5} value={message} onChange={(e) => { setMessage(e.target.value); setOpened(false) }} />
              <span className="block text-xs text-fg-2">Open WhatsApp to send it from your phone or desktop, then record it here so the chase history stays complete.</span>
            </label>
          )}
        </div>
      )}
    </Dialog>
  )
}
