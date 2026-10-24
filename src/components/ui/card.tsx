import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  padded?: boolean
  /**
   * 'glass' (default): translucent with a lit hairline, as Project overview.
   * 'solid': opaque #27272B, as My attendance and in-app forms. 'table': the Assign-to-me surface for lists.
   */
  variant?: 'glass' | 'solid' | 'table'
}

const VARIANT = { glass: 'glass', solid: 'card-solid', table: 'card-table' } as const

/** Content card (radius 12). `interactive` adds hover lift. */
export function Card({ className, interactive, padded = true, variant = 'glass', ...props }: CardProps) {
  return <div className={cn(VARIANT[variant], padded && 'p-5', interactive && 'lift', className)} {...props} />
}

/** Uppercase section label with a small white icon before it ("PROJECT OVERVIEW", 14/600, 0.04em). */
export function SectionLabel({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('section-label flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg', className)}>
      {icon}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/**
 * Card heading row: a section label (with an optional one-line subtitle under it, as "ASSIGN TO ME /
 * Showing all tasks assigned to me") OR a title, with actions on the right.
 */
export function CardHeader({ label, icon, title, description, actions, className }: { label?: ReactNode; icon?: ReactNode; title?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    // Wraps: on a narrow card the actions drop under the title instead of squeezing it into a column of words.
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-[1_1_12rem]">
        {label ? <SectionLabel icon={icon}>{label}</SectionLabel> : null}
        {title ? (
          <h3 className={cn('flex items-center gap-2 text-lg font-semibold text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg', label && 'mt-1')}>
            {!label ? icon : null}
            <span className="min-w-0">{title}</span>
          </h3>
        ) : null}
        {description ? <p className="mt-0.5 text-[13px] text-fg-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
