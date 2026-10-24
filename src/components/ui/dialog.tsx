'use client'

import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type DialogProps = {
  /** Element that opens the dialog (rendered with asChild, so pass a Button). */
  trigger?: ReactNode
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Buttons row at the bottom. */
  footer?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/**
 * Phones (below 640px): a bottom sheet instead of a centred card. Full width, rounded top only, at most 90dvh with
 * the body scrolling inside, clear of the iPhone home bar. Desktop keeps the centred card.
 */
const SHEET_BELOW_SM =
  'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:max-h-[90dvh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:px-5 max-sm:pt-5 max-sm:pb-[calc(20px+env(safe-area-inset-bottom))] max-sm:data-[state=open]:animate-sheet-up'

/** Centered glass dialog (a bottom sheet on phones) (the sign-in card material, radius 16) over a 55% scrim. Plays `pop` on open. */
export function Dialog({ trigger, title, description, children, footer, open, onOpenChange, size = 'md', className }: DialogProps) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const setOpen = (next: boolean) => {
    if (next) play('pop')
    if (open === undefined) setInner(next)
    onOpenChange?.(next)
  }
  return (
    <RD.Root open={isOpen} onOpenChange={setOpen}>
      {trigger ? <RD.Trigger asChild>{trigger}</RD.Trigger> : null}
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-fade-in" />
        <RD.Content
          className={cn(
            'glass-hero lit-edge fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden [--hero-fill:rgba(30,30,30,0.82)] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] focus:outline-none data-[state=open]:animate-scale-in',
            SIZES[size],
            SHEET_BELOW_SM,
            className,
          )}
        >
          <div className="mb-6 flex shrink-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <RD.Title className="text-lg font-semibold text-fg">{title}</RD.Title>
              {description ? <RD.Description className="mt-1 text-sm text-fg-2">{description}</RD.Description> : <RD.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RD.Description>}
            </div>
            <RD.Close className="hit-area relative -mr-2 -mt-1 rounded-full p-2 text-fg-2 transition-colors hover:bg-white/[0.07] hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </RD.Close>
          </div>
          {/*
            The body scrolls, not the card: the lit edge is an inset:0 ::before on the card, and in a scrolling box it
            scrolled with the content, drawing its bottom edge across the form. -m-1 p-1 keeps focus rings unclipped.
          */}
          <div className="-m-1 min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {children}
            {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

/** Wrap a button to close the surrounding Dialog/Sheet. */
export const DialogClose = RD.Close
