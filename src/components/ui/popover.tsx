'use client'

import * as RP from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

/**
 * Floating panel anchored to a trigger (filters, pickers).
 * `modal`: for scrolling content that can open inside a Dialog. The portalled panel sits outside the dialog, so the
 * dialog's scroll lock eats wheel/touch scrolling on it; a modal popover takes its own lock and scrolls again.
 */
export function Popover({ trigger, children, align = 'start', className, open, onOpenChange, modal }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; modal?: boolean }) {
  return (
    <RP.Root
      modal={modal}
      open={open}
      onOpenChange={(next) => {
        if (next) play('pop')
        onOpenChange?.(next)
      }}
    >
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content align={align} sideOffset={8} collisionPadding={12} className={cn('z-50 max-h-[var(--radix-popover-content-available-height)] w-72 overflow-y-auto overscroll-contain rounded-[10px] border border-white/[0.12] bg-menu p-4 shadow-pop focus:outline-none data-[state=open]:animate-scale-in', className)}>
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  )
}

export const PopoverClose = RP.Close
