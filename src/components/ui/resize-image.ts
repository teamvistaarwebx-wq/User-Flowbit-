'use client'

import { fitWithin, LOGO_EDGE } from '@/lib/entity-logo'

/**
 * Shrinks a JPEG or PNG in the browser so its long side is at most `edge`
 * pixels (PNG keeps transparency; JPEG at quality 0.9). Small images and
 * anything the browser cannot draw come back unchanged.
 */
export async function resizeImageFile(file: File, edge: number = LOGO_EDGE): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = fitWithin(bitmap.width, bitmap.height, edge)
    if (size.width === bitmap.width && size.height === bitmap.height) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9))
    return blob ? new File([blob], file.name, { type }) : file
  } catch (error) {
    console.error('[ui] could not resize the image; uploading it as it is', error)
    return file
  }
}
