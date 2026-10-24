'use client'

import Link from 'next/link'
import { ArrowRight, Copy, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAction } from '@/components/ui/action-form'
import { toast } from '@/lib/toast'
import { postProgressUpdate } from '@/modules/work/arc/apply-actions'

/** Generated progress text with Copy and "Post as update". */
export function ProgressCard({ runId, text, postHref, canPost }: { runId: string; text: string; postHref?: string; canPost: boolean }) {
  const [post, posting] = useAction(postProgressUpdate)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Update copied')
    } catch {
      toast.error('Your browser blocked copying. Select the text and copy it instead.')
    }
  }
  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap rounded-[10px] bg-control/70 p-4 text-sm leading-relaxed text-white/85">{text}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={copy}>Copy</Button>
        {postHref ? (
          <Link href={postHref} className="inline-flex items-center gap-1 text-sm text-link transition-opacity hover:opacity-80">View post <ArrowRight className="size-3.5" /></Link>
        ) : canPost ? (
          <Button variant="primary" size="sm" icon={<Megaphone className="size-4" />} loading={posting} onClick={() => post({ runId })}>Post as update</Button>
        ) : null}
      </div>
    </div>
  )
}
