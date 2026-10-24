'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { InlineImage } from '@/lib/inline-images'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { arrowStep, imageAlt, type ImageSource } from './image-alt'
import { mediaGrid } from './media-grid'

/**
 * Inline thumbnails under a post, reply or comment, or (`layout="grid"`) the
 * feed's media grid; a click opens the image large (buttons or ←/→ step through).
 * `author` and `source` give the alt text ("Image 2 of 3 from Asha's post").
 */
export function ImageGallery({ images, className, size = 'md', layout = 'thumbs', author, source = 'post' }: { images: readonly InlineImage[]; className?: string; size?: 'sm' | 'md'; layout?: 'thumbs' | 'grid'; author?: string; source?: ImageSource }) {
  const [open, setOpen] = useState<number | null>(null)
  const isOpen = open !== null
  const count = images.length
  useEffect(() => {
    if (!isOpen || count < 2) return
    const onKey = (event: KeyboardEvent) => {
      const by = arrowStep(event.key)
      if (!by || event.defaultPrevented) return
      event.preventDefault()
      setOpen((i) => (i === null ? null : (i + by + count) % count))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, count])
  if (!images.length) return null
  const altOf = (i: number) => imageAlt(i, images.length, author, source)
  const openLabel = (i: number) => `Open ${altOf(i).replace(/^Image/, 'image')}`
  const current = open === null ? null : images[open]
  const currentAlt = open === null ? '' : altOf(open)
  const step = (by: number) => setOpen((i) => (i === null ? null : (i + by + images.length) % images.length))
  const grid = layout === 'grid' ? mediaGrid(images.length) : null
  return (
    <>
      {grid ? (
        <ul className={cn('overflow-hidden rounded-[12px]', grid.container, className)}>
          {grid.tiles.map((t) => {
            const img = images[t.index]
            return (
              <li key={img.id} className={cn('relative min-h-0', t.className)}>
                <button type="button" onClick={() => setOpen(t.index)} aria-label={t.more ? `${openLabel(t.index)} and ${t.more} more` : openLabel(t.index)} className="relative z-10 block size-full overflow-hidden bg-white/[0.04] transition-opacity hover:opacity-90">
                  {/* unoptimized: /api/files checks the viewer's session, which the image optimizer would not send */}
                  <Image src={img.url} alt="" width={320} height={320} unoptimized className="size-full object-cover" />
                  {t.more ? <span className="absolute inset-0 grid place-items-center bg-black/55 text-xl font-semibold text-white">+{t.more}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
      <ul className={cn('flex flex-wrap gap-2', className)}>
        {images.map((img, i) => (
          <li key={img.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={openLabel(i)} className={cn('relative z-10 block overflow-hidden rounded-[8px] ring-1 ring-white/[0.12] transition-opacity hover:opacity-90', size === 'sm' ? 'size-20' : 'size-28')}>
              <Image src={img.url} alt="" width={112} height={112} unoptimized className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      )}
      {current ? (
        <Dialog open onOpenChange={(next) => (next ? null : setOpen(null))} size="xl" title={currentAlt}>
          <div className="relative flex items-center justify-center">
            <Image src={current.url} alt={currentAlt} width={1200} height={900} unoptimized loading="eager" className="h-auto max-h-[70dvh] w-auto max-w-full rounded-[8px] object-contain" />
            {images.length > 1 ? (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous image" className="absolute left-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronLeft className="size-5" /></button>
                <button type="button" onClick={() => step(1)} aria-label="Next image" className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><ChevronRight className="size-5" /></button>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  )
}
