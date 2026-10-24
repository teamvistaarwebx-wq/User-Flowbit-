'use client'

import { Inbox } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { setMailToTaskTeammates } from '@/modules/connectors/email/actions'

/** Settings → Security: whether members may email a teammate's personal tasks+ address. */
export function MailToTaskTeammatesCard({ allowed }: { allowed: boolean }) {
  const [run, pending] = useAction(setMailToTaskTeammates)
  return (
    <Card variant="solid">
      <CardHeader
        label="Allow teammates to email my address"
        icon={<Inbox />}
        description="Off: only the owner of a tasks+ address can create tasks by mailing it. On: any member may email a teammate’s address. Mail that fails the sender’s SPF, DKIM or DMARC check is always refused."
        actions={<Switch aria-label="Allow teammates to email each other's task address" checked={allowed} disabled={pending} onCheckedChange={(next) => run({ allowed: next })} />}
      />
    </Card>
  )
}
