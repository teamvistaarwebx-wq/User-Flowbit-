import { Armchair, Coffee, Moon, Pause, Utensils, type LucideIcon } from 'lucide-react'
import { BREAK_ICON, type BreakKey } from '@/lib/break-types'

const ICONS: Readonly<Record<(typeof BREAK_ICON)[BreakKey], LucideIcon>> = { Utensils, Moon, Coffee, Armchair, Pause }

/** The simple Lucide icon of a break type (lib/break-types BREAK_ICON). */
export function BreakIcon({ type, className = 'size-4' }: { type: BreakKey; className?: string }) {
  const Icon = ICONS[BREAK_ICON[type]]
  return <Icon className={className} strokeWidth={1.5} aria-hidden />
}
