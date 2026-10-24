'use client'

import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type SheetProps = {
  trigger?: ReactNode
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'right' | 'left' | 'bottom'
  className?: string
}

const SIDES = {
  right: 'inset-y-0 right-0 h-full w-[min(520px,100vw)] border-l data-[state=open]:animate-slide-in-right',
  left: 'inset-y-0 left-0 h-full w-[min(320px,88vw)] border-r data-[state=open]:animate-[slide-in-left_240ms_cubic-bezier(0.22,1,0.36,1)]',
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-[16px] border-t data-[state=open]:animate-slide-up',
}

/** Drawer from the side or bottom (filters, quick create, mobile side panel). */
export function Sheet({ trigger, title, description, children, footer, open, onOpenChange, side = 'right', className }: SheetProps) {
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
        <RD.Content className={cn('fixed z-50 flex flex-col border-line bg-panel shadow-[0_0_60px_-20px_rgba(0,0,0,0.9)] focus:outline-none', SIDES[side], className)}>
          {title ? (
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <RD.Title className="text-lg font-semibold text-fg">{title}</RD.Title>
                {description ? <RD.Description className="mt-0.5 text-sm text-fg-2">{description}</RD.Description> : null}
              </div>
              <RD.Close className="hit-area relative rounded-full p-2 text-fg-2 hover:bg-white/[0.07] hover:text-fg" aria-label="Close">
                <X className="size-4" />
              </RD.Close>
            </div>
          ) : (
            <RD.Title className="sr-only">Panel</RD.Title>
          )}
          {!description ? <RD.Description className="sr-only">Panel content</RD.Description> : null}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
