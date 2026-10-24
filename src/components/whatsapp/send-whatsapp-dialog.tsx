'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Send } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/settings/surface'
import { previewDocWhatsAppAction, sendDocWhatsAppAction } from '@/modules/whatsapp/doc-actions'
import type { DocWhatsAppDraft } from '@/modules/whatsapp/doc-send'
import type { DocKind } from '@/modules/doclinks/token'
import { useWhatsAppOn } from '@/components/shell/shell-context'

type Props = { kind: DocKind; id: string; title: string; label?: string }

/**
 * Send a Folio document on WhatsApp from the workspace's own number: the
 * number is prefilled from the client's billing contacts (editable), the
 * template is shown filled in, the PDF goes as the header and the online
 * link as the button, and the cost is shown before sending.
 */
/** Nothing while the platform WhatsApp flag is off (lib/feature-flags). */
export function SendWhatsAppDialog(props: Props) {
  return useWhatsAppOn() ? <SendWhatsAppDialogBody {...props} /> : null
}

function SendWhatsAppDialogBody({ kind, id, title, label = 'WhatsApp' }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DocWhatsAppDraft | null>(null)
  const [to, setTo] = useState('')
  const [send, sending] = useAction(sendDocWhatsAppAction, { onDone: () => setOpen(false) })

  const load = async () => {
    setDraft(null)
    try {
      const res = await previewDocWhatsAppAction({ kind, id })
      if (!res.ok || !res.data) {
        toast.error(res.ok ? 'Could not prepare the message.' : res.error)
        setOpen(false)
        return
      }
      setDraft(res.data)
      setTo(res.data.to)
    } catch {
      toast.error('Could not prepare the message. Check your connection and try again.')
      setOpen(false)
    }
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void load()
  }

  const footer = draft?.connected ? (
    <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={!to.trim()} onClick={() => void send({ kind, id, to })}>
      Send on WhatsApp
    </Button>
  ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={title} description="Sent from your workspace's WhatsApp number, with the PDF and a button to view it online." trigger={<Button variant="secondary" size="sm" icon={<MessageCircle className="size-4" />}>{label}</Button>} footer={footer}>
      {!draft ? (
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-28 animate-pulse rounded-[14px] bg-white/[0.06]" />
        </div>
      ) : !draft.connected ? (
        <Notice tone="info" action={<Link href="/app/settings/integrations/whatsapp" className="text-xs text-link hover:underline">Connect WhatsApp</Link>}>
          WhatsApp is not connected for this workspace yet. Email the document instead, or connect your own Interakt account.
        </Notice>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-white">To</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} inputMode="tel" placeholder="+91 98765 43210" aria-label="WhatsApp number" />
            <span className="block text-xs text-fg-2">A 10-digit number is taken as Indian (+91). For other countries type + and the country code.</span>
          </label>
          {draft.recipients.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {draft.recipients.map((r) => (
                <button key={r.id} type="button" onClick={() => setTo(r.phone)} className="rounded-full border border-line px-3 py-1 text-xs text-fg-2 hover:border-white/30 hover:text-white">{r.name} · {r.phone}</button>
              ))}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-white">Message</span>
            <p className="whitespace-pre-wrap rounded-[14px] bg-white/[0.04] p-3 text-sm text-fg-2 ring-1 ring-inset ring-white/10">{draft.preview}</p>
            <span className="block text-xs text-fg-2">The PDF is attached and a button opens the document online. The words come from your approved template.</span>
          </div>
          {draft.costText ? <p className="text-xs text-fg-2">Cost: {draft.costText}</p> : null}
        </div>
      )}
    </Dialog>
  )
}
