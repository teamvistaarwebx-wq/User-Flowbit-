import { describe, expect, it } from 'vitest'
import { placeInColumn, planBoardDrop } from './kanban-order'

const board = [
  { id: 'a', columnId: 'todo' },
  { id: 'b', columnId: 'todo' },
  { id: 'c', columnId: 'todo' },
  { id: 'x', columnId: 'done' },
]
const order = (items: { id: string; columnId: string }[], column: string) => items.filter((i) => i.columnId === column).map((i) => i.id)

describe('planBoardDrop', () => {
  it('moves a card down one slot when dropped on the card below it', () => {
    const drop = planBoardDrop(board, board, 'a', 'b', 'todo')
    expect(drop?.toIndex).toBe(1)
    expect(drop?.unchanged).toBe(false)
    expect(order(drop!.items, 'todo')).toEqual(['b', 'a', 'c'])
  })

  it('moves a card down two slots when dropped two cards below', () => {
    const drop = planBoardDrop(board, board, 'a', 'c', 'todo')
    expect(drop?.toIndex).toBe(2)
    expect(order(drop!.items, 'todo')).toEqual(['b', 'c', 'a'])
  })

  it('moves a card up when dropped on a card above it', () => {
    const drop = planBoardDrop(board, board, 'c', 'a', 'todo')
    expect(drop?.toIndex).toBe(0)
    expect(order(drop!.items, 'todo')).toEqual(['c', 'a', 'b'])
  })

  it('reports no change when a card is dropped on itself', () => {
    expect(planBoardDrop(board, board, 'b', 'b', 'todo')?.unchanged).toBe(true)
  })

  it('puts a card last when dropped on its own column', () => {
    const drop = planBoardDrop(board, board, 'a', 'todo', 'todo')
    expect(drop?.toIndex).toBe(2)
    expect(order(drop!.items, 'todo')).toEqual(['b', 'c', 'a'])
  })

  it('keeps the slot a card was placed at in another column while dragging', () => {
    const local = placeInColumn(board, 'b', 'done', 0)
    const drop = planBoardDrop(local, board, 'b', 'b', 'done')
    expect(drop?.toIndex).toBe(0)
    expect(drop?.unchanged).toBe(false)
    expect(order(drop!.items, 'done')).toEqual(['b', 'x'])
  })

  it('takes the hovered card slot after moving to another column', () => {
    const local = placeInColumn(board, 'b', 'done', 0)
    const drop = planBoardDrop(local, board, 'b', 'x', 'done')
    expect(drop?.toIndex).toBe(1)
    expect(order(drop!.items, 'done')).toEqual(['x', 'b'])
  })

  it('appends to another column when dropped on the column', () => {
    const local = board.map((i) => (i.id === 'b' ? { ...i, columnId: 'done' } : i))
    const drop = planBoardDrop(local, board, 'b', 'done', 'done')
    expect(drop?.toIndex).toBe(1)
    expect(order(drop!.items, 'done')).toEqual(['x', 'b'])
  })

  it('returns null for an unknown card', () => {
    expect(planBoardDrop(board, board, 'zz', 'a', 'todo')).toBeNull()
  })
})

describe('placeInColumn', () => {
  it('puts the card at the given slot in another column', () => {
    expect(order(placeInColumn(board, 'a', 'done', 0), 'done')).toEqual(['a', 'x'])
    expect(order(placeInColumn(board, 'a', 'done', 1), 'done')).toEqual(['x', 'a'])
    expect(order(placeInColumn(board, 'a', 'done', 0), 'todo')).toEqual(['b', 'c'])
  })

  it('clamps an out-of-range slot to the end', () => {
    expect(order(placeInColumn(board, 'a', 'done', 99), 'done')).toEqual(['x', 'a'])
  })

  it('moves into an empty column', () => {
    expect(order(placeInColumn(board, 'a', 'review', 0), 'review')).toEqual(['a'])
  })
})
