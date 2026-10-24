'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActionResult } from '@/lib/action-types'
import { inlineImageRefusal, MAX_INLINE_IMAGES, type InlineImage } from '@/lib/inline-images'
import { toast } from '@/lib/toast'

export type ImageDraft = Readonly<{ key: string; name: string; preview: string; status: 'uploading' | 'ready'; image?: InlineImage }>

/**
 * Images picked for a post, reply or comment being written. Each one goes up
 * at once on its own request (`upload`); a refused or failed file is dropped
 * with a toast. `ids` are the uploaded file ids to send with the text;
 * `previews` show the local copies (for the optimistic row).
 */
export function useImageUploads(upload: (file: File) => Promise<ActionResult<InlineImage>>) {
  const [drafts, setDrafts] = useState<ImageDraft[]>([])
  const seq = useRef(0)

  /** Shows a draft at once and fills it in when `run` comes back; a failure drops it with a toast. */
  const track = useCallback((name: string, preview: string, run: () => Promise<ActionResult<InlineImage>>, revoke: boolean) => {
    seq.current += 1
    const key = `img-${seq.current}`
    setDrafts((list) => [...list, { key, name, preview, status: 'uploading' }])
    void run()
      .then((result) => {
        if (!result.ok || !result.data) throw new Error(result.ok ? 'No file came back' : result.error)
        const image = result.data
        setDrafts((list) => list.map((d) => (d.key === key ? { ...d, status: 'ready', image } : d)))
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error && error.message ? error.message : `"${name}" did not upload. Try again.`)
        setDrafts((list) => list.filter((d) => d.key !== key))
        if (revoke) URL.revokeObjectURL(preview)
      })
  }, [])

  const add = useCallback(
    (files: readonly File[]) => {
      let count = drafts.length
      for (const file of files) {
        const refusal = inlineImageRefusal(file, count)
        if (refusal) {
          toast.error(refusal)
          continue
        }
        count += 1
        track(file.name, URL.createObjectURL(file), () => upload(file), true)
      }
    },
    [drafts.length, track, upload],
  )

  /** An image made on the server (a GIF picked from the library): `preview` is its remote thumbnail. */
  const addFrom = useCallback(
    (name: string, preview: string, run: () => Promise<ActionResult<InlineImage>>) => {
      if (drafts.length >= MAX_INLINE_IMAGES) {
        toast.error(`Up to ${MAX_INLINE_IMAGES} images at a time.`)
        return
      }
      track(name, preview, run, false)
    },
    [drafts.length, track],
  )

  const remove = useCallback((key: string) => {
    setDrafts((list) => {
      const gone = list.find((d) => d.key === key)
      if (gone?.preview.startsWith('blob:')) URL.revokeObjectURL(gone.preview)
      return list.filter((d) => d.key !== key)
    })
  }, [])

  /** Empties the list after sending; the previews stay valid for the optimistic row. */
  const clear = useCallback(() => setDrafts([]), [])
  /** Puts drafts back after a failed send. */
  const restore = useCallback((list: readonly ImageDraft[]) => setDrafts([...list]), [])

  const ready = drafts.filter((d): d is ImageDraft & { image: InlineImage } => d.status === 'ready' && Boolean(d.image))
  return {
    drafts,
    add,
    addFrom,
    remove,
    clear,
    restore,
    uploading: drafts.some((d) => d.status === 'uploading'),
    ids: ready.map((d) => d.image.id),
    previews: ready.map((d): InlineImage => ({ id: d.image.id, url: d.preview, name: d.name })),
  }
}
