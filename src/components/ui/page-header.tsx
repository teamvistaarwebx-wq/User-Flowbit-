import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Crumb } from '@/lib/catalog'
import type { ConceptKey } from '@/lib/explainers'
import { InfoTip } from './info-tip'

export type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Trail above the title; the last crumb is the current page. */
  breadcrumb?: Crumb[]
  /** Small "back" link above the title. */
  back?: { href: string; label: string }
  actions?: ReactNode
  /** Extra row under the title (tabs, filters). */
  children?: ReactNode
  icon?: ReactNode
  /** A "?" next to the title that explains the page's concept (lib/explainers). */
  help?: ConceptKey
  className?: string
}

/** Page title row in the dashboard greeting's style (20/500): optional back link, title + one line, actions on the right. */
export function PageHeader({ title, description, breadcrumb, back, actions, children, icon, help, className }: PageHeaderProps) {
  return (
    <header data-tour="page-header" className={cn('mb-7 animate-slide-up', className)}>
      {breadcrumb && breadcrumb.length > 1 ? (
        // The top bar carries the full trail from `sm` up; below that it shows only the last crumb.
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-fg-2 sm:hidden">
          {breadcrumb.map((c, i) => (
            <span key={`${c.href}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3" /> : null}
              {i < breadcrumb.length - 1 ? (
                <Link href={c.href} className="hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span className="text-fg">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] text-fg-2 transition-colors hover:text-fg">
          <ChevronLeft className="size-3.5" /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <span className="shrink-0 self-start pt-0.5 text-fg [&_svg]:size-5">{icon}</span> : null}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-xl font-medium leading-7 text-fg">{title}</h1>
              {help ? <InfoTip concept={help} /> : null}
            </div>
            {description ? <p className="mt-1 text-sm text-white/70">{description}</p> : null}
          </div>
        </div>
        {/* A long action row drops below the title and wraps there, instead of squeezing the title. */}
        {actions ? <div data-tour="page-actions" className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  )
}
