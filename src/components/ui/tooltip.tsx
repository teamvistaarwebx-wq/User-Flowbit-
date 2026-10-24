'use client'

import * as RT from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

/** Wrap the app once (the shell does). */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={250} skipDelayDuration={100}>
    {children}
  </RT.Provider>
)

/** Small dark tooltip. `children` is the trigger (asChild). */
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content side={side} sideOffset={8} className="z-50 rounded-[7px] border border-white/[0.12] bg-menu px-2.5 py-1.5 text-xs text-fg shadow-pop data-[state=delayed-open]:animate-fade-in">
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}
