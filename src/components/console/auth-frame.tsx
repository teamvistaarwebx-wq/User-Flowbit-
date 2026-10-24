import type { ReactNode } from 'react'
import { Logo } from '@/components/ui/logo'

/** The Console's sign-in card: the app's glass on the dark background, no product chrome. */
export function ConsoleAuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass w-full max-w-[420px] rounded-[16px] p-7">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={28} />
          <span aria-hidden className="h-5 w-px bg-line" />
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-white/70">Console</span>
        </div>
        <h1 className="text-xl font-medium text-white">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-fg-2">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
