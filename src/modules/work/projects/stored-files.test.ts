import { describe, expect, it } from 'vitest'
import { projectStoredFileIds } from './stored-files'

describe('projectStoredFileIds', () => {
  it('includes the logo with the attachments', () => {
    expect(projectStoredFileIds({ files: [{ fileId: 'f1' }, { fileId: 'f2' }], logoFileId: 'logo' })).toEqual(['f1', 'f2', 'logo'])
  })

  it('works with no files and no logo', () => {
    expect(projectStoredFileIds({})).toEqual([])
    expect(projectStoredFileIds({ files: null, logoFileId: 'logo' })).toEqual(['logo'])
  })
})
