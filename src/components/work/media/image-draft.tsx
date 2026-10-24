'use client'

import { ImagePlus, Loader2, X } from 'lucide-react'
import Image from 'next/image'
import { useRef } from 'react'
import { INLINE_IMAGE_ACCEPT, MAX_INLINE_IMAGES } from '@/lib/inline-images'
import { cn } from '@/lib/utils'
import type { ImageDraft } from './use-image-uploads'

/** "Add image" button: JPEG, PNG, GIF or WebP, up to MAX_INLINE_IMAGES. */
export function ImagePickButton({ onFiles, disabled, count }: { onFiles: (files: File[]) => void; disabled?: boolean; count: number }) {
  const input = useRef<HTMLInputElement>(null)
  const full = count >= MAX_INLINE_IMAGES
  return (
    <>
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => input.current?.click()}
        title={full ? `Up to ${MAX_INLINE_IMAGES} images` : 'Add an image or GIF'}
        aria-label="Add an image or GIF"
        className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
      >
        <ImagePlus className="size-4" strokeWidth={1.5} />
      </button>
      <input
        ref={input}
        type="file"
        accept={INLINE_IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </>
  )
}

/** Thumbnails of the picked images, with a spinner while each uploads and a remove button. */
export function ImageDraftStrip({ drafts, onRemove }: { drafts: readonly ImageDraft[]; onRemove: (key: string) => void }) {
  if (!drafts.length) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Images to send">
      {drafts.map((d) => (
        <li key={d.key} className="relative size-16 overflow-hidden rounded-[8px] ring-1 ring-white/[0.12]">
          {/* unoptimized: local preview (blob URL) */}
          <Image src={d.preview} alt={d.name} width={64} height={64} unoptimized className={cn('size-full object-cover', d.status === 'uploading' && 'opacity-50')} />
          {d.status === 'uploading' ? <Loader2 aria-label="Uploading" className="absolute inset-0 m-auto size-4 animate-spin text-white" /> : null}
          <button type="button" onClick={() => onRemove(d.key)} aria-label={`Remove ${d.name}`} className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
