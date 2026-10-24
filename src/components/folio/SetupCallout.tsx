import type { ReactNode } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { Note } from './ui'

/** "Set up a billing entity first": shown on every Folio page until an entity exists. A solid card, no tint. */
export function SetupCallout({ canSetUp }: { canSetUp: boolean }) {
  return (
    <section className="card-solid mb-5 flex flex-col gap-4 rounded-[12px] px-[23px] py-[18px] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 size-5 shrink-0 text-icon-muted" strokeWidth={1.5} />
        <div>
          <p className="text-sm font-medium text-white">Set up your firm first</p>
          <p className="mt-0.5 max-w-xl text-[13px] text-fg-2">Add the business you bill from. A GST-registered business issues tax invoices; an unregistered one issues sale invoices with no tax.</p>
        </div>
      </div>
      {canSetUp ? (
        <Link href="/app/folio/settings?tab=entities" className={buttonClass('primary', 'md', 'shrink-0')}>Open Folio settings</Link>
      ) : (
        <p className="shrink-0 text-[13px] text-fg-2">Ask finance or an admin to add one.</p>
      )}
    </section>
  )
}

/**
 * A notice line (draft, overdue, void reason). Kept for the existing callers; it now draws the quiet Note:
 * the #171717 control surface with only the icon carrying the tone.
 */
export function Callout({ tone = 'info', title, children, action, className }: { tone?: 'info' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Note tone={tone} title={title} action={action} className={cn(className)}>
      {children}
    </Note>
  )
}
