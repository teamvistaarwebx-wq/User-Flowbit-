import type { ReactNode } from 'react'
import { Note } from '../ui/note'

/** What is blocking, what to do next: the neutral Muster note, the tone carried by the icon alone. */
export function Callout({ tone = 'info', title, children, action, className }: { tone?: 'info' | 'warning' | 'danger'; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Note tone={tone} title={title} action={action} className={className}>
      {children}
    </Note>
  )
}
