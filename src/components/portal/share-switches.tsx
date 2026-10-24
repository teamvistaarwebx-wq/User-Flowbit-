'use client'

import { useState } from 'react'
import { Globe, Send } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { requestClientApproval, setProjectShared, setTaskClientVisible } from '@/modules/portal/agency-actions'
import { APPROVAL_LABEL } from '@/modules/portal/access'

/** Project → Settings: share the project in the client portal. */
export function ProjectPortalCard({ projectId, shared, clientName }: { projectId: string; shared: boolean; clientName: string }) {
  const [run, pending] = useAction(setProjectShared)
  return (
    <Card variant="solid" className="mt-4">
      <CardHeader
        label="Client portal"
        icon={<Globe />}
        description={`Show ${clientName} this project's status, health, milestones, progress and files in their portal. Tasks appear only when marked "Client can see this".`}
        actions={<Switch aria-label="Share in the client portal" checked={shared} disabled={pending} onCheckedChange={(next) => run({ projectId, shared: next })} />}
      />
    </Card>
  )
}

export type TaskPortalState = { visible: boolean; approval: { status: string; comment: string | null; decidedByName: string | null } | null }

/** Task detail: "Client can see this" and "Ask the client to approve". */
export function TaskPortalControls({ taskId, state }: { taskId: string; state: TaskPortalState }) {
  const [toggle, saving] = useAction(setTaskClientVisible)
  const [ask, asking] = useAction(requestClientApproval, { onDone: () => setOpen(false) })
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const waiting = state.approval?.status === 'requested'
  return (
    <div className="space-y-2 rounded-[10px] bg-white/[0.03] p-3">
      <Switch checked={state.visible} disabled={saving} onCheckedChange={(next) => toggle({ taskId, visible: next })} label="Client can see this" description="In the client portal, for this task's client or shared project." />
      <div className="flex flex-wrap items-center gap-2">
        {state.approval ? <Badge tone={state.approval.status === 'approved' ? 'success' : state.approval.status === 'requested' ? 'info' : 'warning'}>{APPROVAL_LABEL[state.approval.status] === 'Waiting for you' ? 'Waiting for the client' : APPROVAL_LABEL[state.approval.status]}{state.approval.decidedByName ? ` · ${state.approval.decidedByName}` : ''}</Badge> : null}
        {waiting ? null : (
          <Button size="sm" variant="secondary" icon={<Send className="size-3.5" />} onClick={() => setOpen(true)}>
            Ask the client to approve
          </Button>
        )}
      </div>
      {state.approval?.comment ? <p className="text-xs text-fg-2">“{state.approval.comment}”</p> : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title="Ask the client to approve?"
        description="Their portal people get an email and can approve or ask for changes. The task becomes visible to them."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={asking} onClick={() => ask({ taskId, note })}>Send for approval</Button>
          </>
        }
      >
        <Textarea aria-label="Note for the client" rows={3} maxLength={1000} placeholder="What to look at (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </div>
  )
}
