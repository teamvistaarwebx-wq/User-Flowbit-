export type ImageSource = 'post' | 'reply' | 'comment'

/** Alt text and lightbox title for an attached image: "Image 2 of 3 from Asha's post" (never the file name). */
export function imageAlt(index: number, count: number, author?: string, source: ImageSource = 'post'): string {
  const position = count > 1 ? `Image ${index + 1} of ${count}` : 'Image'
  const name = author?.trim()
  return name ? `${position} from ${name}'s ${source}` : `${position} in this ${source}`
}

/** Lightbox step for ←/→, or 0 for any other key. */
export const arrowStep = (key: string): -1 | 0 | 1 => (key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0)
