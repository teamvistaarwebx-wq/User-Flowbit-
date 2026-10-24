'use client'

import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { useAction } from '@/components/ui/action-form'
import { markWhatsAppSentAction } from '@/modules/folio/collections/actions'

/** "Open WhatsApp" and "Mark sent" for a reminder the automatic run queued for a person to send. */
export function WhatsAppQueueActions({ messageId, link, canAct }: { messageId: string; link: string | null; canAct: boolean }) {
  const [mark, pending] = useAction(markWhatsAppSentAction)
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
          <ExternalLink className="size-3.5" /> Open WhatsApp
        </a>
      ) : (
        <span className="text-xs text-fg-2">Number is too short for WhatsApp</span>
      )}
      {canAct ? (
        <Button size="sm" variant="secondary" icon={<Check className="size-4" />} loading={pending} onClick={() => mark({ messageId })}>
          Mark sent
        </Button>
      ) : null}
    </div>
  )
}
