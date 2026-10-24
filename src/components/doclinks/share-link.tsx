'use client'

import { Copy, Link2, Link2Off } from 'lucide-react'
import { useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { createDocLinkAction, revokeDocLinkAction } from '@/modules/doclinks/app-actions'

type Kind = 'invoice' | 'quote' | 'credit_note' | 'receipt'

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied.')
  } catch {
    toast.error('Could not copy. Select the link and copy it yourself.')
  }
}

/** The document's public link: copy it (creating one if needed) or turn it off. */
export function ShareLink({ kind, id, url: initial, canManage }: { kind: Kind; id: string; url: string | null; canManage: boolean }) {
  const [url, setUrl] = useState(initial)
  const [create, creating] = useAction(createDocLinkAction, { onDone: (r) => r.data?.url && (setUrl(r.data.url), void copy(r.data.url)) })
  const [revoke, revoking] = useAction(revokeDocLinkAction, { onDone: () => setUrl(null) })
  if (!url) {
    return canManage ? (
      <Button size="sm" variant="secondary" icon={<Link2 className="size-3.5" />} loading={creating} onClick={() => create({ kind, id })}>
        Create link
      </Button>
    ) : (
      <p className="text-xs text-fg-3">No public link yet. It is made when the document is emailed.</p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex h-10 items-center gap-2 rounded-full bg-control pl-4 pr-1.5 ring-1 ring-inset ring-white/10">
        <code className="min-w-0 flex-1 truncate text-xs text-white/80">{url}</code>
        <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => void copy(url)}>
          Copy
        </Button>
      </div>
      {canManage ? (
        <Button size="sm" variant="ghost" icon={<Link2Off className="size-3.5" />} loading={revoking} onClick={() => revoke({ kind, id })}>
          Turn off link
        </Button>
      ) : null}
    </div>
  )
}
