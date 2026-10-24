'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sendOrbitWhatsAppAction } from '@/modules/orbit/whatsapp-actions'
import { WhatsappIcon } from './brand-icons'

const PILL = 'inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.18] bg-control px-3 text-xs text-white transition-colors hover:border-white/30'

type Target = { leadId?: string; clientId?: string; contactId?: string }

/**
 * Orbit's WhatsApp button: with the workspace's own number connected it
 * sends the approved hello/follow-up template (logged as a DM); otherwise it
 * opens WhatsApp (wa.me) to write by hand.
 */
export function OrbitWhatsAppButton({ connected, href, target, name }: { connected: boolean; href: string | null; target: Target; name: string }) {
  if (!connected) return href ? <a href={href} target="_blank" rel="noreferrer" className={PILL}><WhatsappIcon size={14} />WhatsApp</a> : null
  return (
    <ConfirmDialog
      trigger={<button type="button" className={PILL}><WhatsappIcon size={14} />WhatsApp</button>}
      title={`Send ${name} a WhatsApp?`}
      description="Your approved hello / follow-up template goes from your workspace's WhatsApp number and is logged as a DM. To write your own words, wait for their reply: free text is allowed for 24 hours after they write."
      confirmLabel="Send"
      tone="primary"
      onConfirm={() => sendOrbitWhatsAppAction(target)}
    />
  )
}
