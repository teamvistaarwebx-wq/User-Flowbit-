'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toggleAutomationAction } from '@/modules/automations/actions'
import type { RuleRow } from '@/modules/automations/queries'

const AREAS = [
  { key: 'money', label: 'Money' },
  { key: 'team', label: 'Team' },
  { key: 'sales', label: 'Sales' },
  { key: 'people', label: 'People' },
  { key: 'compliance', label: 'Business compliance' },
  { key: 'custom', label: 'Your own' },
] as const

function Row({ rule }: { rule: RuleRow }) {
  const [enabled, setEnabled] = useState(rule.enabled)
  const [toggle, pending] = useAction(toggleAutomationAction, { onDone: () => undefined })
  const flip = async (next: boolean) => {
    setEnabled(next)
    const result = await toggle({ id: rule.id, enabled: next })
    if (!result.ok) setEnabled(!next)
  }
  return (
    <li className="flex flex-col gap-3 px-[23px] py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Link href={rule.bridgeHref ?? `/app/settings/automations/${rule.id}`} className="text-sm font-medium text-white hover:underline">
          {rule.name}
        </Link>
        {rule.description ? <p className="text-[13px] text-fg-2">{rule.description}</p> : null}
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-3">
          <span>{rule.trigger}</span>
          {rule.timing ? <span>· {rule.timing}</span> : null}
          {rule.channels.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </p>
      </div>
      <Switch checked={enabled} disabled={pending} onCheckedChange={(next) => void flip(next)} aria-label={`${rule.name}: ${enabled ? 'on' : 'off'}`} />
    </li>
  )
}

/** Ready recipes by area, each with its on/off switch; the name opens the editor. */
export function AutomationList({ rules }: { rules: RuleRow[] }) {
  return (
    <div className="space-y-4">
      {AREAS.map((area) => {
        const rows = rules.filter((r) => r.area === area.key)
        if (!rows.length) return null
        return (
          <section key={area.key} className="card-table">
            <h2 className="px-[23px] pb-2 pt-[17px] text-sm font-semibold uppercase tracking-[0.04em] text-white">{area.label}</h2>
            <ul className="divide-y divide-line border-t border-line">
              {rows.map((rule) => (
                <Row key={rule.id} rule={rule} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
