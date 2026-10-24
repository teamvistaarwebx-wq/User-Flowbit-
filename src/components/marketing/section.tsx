import type { ReactNode } from 'react'
import { SectionLabel } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Reveal } from './reveal'

type SectionProps = {
  id?: string
  label?: string
  icon?: ReactNode
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
  /** Centre the heading block. */
  center?: boolean
}

/**
 * A marketing section: heading, lead paragraph, content. Reveals on scroll.
 * `label` is a fallback heading for sections without a `title`; it is not shown
 * as an eyebrow above a title (one heading per section).
 */
export function Section({ id, label, icon, title, description, children, className, center }: SectionProps) {
  return (
    <section id={id} className={cn('relative scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24', className)}>
      <div className="mx-auto max-w-6xl">
        {label || title || description ? (
          <Reveal className={cn('mb-10 max-w-3xl sm:mb-12', center && 'mx-auto text-center')}>
            {label && !title ? <SectionLabel icon={icon} className={cn(center && 'justify-center')}>{label}</SectionLabel> : null}
            {title ? <h2 className="text-balance text-3xl font-semibold leading-tight text-white sm:text-[40px] sm:leading-[48px]">{title}</h2> : null}
            {description ? <p className="mt-4 text-pretty text-base leading-relaxed text-white/75 sm:text-[17px]">{description}</p> : null}
          </Reveal>
        ) : null}
        {children}
      </div>
    </section>
  )
}
