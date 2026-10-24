'use client'

import * as RD from '@radix-ui/react-dialog'
import { ChevronDown, ChevronUp, Keyboard, Maximize2, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from '@/lib/toast'
import { IconButton } from '@/components/ui/button'
import { useTaskPatch } from '../detail/use-patch'
import { ShortcutSheet } from './shortcut-sheet'
import { EDIT_TITLE_EVENT, neighbourTask } from './task-order'

export type TaskPanelShellProps = {
  taskId: string
  /** "VW-42 · Logo files", for the dialog's accessible name. */
  label: string
  me?: string
  assigneeIds?: string[]
  canEdit?: boolean
  children: ReactNode
}

/** Typing in a field: single-letter shortcuts and Esc belong to the field. */
function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/** Another layer is open over the panel (a dialog, menu, popover or select): its keys come first. */
const layerOpen = () => Boolean(document.querySelector('[role="dialog"][data-state="open"]:not([data-task-panel]), [role="alertdialog"], [data-radix-popper-content-wrapper]'))

/**
 * The task side panel (ClickUp/Linear style): a right-hand panel over the list, full screen on phones.
 * Non-modal, so the list stays usable behind it. Esc closes; J/K step through the list on screen;
 * E edits the title; M assigns the task to me; ? lists the shortcuts.
 */
export function TaskPanelShell({ taskId, label, me, assigneeIds = [], canEdit = false, children }: TaskPanelShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const content = useRef<HTMLDivElement>(null)
  const [help, setHelp] = useState(false)
  const [patch] = useTaskPatch(taskId)

  const close = useCallback(() => router.back(), [router])
  const step = useCallback(
    (dir: 1 | -1) => {
      const next = neighbourTask(taskId, dir)
      if (next) router.replace(`/app/work/tasks/${next}`, { scroll: false })
      else toast.info(dir === 1 ? 'That was the last task in this list' : 'That was the first task in this list')
    },
    [router, taskId],
  )
  const assignMe = useCallback(() => {
    if (!canEdit || !me) return toast.error("You can't edit this task")
    if (assigneeIds.includes(me)) return toast.info('Already assigned to you')
    void patch({ assigneeIds: [...assigneeIds, me] })
  }, [assigneeIds, canEdit, me, patch])

  // A parallel slot keeps its last page on soft navigation: once the URL is no longer this task, the panel is closed.
  const isOpen = pathname === `/app/work/tasks/${taskId}`

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement) || layerOpen()) return
      const actions: Record<string, () => void> = {
        j: () => step(1),
        k: () => step(-1),
        e: () => window.dispatchEvent(new CustomEvent(EDIT_TITLE_EVENT, { detail: taskId })),
        m: assignMe,
        '?': () => setHelp(true),
      }
      const run = actions[e.key.toLowerCase()] ?? actions[e.key]
      if (!run) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [assignMe, isOpen, step, taskId])

  if (!isOpen) return null
  return (
    <RD.Root open modal={false} onOpenChange={(open) => !open && close()}>
      <RD.Portal>
        <RD.Content
          ref={content}
          data-task-panel=""
          aria-describedby={undefined}
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            content.current?.focus()
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // The list behind stays usable: clicking another task opens it here instead of closing the panel.
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (isTyping(document.activeElement)) e.preventDefault()
          }}
          className="fixed inset-0 z-50 flex flex-col bg-panel focus:outline-none md:left-auto md:w-[min(1080px,calc(100vw-104px))] md:border-l md:border-line md:shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.9)] motion-safe:animate-slide-in-right"
        >
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3 sm:px-4">
            <IconButton label="Previous task (K)" size="sm" onClick={() => step(-1)}><ChevronUp className="size-4" /></IconButton>
            <IconButton label="Next task (J)" size="sm" onClick={() => step(1)}><ChevronDown className="size-4" /></IconButton>
            <RD.Title className="ml-2 min-w-0 flex-1 truncate text-[13px] font-medium text-fg-2">{label}</RD.Title>
            <IconButton label="Keyboard shortcuts (?)" size="sm" onClick={() => setHelp(true)} className="hidden sm:inline-flex"><Keyboard className="size-4" /></IconButton>
            {/* A plain link: a full page load shows the task page instead of this panel. */}
            <a href={`/app/work/tasks/${taskId}`} aria-label="Open full page" title="Open full page" className="press inline-flex size-8 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-white/[0.07] hover:text-white">
              <Maximize2 className="size-4" />
            </a>
            <RD.Close asChild>
              <IconButton label="Close (Esc)" size="sm"><X className="size-4" /></IconButton>
            </RD.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </RD.Content>
      </RD.Portal>
      <ShortcutSheet open={help} onOpenChange={setHelp} />
    </RD.Root>
  )
}
