'use client'

import { Dialog } from '@/components/ui/dialog'

export const PANEL_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['J'], label: 'Next task in the list' },
  { keys: ['K'], label: 'Previous task in the list' },
  { keys: ['E'], label: 'Edit the title' },
  { keys: ['M'], label: 'Assign to me' },
  { keys: ['Esc'], label: 'Close the panel' },
  { keys: ['?'], label: 'Show these shortcuts' },
]

/** The task panel's keyboard shortcuts (opened with ?). */
export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="In the task panel, when you are not typing in a field." size="sm">
      <dl className="divide-y divide-line">
        {PANEL_SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-white">{s.label}</dt>
            <dd className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-white/[0.14] bg-control px-1.5 font-sans text-xs text-white">{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}
