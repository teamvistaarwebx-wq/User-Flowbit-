'use client'

import { useRef, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ImageIcon, ImagePlus } from 'lucide-react'
import { guard, toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { toPngFile } from '@/components/ui/image-convert'
import { removeCompanyLogo, uploadCompanyLogo } from '@/modules/settings/company-actions'

const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp'
/** Long side of the stored logo: sharp on a printed letterhead, small enough to embed in every PDF. */
const LOGO_PDF_EDGE = 512

/** The company logo: any of PNG, JPEG, SVG or WebP, turned into a resized PNG in the browser before upload. */
export function CompanyLogoCard({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()

  const send = (file: File | undefined) => {
    if (!file) return
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      toast.error('Use a PNG, JPEG, SVG or WebP image.')
      return
    }
    start(guard(async () => {
      const form = new FormData()
      form.set('logo', await toPngFile(file, { edge: LOGO_PDF_EDGE }))
      const res = await uploadCompanyLogo(form)
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
      const res = await removeCompanyLogo({})
      if (!res.ok) toast.error(res.error)
      else router.refresh()
    }))

  return (
    <Card variant="solid">
      <CardHeader label="Logo" icon={<ImageIcon />} description="PNG, JPEG, SVG or WebP. Resized and stored as PNG, printed on every PDF and shown in the app." />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="lit-edge flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white">
          {logoUrl ? (
            // unoptimized: /api/files checks the viewer's session, which the image optimizer would not send
            <Image src={logoUrl} alt="Company logo" width={112} height={112} unoptimized className="h-auto max-h-full w-auto max-w-full object-contain p-2" />
          ) : (
            <span className="text-[13px] text-[#6B6478]">No logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<ImagePlus className="size-4" />} loading={pending} onClick={() => input.current?.click()}>
            {logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          {logoUrl ? (
            <Button variant="ghost" disabled={pending} onClick={drop}>
              Remove logo
            </Button>
          ) : null}
          <input
            ref={input}
            type="file"
            accept={LOGO_ACCEPT}
            className="hidden"
            onChange={(e) => {
              send(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </Card>
  )
}
