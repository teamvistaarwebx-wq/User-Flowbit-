import Link from 'next/link'
import { Zap } from 'lucide-react'
import { canOpenPage, type PageViewer } from '@/lib/catalog'

/**
 * Flowbit has three things that send messages on a schedule (audit A5). Each page says in one line what it is
 * and links to the other two, so an admin can find where a given reminder comes from.
 */
const ENGINES = {
  automations: { label: 'Automations', href: '/app/settings/automations', what: 'Automations are workspace rules: when something happens, Flowbit sends a message, alerts someone, posts or adds a task.' },
  reminders: { label: 'Folio reminders', href: '/app/folio/settings?tab=reminders', what: 'Folio reminders chase unpaid invoices by email (and WhatsApp) on the days you pick, before and after the due date.' },
  sequences: { label: 'Orbit sequences', href: '/app/orbit/sequences', what: 'Orbit sequences run up to five follow-up steps for the leads you enrol, one lead at a time.' },
} as const
export type EngineKey = keyof typeof ENGINES

export function EngineNote({ current, viewer, className }: { current: EngineKey; viewer: PageViewer; className?: string }) {
  const others = (Object.keys(ENGINES) as EngineKey[]).filter((k) => k !== current && canOpenPage(ENGINES[k].href.split('?')[0], viewer))
  return (
    <p className={className ?? 'mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-fg-2'}>
      <Zap aria-hidden className="size-3.5 shrink-0 text-icon-muted" strokeWidth={1.5} />
      <span>{ENGINES[current].what}</span>
      {others.length ? (
        <span>
          Also sending on a schedule:{' '}
          {others.map((k, i) => (
            <span key={k}>
              {i ? ' and ' : ''}
              <Link href={ENGINES[k].href} className="text-fg underline-offset-2 hover:underline">
                {ENGINES[k].label}
              </Link>
            </span>
          ))}
          .
        </span>
      ) : null}
    </p>
  )
}
