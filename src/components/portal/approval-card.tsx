'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquareWarning } from 'lucide-react'
import { Textarea } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { decideApprovalAction, portalSignOutAction } from '@/modules/portal/public-actions'

const FAILED = 'Could not send. Check your connection and try again.'

/** Approve, or ask for changes with a comment (required for changes). */
export function ApprovalCard({ slug, taskId, title, meta, note }: { slug: string; taskId: string; title: string; meta: string; note: string | null }) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [pending, start] = useTransition()
  const decide = (decision: 'approved' | 'changes_requested') =>
    start(async () => {
      try {
        const res = await decideApprovalAction({ slug, taskId, decision, comment })
        if (!res.ok) return void toast.error(res.error)
        toast.success(res.message ?? 'Sent.')
        setComment('')
        router.refresh()
      } catch (error) {
        console.error('[portal] decision failed', error)
        toast.error(FAILED)
      }
    })
  return (
    <li className="space-y-3 rounded-[12px] bg-white/[0.04] p-4">
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-xs text-white/60">{meta}</p>
        {note ? <p className="mt-2 whitespace-pre-line text-sm text-white/80">{note}</p> : null}
      </div>
      <Textarea aria-label="Comment" rows={2} maxLength={2000} placeholder="A comment for the team (needed when you ask for changes)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => decide('approved')} className="press inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--doc-brand)', color: 'var(--doc-ink)' }}>
          <Check className="size-4" /> Approve
        </button>
        <button type="button" disabled={pending} onClick={() => decide('changes_requested')} className="press inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium text-white hover:bg-white/15 disabled:opacity-50">
          <MessageSquareWarning className="size-4" /> Request changes
        </button>
      </div>
    </li>
  )
}

export function PortalSignOut({ slug }: { slug: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-white/60 hover:text-white"
      onClick={() =>
        start(async () => {
          const res = await portalSignOutAction({ slug }).catch(() => null)
          router.replace(res?.ok && res.redirect ? res.redirect : `/portal/${slug}/login`)
          router.refresh()
        })
      }
    >
      Sign out
    </button>
  )
}
