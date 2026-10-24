'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { toast } from '@/lib/toast'
import { approveConsent, denyConsent, type ConsentResult } from '@/modules/mcp/consent-actions'

type Workspace = { orgId: string; name: string; role: string; refusal: string | null; scopes: string[] }
type Params = { client_id: string; redirect_uri: string; code_challenge: string; code_challenge_method: string; state?: string; scope?: string; resource?: string }

interface ConsentFormProps {
  clientName: string
  returnHost: string
  params: Params
  workspaces: Workspace[]
  scopeInfo: Record<string, { label: string; description: string }>
}

/** Pick a workspace, untick scopes, approve or deny. The server re-checks everything on submit. */
export function ConsentForm({ clientName, returnHost, params, workspaces, scopeInfo }: ConsentFormProps) {
  const usable = workspaces.filter((w) => !w.refusal)
  const [orgId, setOrgId] = useState(usable[0]?.orgId ?? '')
  const workspace = workspaces.find((w) => w.orgId === orgId)
  const [unticked, setUnticked] = useState<string[]>([])
  const [pending, start] = useTransition()

  const follow = (result: ConsentResult) => {
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    window.location.assign(result.redirectTo)
  }
  const approve = () => start(async () => follow(await approveConsent({ ...params, orgId, scopes: (workspace?.scopes ?? []).filter((s) => !unticked.includes(s)) })))
  const deny = () => start(async () => follow(await denyConsent(params)))

  if (!workspaces.length) return <p className="text-center text-sm text-fg-2">You are not an active member of any workspace yet.</p>

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm text-fg-2" htmlFor="consent-workspace">Workspace</label>
        <Select id="consent-workspace" value={orgId} onValueChange={(v) => { setOrgId(v); setUnticked([]) }} options={workspaces.map((w) => ({ value: w.orgId, label: `${w.name} · ${w.role}`, disabled: Boolean(w.refusal), hint: w.refusal ?? undefined }))} />
        {workspaces.filter((w) => w.refusal).map((w) => <p key={w.orgId} className="text-xs text-warning">{w.name}: {w.refusal}</p>)}
      </div>
      {workspace && !workspace.refusal ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-2">{clientName} may:</p>
          {workspace.scopes.length ? workspace.scopes.map((s) => (
            <Checkbox key={s} checked={!unticked.includes(s)} onCheckedChange={(on) => setUnticked((u) => (on ? u.filter((x) => x !== s) : [...u, s]))} label={scopeInfo[s]?.label ?? s} description={scopeInfo[s]?.description} />
          )) : <p className="text-sm text-warning">Your role here does not allow any of what {clientName} asked for.</p>}
          <p className="text-xs text-fg-3">Never possible: attendance, payroll and salary, issuing or voiding invoices, payments, deleting records, roles, settings or billing. Every change shows as “you via {clientName}” and can be undone for 7 days.</p>
        </div>
      ) : null}
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" loading={pending} disabled={!workspace || Boolean(workspace.refusal) || !workspace.scopes.some((s) => !unticked.includes(s))} onClick={approve}>Allow</Button>
        <Button variant="secondary" className="flex-1" disabled={pending} onClick={deny}>Deny</Button>
      </div>
      <p className="text-center text-xs text-fg-3">You will return to {returnHost}. Revoke any time in Settings → Connected apps.</p>
    </div>
  )
}
