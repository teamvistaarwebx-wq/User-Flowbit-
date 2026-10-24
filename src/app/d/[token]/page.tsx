import type { Metadata } from 'next'
import { PublicDocument } from '@/components/doclinks/public-views'
import { PublicShell, Unavailable } from '@/components/doclinks/public-shell'
import { requestIp, requestUserAgent } from '@/lib/request'
import { recordOpen, resolveDocLink } from '@/modules/doclinks/links'
import { loadPublicView } from '@/modules/doclinks/load'
import { DOC_KIND_LABELS } from '@/modules/doclinks/token'

export const dynamic = 'force-dynamic'

/** Never indexed, never cached: each link is private to whoever it was sent to. */
export const metadata: Metadata = { title: 'Document', robots: { index: false, follow: false } }

const GONE = { title: 'This link is not available', body: 'It may have been replaced by a newer one or switched off. Ask the sender for a fresh link.' }

/** The public document page (notifications-v2 §1.4): /d/<signed token>, no sign-in. */
export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const resolved = await resolveDocLink(token)
  if (resolved.state === 'missing' || resolved.state === 'revoked') return <Unavailable {...GONE} />
  if (resolved.state === 'expired') return <Unavailable title="This link has expired" body="Ask the sender for a fresh link." />
  const view = await loadPublicView(resolved.link, token)
  if (!view) return <Unavailable {...GONE} />
  await recordOpen(resolved.link, { ip: await requestIp(), userAgent: await requestUserAgent() }).catch((error: unknown) => console.error('[doclinks] open not recorded', error))
  return (
    <PublicShell brand={view.brand}>
      <h2 className="sr-only">{DOC_KIND_LABELS[view.kind]}</h2>
      <PublicDocument view={view} />
    </PublicShell>
  )
}
