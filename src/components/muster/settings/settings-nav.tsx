import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type SettingsSection = { label: string; items: { key: string; href: string; label: string; icon: ReactNode }[] }

/**
 * Settings sections in the side panel's style (DESIGN 12): 12/600 uppercase group labels, 14/400 items with
 * 14px muted icons at a 26px pitch. The open section gets a soft fill and a white inset on the left.
 */
export function SettingsNav({ sections, active }: { sections: SettingsSection[]; active: string }) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-5 lg:sticky lg:top-4">
      {sections.map((s) => (
        <div key={s.label}>
          <p className="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-white">{s.label}</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0">
            {s.items.map((i) => {
              const on = i.key === active
              return (
                <li key={i.key}>
                  <Link
                    href={i.href}
                    scroll={false}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex h-[30px] items-center gap-2.5 rounded-[8px] px-2.5 text-sm transition-colors duration-150 [&_svg]:size-3.5 [&_svg]:shrink-0',
                      on ? 'bg-white/[0.07] text-white shadow-[inset_2px_0_0_rgba(255,255,255,0.7)] [&_svg]:text-white' : 'text-white/85 hover:bg-white/[0.04] hover:text-white [&_svg]:text-icon-muted',
                    )}
                  >
                    {i.icon}
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
