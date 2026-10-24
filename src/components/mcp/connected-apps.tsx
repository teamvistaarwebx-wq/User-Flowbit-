'use client'

import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { revokeConnection, setMcpEnabled, undoMcpBatchAction } from '@/modules/mcp/settings-actions'

/** The workspace switch for AI apps (admins). */
export function McpSwitch({ enabled }: { enabled: boolean }) {
  const [run, pending] = useAction(setMcpEnabled)
  return <Switch aria-label="AI apps on or off" checked={enabled} disabled={pending} onCheckedChange={(next) => run({ enabled: next })} />
}

export function RevokeButton({ id }: { id: string }) {
  const [run, pending] = useAction(revokeConnection)
  return <Button variant="secondary" size="sm" loading={pending} onClick={() => run({ id })}>Revoke</Button>
}

export function UndoBatchButton({ id }: { id: string }) {
  const [run, pending] = useAction(undoMcpBatchAction)
  return <Button variant="secondary" size="sm" loading={pending} onClick={() => run({ batchId: id })}>Undo</Button>
}
