'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { placeInColumn, planBoardDrop } from '@/lib/kanban-order'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'

export type KanbanColumn = { id: string; title: string; /** Shown next to the count, e.g. a ₹ total. */ meta?: ReactNode }
export type KanbanItem = { id: string; columnId: string }

export type KanbanProps<T extends KanbanItem> = {
  columns: KanbanColumn[]
  items: T[]
  renderItem: (item: T, state: { dragging: boolean }) => ReactNode
  /**
   * Persist a move. `toIndex` is the position inside the target column.
   * Return false (or throw) to put the card back.
   */
  onMove: (itemId: string, toColumnId: string, toIndex: number) => Promise<boolean | void> | boolean | void
  /** Footer per column (e.g. a quick-add button). */
  columnFooter?: (column: KanbanColumn) => ReactNode
  /** Disable dragging (read-only users). */
  disabled?: boolean
  className?: string
  /** Empty column hint. */
  emptyLabel?: string
}

const ACTIVATION_DISTANCE = 6
/**
 * Touch: a finger scrolls the board (both ways) until it rests on a card for TOUCH_DELAY_MS; moving more than
 * TOUCH_TOLERANCE_PX during that press cancels the drag and lets the scroll win.
 */
const TOUCH_DELAY_MS = 200
const TOUCH_TOLERANCE_PX = 8
/** Mouse travel before a press on empty board space turns into a pan (a plain click stays a click). */
const PAN_THRESHOLD_PX = 4
/** Presses on these keep their own behaviour instead of panning the board. */
const PAN_IGNORE = '[data-kanban-card], a, button, input, textarea, select, label, [contenteditable], [role="button"]'

/**
 * Mouse drag on empty board space (column background, headers, gaps) pans it sideways, like Trello.
 * Touch already scrolls natively, so this is mouse-only.
 */
function usePanScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const [panning, setPanning] = useState(false)

  const onMouseDown = (e: ReactMouseEvent) => {
    const board = ref.current
    const target = e.target as HTMLElement
    // React events bubble out of portals (menus, dialogs), so make sure the press is really on the board.
    if (!board || e.button !== 0 || !board.contains(target) || target.closest(PAN_IGNORE)) return
    if (board.scrollWidth <= board.clientWidth) return
    const startX = e.clientX
    const startLeft = board.scrollLeft
    let moved = false
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      if (!moved) {
        if (Math.abs(dx) < PAN_THRESHOLD_PX) return
        moved = true
        setPanning(true)
      }
      board.scrollLeft = startLeft - dx
      window.getSelection()?.removeAllRanges()
    }
    const stop = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      setPanning(false)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
  }

  return { ref, onMouseDown, panning }
}

/**
 * Drag-and-drop board (tasks by status, deals by stage). Keeps its own
 * optimistic order and re-syncs when `items` change from the server.
 */
