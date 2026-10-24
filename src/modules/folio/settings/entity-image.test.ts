import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const saveFile = vi.fn(async (_ctx: unknown, input: { mime: string }) => ({ _id: 'f1', mime: input.mime }))
vi.mock('@/lib/files', () => ({ saveFile: (ctx: unknown, input: { mime: string }) => saveFile(ctx, input) }))

const { saveEntityImage } = await import('./entity-image')

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const ctx = {} as never
const opts = { kind: 'folio_logo', field: 'logo', label: 'The logo' } as const

describe('saveEntityImage (R3 L-24a)', () => {
  test('stores a real PNG with the sniffed type, whatever the browser claimed', async () => {
    // Arrange
    const file = new File([PNG], 'logo.jpg', { type: 'image/jpeg' })
    // Act
    await saveEntityImage(ctx, file, opts)
    // Assert
    expect(saveFile).toHaveBeenCalledWith(ctx, expect.objectContaining({ mime: 'image/png', kind: 'folio_logo', entity: 'FolioEntity' }))
  })

  test('refuses bytes that are not PNG or JPEG even when labelled image/png', async () => {
    const file = new File(['<svg></svg>'], 'logo.png', { type: 'image/png' })
    await expect(saveEntityImage(ctx, file, opts)).rejects.toThrow('The logo must be a PNG or JPEG image.')
  })

  test('returns null when no file was picked', async () => {
    expect(await saveEntityImage(ctx, null, opts)).toBeNull()
  })
})
