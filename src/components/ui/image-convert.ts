'use client'

import { fitWithin } from '@/lib/entity-logo'
import { clearLightPixels } from '@/lib/image-bytes'

/**
 * Turns a picked image into a PNG the PDFs can draw: SVG, WebP, JPEG or PNG in, a PNG at most `edge`
 * pixels on its long side out, drawn on a canvas in the browser. `clearBelow` (0–255) makes light
 * pixels transparent first (a signature photographed on white paper).
 */

const SVG_FALLBACK_EDGE = 512

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (file.type !== 'image/svg+xml') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  }
  // An SVG goes through an <img>: createImageBitmap cannot read SVG in every browser.
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const width = img.naturalWidth || SVG_FALLBACK_EDGE
    const height = img.naturalHeight || SVG_FALLBACK_EDGE
    return { source: img, width, height, release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function toPngFile(file: File, opts: { edge: number; clearBelow?: number | null }): Promise<File> {
  const image = await loadImage(file)
  try {
    // An SVG scales up as well as down, so it fills the edge; a raster image only shrinks.
    const scaleUp = file.type === 'image/svg+xml'
    const size = scaleUp ? fitWithin(image.width * 10, image.height * 10, opts.edge) : fitWithin(image.width, image.height, opts.edge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot draw images.')
    context.drawImage(image.source, 0, 0, size.width, size.height)
    if (opts.clearBelow != null) {
      const pixels = context.getImageData(0, 0, size.width, size.height)
      context.putImageData(new ImageData(clearLightPixels(pixels.data, opts.clearBelow), size.width, size.height), 0, 0)
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('The image could not be converted.')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.png`, { type: 'image/png' })
  } finally {
    image.release()
  }
}
