'use client'

import * as RM from '@radix-ui/react-dropdown-menu'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type MenuItem =
  | { type?: 'item'; label: ReactNode; icon?: ReactNode; onSelect?: () => void; href?: string; danger?: boolean; disabled?: boolean; shortcut?: string }
  | { type: 'separator' }
  | { type: 'label'; label: ReactNode }

export const menuContentClass = 'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[200px] overflow-y-auto overscroll-contain rounded-[10px] border border-white/[0.12] bg-menu p-1 shadow-pop data-[state=open]:animate-scale-in'
export const menuItemClass = 'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[7px] px-3 text-sm text-fg outline-none transition-colors data-[highlighted]:bg-white/[0.07] data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-2'

/** Dropdown menu from a list of items. `trigger` is rendered asChild (pass a button). */
export function DropdownMenu({ trigger, items, align = 'end', className, header }: { trigger: ReactNode; items: MenuItem[]; align?: 'start' | 'center' | 'end'; className?: string; header?: ReactNode }) {
  return (
    <RM.Root onOpenChange={(open) => open && play('pop')}>
      <RM.Trigger asChild>{trigger}</RM.Trigger>
      <RM.Portal>
        <RM.Content align={align} sideOffset={8} collisionPadding={12} className={cn(menuContentClass, className)}>
          {header}
          {items.map((item, i) => {
            if (item.type === 'separator') return <RM.Separator key={i} className="my-1 h-px bg-white/[0.08]" />
            if (item.type === 'label') return <RM.Label key={i} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">{item.label}</RM.Label>
            const cls = cn(menuItemClass, item.danger && 'text-[#FF6A66] data-[highlighted]:bg-danger/10 [&_svg]:text-[#FF6A66]')
            const inner = (
              <>
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.shortcut ? <kbd className="text-[11px] text-fg-3">{item.shortcut}</kbd> : null}
              </>
            )
            return item.href ? (
              <RM.Item key={i} asChild disabled={item.disabled}>
                <Link href={item.href} className={cls}>
                  {inner}
                </Link>
              </RM.Item>
            ) : (
              <RM.Item
                key={i}
                disabled={item.disabled}
                className={cls}
                onSelect={() => {
                  play('click')
                  item.onSelect?.()
                }}
              >
                {inner}
              </RM.Item>
            )
          })}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  )
}

export const DropdownPrimitive = RM
