'use client'

import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { ActionResult } from '@/lib/action-types'
import { ENTITY_LOGO_ACCEPT, isEntityLogoType } from '@/lib/entity-logo'
import { guard, toast } from '@/lib/toast'
import { Button } from './button'
import { resizeImageFile } from './resize-image'

/**
 * Logo picker for a project or client: JPEG or PNG, resized in the browser,
 * then sent as `logo` with `fields` (server actions taking FormData, so a server page can pass them). Shows the current logo (or `fallback`) and Remove.
 */
export function LogoUpload({ logoUrl, fallback, fields, upload, remove, disabled }: { logoUrl: string | null; fallback: React.ReactNode; fields: Record<string, string>; upload: (form: FormData) => Promise<ActionResult>; remove: (form: FormData) => Promise<ActionResult>; disabled?: boolean }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()

  const formOf = (extra: Record<string, string | File> = {}) => {
    const form = new FormData()
    Object.entries({ ...fields, ...extra }).forEach(([k, v]) => form.set(k, v))
    return form
  }

  const send = (file: File | undefined) => {
    if (!file) return
    if (!isEntityLogoType(file.type)) {
      toast.error('Use a JPEG or PNG image.')
      return
    }
    start(guard(async () => {
      const res = await upload(formOf({ logo: await resizeImageFile(file) }))
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Logo updated.')
      router.refresh()
    }))
  }

  const drop = () =>
    start(guard(async () => {
      const res = await remove(formOf())
      if (!res.ok) toast.error(res.error)
      else router.refresh()
    }))

  return (
    <div className="flex items-center gap-4">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.06] ring-1 ring-white/[0.12]">
        {/* unoptimized: /api/files checks the viewer's session, which the image optimizer would not send */}
        {logoUrl ? <Image src={logoUrl} alt="" width={56} height={56} unoptimized className="size-full object-contain" /> : fallback}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} loading={pending} disabled={disabled} onClick={() => input.current?.click()}>
          {logoUrl ? 'Change logo' : 'Upload logo'}
        </Button>
        {logoUrl ? <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} disabled={disabled || pending} onClick={drop}>Remove</Button> : null}
        <input
          ref={input}
          type="file"
          accept={ENTITY_LOGO_ACCEPT}
          hidden
          onChange={(e) => {
            send(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
