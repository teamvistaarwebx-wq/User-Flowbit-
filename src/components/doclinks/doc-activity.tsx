import { CheckCircle2, Eye, Mail, MessageCircle, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDateTime } from '@/lib/dates'
import { Timeline } from '@/components/ui/timeline'
import { PanelHeader, SolidCard } from '@/components/folio/ui'
import type { DocActivity } from '@/modules/doclinks/queries'
import type { TimelineTone } from '@/modules/doclinks/timeline'
import { ShareLink } from './share-link'

/** "Activity" on a document page: the public link, then sent → delivered → opened → accepted → paid. */

const ICON: Readonly<Record<TimelineTone, ReactNode>> = {
  neutral: <Eye />,
  info: <Mail />,
  success: <CheckCircle2 className="text-success" />,
  warning: <MessageCircle className="text-warning" />,
  danger: <XCircle className="text-danger" />,
}

export function DocActivityCard({ kind, id, activity, canManage }: { kind: 'invoice' | 'quote' | 'credit_note' | 'receipt'; id: string; activity: DocActivity; canManage: boolean }) {
  const opened = activity.link?.lastOpenedAt ? `Opened ${activity.link.opens} ${activity.link.opens === 1 ? 'time' : 'times'}, last ${formatDateTime(activity.link.lastOpenedAt)}` : 'Not opened yet'
  return (
    <SolidCard>
      <PanelHeader icon={<Eye />} title="Online link and activity" subtitle={activity.link ? opened : 'Clients can view, download, pay or accept online'} />
      <div className="mt-4 space-y-5">
        <ShareLink kind={kind} id={id} url={activity.link?.url ?? null} canManage={canManage} />
        <Timeline
          empty="Nothing sent yet."
          items={[...activity.entries].reverse().map((e, i) => ({ id: `${i}-${e.at.toISOString()}`, title: e.label, description: e.detail, at: e.at, icon: ICON[e.tone] }))}
        />
      </div>
    </SolidCard>
  )
}
