import { describe, expect, it } from 'vitest'
import { taskViewContext } from './quick-context'

const q = (over: Partial<Parameters<typeof taskViewContext>[0]> = {}) => ({ project: [], client: [], space: null, folder: null, personal: false, ...over })

describe('what a quick-added task inherits from its view', () => {
  it('sets the client on a client page Tasks tab (one client locked)', () => {
    expect(taskViewContext(q({ client: ['c1'] }), [])).toMatchObject({ clientId: 'c1', projectId: undefined })
  })

  it('leaves the client open when the view spans several clients or none', () => {
    expect(taskViewContext(q({ client: ['c1', 'c2'] }), []).clientId).toBeUndefined()
    expect(taskViewContext(q(), []).clientId).toBeUndefined()
  })

  it('keeps the project, the space and its only list, and personal', () => {
    expect(taskViewContext(q({ project: ['p1'], space: 's1', personal: true }), [{ id: 'f1' }])).toEqual({ projectId: 'p1', clientId: undefined, spaceId: 's1', folderId: 'f1', personal: true })
    expect(taskViewContext(q({ space: 's1' }), [{ id: 'f1' }, { id: 'f2' }]).folderId).toBeUndefined()
  })
})