export function Kanban<T extends KanbanItem>({ columns, items, renderItem, onMove, columnFooter, disabled, className, emptyLabel = 'Drop cards here' }: KanbanProps<T>) {
  const [local, setLocal] = useState<T[]>(items)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [origin, setOrigin] = useState<T[] | null>(null)
  /** Set for one frame after a card jumps columns, so the layout shift can't bounce it back. */
  const justMoved = useRef(false)
  const { ref: boardRef, onMouseDown: onPanStart, panning } = usePanScroll()

  useEffect(() => setLocal(items), [items])
  useEffect(() => {
    const frame = requestAnimationFrame(() => (justMoved.current = false))
    return () => cancelAnimationFrame(frame)
  }, [local])

  const dndId = useId()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byColumn = useMemo(() => {
    const map = new Map<string, T[]>(columns.map((c) => [c.id, []]))
    for (const item of local) map.get(item.columnId)?.push(item)
    return map
  }, [columns, local])

  const columnOf = (id: string): string | undefined => (columns.some((c) => c.id === id) ? id : local.find((i) => i.id === id)?.columnId)

  /**
   * Pointer first: the column under the pointer wins (anywhere in it, header and
   * footer included), then the nearest card inside that column. Corner maths
   * alone let a card in the next column beat a tall, mostly empty column.
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const columnIds = new Set(columns.map((c) => c.id))
      const columnTargets = args.droppableContainers.filter((c) => columnIds.has(String(c.id)))
      const underPointer = pointerWithin({ ...args, droppableContainers: columnTargets })
      const column = getFirstCollision(underPointer.length ? underPointer : rectIntersection({ ...args, droppableContainers: columnTargets }), 'id')
      if (column != null) {
        const cards = new Set((byColumn.get(String(column)) ?? []).map((i) => i.id))
        const cardTargets = args.droppableContainers.filter((c) => cards.has(String(c.id)))
        const overId = cardTargets.length ? (closestCenter({ ...args, droppableContainers: cardTargets })[0]?.id ?? column) : column
        return [{ id: overId }]
      }
      // Mid column-jump: stay on the card itself so the layout shift can't flicker the target away.
      if (justMoved.current && activeId) return [{ id: activeId }]
      // Off the board: no target, so the card goes back where it started.
      return []
    },
    [columns, byColumn, activeId],
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setOrigin(local)
    play('click')
  }

  /**
   * Into another column: drop the placeholder at the hovered slot, so the preview matches the drop.
   * Off the board: put it back home, so the preview shows the card returning.
   */
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) {
      if (origin) setLocal(origin)
      return
    }
    const from = columnOf(String(active.id))
    const to = columnOf(String(over.id))
    if (!from || !to || from === to) return
    const target = byColumn.get(to) ?? []
    const overIndex = target.findIndex((i) => i.id === over.id)
    const dragged = active.rect.current.translated
    const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
    const index = overIndex === -1 ? target.length : overIndex + (below ? 1 : 0)
    justMoved.current = true
    setLocal((prev) => placeInColumn(prev, String(active.id), to, index))
  }

  const onDragCancel = () => {
    setActiveId(null)
    if (origin) setLocal(origin)
    setOrigin(null)
  }

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    const snapshot = origin ?? items
    setOrigin(null)
    if (!over) {
      setLocal(snapshot)
      return
    }
    const id = String(active.id)
    const to = columnOf(String(over.id))
    if (!to) {
      setLocal(snapshot)
      return
    }
    const drop = planBoardDrop(local, snapshot, id, String(over.id), to)
    if (!drop) return
    const { items: reordered, toIndex, unchanged } = drop
    setLocal(reordered)
    if (unchanged) return
    play('toggle')
    try {
      const result = await onMove(id, to, toIndex)
      if (result === false) setLocal(snapshot)
    } catch {
      play('error')
      setLocal(snapshot)
    }
  }

  const active = activeId ? local.find((i) => i.id === activeId) : undefined

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div ref={boardRef} onMouseDown={onPanStart} className={cn('flex gap-4 overflow-x-auto pb-4', panning &&'select-none [&_*]:cursor-grabbing! cursor-grabbing', className)}>
        {columns.map((col) => (
          // The dragged card already lives in the hovered column, so its column is the drop target.
          <Column key={col.id} column={col} count={byColumn.get(col.id)?.length ?? 0} footer={columnFooter?.(col)} emptyLabel={emptyLabel} target={active?.columnId === col.id}>
            <SortableContext items={(byColumn.get(col.id) ?? []).map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {(byColumn.get(col.id) ?? []).map((item) => (
                <SortableCard key={item.id} id={item.id} disabled={disabled}>
                  {renderItem(item, { dragging: item.id === activeId })}
                </SortableCard>
              ))}
            </SortableContext>
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22,1,0.36,1)' }}>
        {active ? <div className="rotate-2 scale-[1.02] cursor-grabbing opacity-95 shadow-pop">{renderItem(active, { dragging: true })}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ column, count, children, footer, emptyLabel, target }: { column: KanbanColumn; count: number; children: ReactNode; footer?: ReactNode; emptyLabel: string; target: boolean }) {
  // The whole column (header and footer too) is the drop zone.
  const { setNodeRef } = useDroppable({ id: column.id })
  return (
    <section ref={setNodeRef} className={cn('card-solid flex w-[290px] shrink-0 flex-col p-3 transition-[background,box-shadow]', target && 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]')}>
      <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
        <h3 className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.04em] text-fg">{column.title}</h3>
        <span className="rounded-full bg-control px-2 text-xs tabular-nums text-fg-2">{count}</span>
        {column.meta ? <span className="ml-auto whitespace-nowrap text-xs text-fg-2">{column.meta}</span> : null}
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {children}
        {count === 0 ? <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-white/[0.14] py-6 text-[13px] text-fg-2">{emptyLabel}</div> : null}
      </div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </section>
  )
}

function SortableCard({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      data-kanban-card
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation [-webkit-touch-callout:none] touch:select-none', !disabled && 'cursor-grab active:cursor-grabbing', isDragging && 'opacity-30')}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

/** Default card look for board items. */
export function KanbanCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[10px] border border-white/[0.1] bg-[#1d1d1f] p-3 transition-colors hover:border-white/[0.22]', className)}>{children}</div>
}

const stopDrag = (e: { stopPropagation: () => void }) => e.stopPropagation()

/** Spread on a link or button inside a card so pressing it never starts a drag (mouse or touch). */
export const noDrag = { onMouseDown: stopDrag, onTouchStart: stopDrag, onPointerDown: stopDrag }
