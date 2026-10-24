'use client'

import { ImagePlus, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { resizeImageFile } from '@/components/ui/resize-image'
import { ENTITY_LOGO_ACCEPT, isEntityLogoType } from '@/lib/entity-logo'
import { toast } from '@/lib/toast'

/**
 * Logo picker for the New project form: the image is resized in the browser and kept
 * here; the form uploads it once the project exists (it has no id before that).
 */
export function NewProjectLogo({ file, onChange, color }: { file: File | null; onChange: (file: File | null) => void; color: string }) {
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    if (!isEntityLogoType(picked.type)) {
      toast.error('Use a JPEG or PNG image.')
      return
    }
    onChange(await resizeImageFile(picked))
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white/[0.06] ring-1 ring-white/[0.12]">
        {/* unoptimized: local preview of the chosen file */}
        {preview ? <Image src={preview} alt="" width={40} height={40} unoptimized className="size-full object-contain" /> : <span aria-hidden className="size-5 rounded-full" style={{ background: color }} />}
      </span>
      <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
        {file ? 'Change logo' : 'Add logo'}
      </Button>
      {file ? <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => onChange(null)}>Remove</Button> : null}
      <input
        ref={input}
        type="file"
        accept={ENTITY_LOGO_ACCEPT}
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
