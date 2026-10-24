'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { guard, toast } from '@/lib/toast'
import { inviteEmployee, linkLogins } from '@/modules/muster/people/actions'
import type { LinkPlan } from '@/modules/muster/people/login-links'

/**
 * People → Link logins: every employee with no login, matched to the login that signs in with their work email.
 * Tick who to link (all by default) and link them at once; their past check-ins move onto the register too.
 * Below: employees with no login yet (invite them) and logins with no employee record.
 */
export function LinkLoginsDialog({ plan, defaultOpen = false }: { plan: LinkPlan; defaultOpen?: boolean }) {
  const router = useRouter()
  const linkable = plan.matches.filter((m) => !m.own)
  const [open, setOpen] = useState(defaultOpen)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(linkable.map((m) => m.employeeId)))
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  const [invited, setInvited] = useState<Set<string>>(() => new Set())

  const toggle = (id: string, on: boolean) =>
    setChosen((cur) => {
      const next = new Set(cur)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const allOn = linkable.length > 0 && linkable.every((m) => chosen.has(m.employeeId))

  const link = guard(async () => {
    setSaving(true)
    try {
      const res = await linkLogins({ employeeIds: [...chosen] })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Linked')
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  })

  const invite = (employeeId: string) =>
    guard(async () => {
      setInviting(employeeId)
      try {
        const res = await inviteEmployee({ id: employeeId, role: 'member' })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        setInvited((cur) => new Set(cur).add(employeeId))
        toast.success(res.message ?? 'Invite sent')
      } finally {
        setInviting(null)
      }
    })()

  const count = plan.matches.length
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && invited.size) router.refresh()
      }}
      size="lg"
      trigger={
        <Button variant="secondary" icon={<Link2 className="size-4" />}>
          Link logins{count ? <span className="ml-1 rounded-full bg-white/[0.1] px-1.5 text-[11px] tabular-nums">{count}</span> : null}
        </Button>
      }
      title="Link employees to their logins"
      description="A linked login puts that person's check-ins on the attendance register, gives them self-service, and applies their work mode at check-in. Matched by work email; past check-ins move over too."
      footer={
        <>
          <span className="mr-auto self-center text-xs text-fg-2">{chosen.size} of {linkable.length} ticked</span>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!chosen.size} onClick={() => void link()}>Link {chosen.size || ''}</Button>
        </>
      }
    >
      {count ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">Ready to link ({count})</p>
            {linkable.length > 1 ? (
              <button type="button" className="text-xs text-link hover:underline" onClick={() => setChosen(allOn ? new Set() : new Set(linkable.map((m) => m.employeeId)))}>{allOn ? 'Untick all' : 'Tick all'}</button>
            ) : null}
          </div>
          <ul className="max-h-[38dvh] divide-y divide-white/[0.06] overflow-y-auto rounded-[10px] bg-white/[0.03]">
            {plan.matches.map((m) => (
              <li key={m.employeeId} className="flex items-center gap-3 px-3 py-2">
                <Checkbox checked={!m.own && chosen.has(m.employeeId)} disabled={m.own} onCheckedChange={(on) => toggle(m.employeeId, on)} aria-label={`Link ${m.name}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{m.name} <span className="font-mono text-xs text-fg-3">{m.code}</span></span>
                  <span className="block truncate text-xs text-fg-2">{m.email}</span>
                </span>
                {m.own ? <span className="text-xs text-fg-3">Your own: someone else links it</span> : m.invited ? <Badge tone="warning">Invite pending</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-[10px] bg-white/[0.03] px-4 py-5 text-center text-sm text-fg-2">No employee without a login has a matching login.</p>
      )}

      {plan.withoutLogin.length ? (
        <section className="mt-5">
          <p className="text-sm font-medium text-fg">No login yet ({plan.withoutLogin.length})</p>
          <p className="mb-2 text-xs text-fg-2">Nobody signs in with these work emails. Invite them, and they are linked as they join.</p>
          <ul className="max-h-[24dvh] divide-y divide-white/[0.06] overflow-y-auto rounded-[10px] bg-white/[0.03]">
            {plan.withoutLogin.map((e) => (
              <li key={e.employeeId} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{e.name} <span className="font-mono text-xs text-fg-3">{e.code}</span></span>
                  <span className="block truncate text-xs text-fg-2">{e.email}</span>
                </span>
                {invited.has(e.employeeId) ? (
                  <Badge tone="success">Invited</Badge>
                ) : (
                  <Button size="sm" variant="ghost" icon={<Mail className="size-3.5" />} loading={inviting === e.employeeId} onClick={() => invite(e.employeeId)}>Invite</Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.withoutEmployee.length ? (
        <section className="mt-5">
          <p className="text-sm font-medium text-fg">Logins with no employee record ({plan.withoutEmployee.length})</p>
          <p className="mb-2 text-xs text-fg-2">Their sign-in email matches no employee. If they work here, add them in People (or fix the work email); otherwise nothing to do.</p>
          <ul className="divide-y divide-white/[0.06] rounded-[10px] bg-white/[0.03]">
            {plan.withoutEmployee.map((l) => (
              <li key={l.email} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{l.name}</span>
                  <span className="block truncate text-xs text-fg-2">{l.email}</span>
                </span>
                {l.invited ? <Badge tone="warning">Invite pending</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Dialog>
  )
}
