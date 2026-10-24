import { describe, expect, it } from 'vitest'
import { addPending, confirmPending, dropPending, mergePending } from './optimistic-list'

type Row = { id: string; body: string }
const server: Row[] = [{ id: 'a', body: 'first' }]

describe('optimistic list', () => {
  it('shows a pending row at once, marked sending', () => {
    const pending = addPending<Row>([], 'p1', { id: 'p1', body: 'new' })
    expect(mergePending(server, pending)).toEqual([{ id: 'a', body: 'first' }, { id: 'p1', body: 'new', sending: true }])
  })

  it('keeps a confirmed row (no longer sending) until the server list has it', () => {
    const pending = confirmPending(addPending<Row>([], 'p1', { id: 'p1', body: 'new' }), 'p1', 'b')
    expect(mergePending(server, pending)).toEqual([{ id: 'a', body: 'first' }, { id: 'b', body: 'new' }])
    expect(mergePending([...server, { id: 'b', body: 'new' }], pending)).toEqual([{ id: 'a', body: 'first' }, { id: 'b', body: 'new' }])
  })

  it('rolls a failed row back', () => {
    const pending = dropPending(addPending<Row>([], 'p1', { id: 'p1', body: 'new' }), 'p1')
    expect(mergePending(server, pending)).toEqual(server)
  })

  it('never changes the lists it is given', () => {
    const before = addPending<Row>([], 'p1', { id: 'p1', body: 'new' })
    confirmPending(before, 'p1', 'b')
    dropPending(before, 'p1')
    expect(before).toEqual([{ key: 'p1', row: { id: 'p1', body: 'new' }, serverId: null }])
  })
})
