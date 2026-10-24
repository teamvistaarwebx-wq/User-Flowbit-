'use client'

import { useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Select } from '@/components/ui/select'
import { DEMO_REQUEST_STATUSES } from '@/modules/marketing/demo'
import { setDemoRequestStatus } from '@/modules/console/account-actions'

type Status = (typeof DEMO_REQUEST_STATUSES)[number]
const LABEL: Record<Status, string> = { new: 'New', contacted: 'Contacted', closed: 'Closed' }
const OPTIONS = DEMO_REQUEST_STATUSES.map((s) => ({ value: s, label: LABEL[s] }))
const isStatus = (value: string): value is Status => (DEMO_REQUEST_STATUSES as readonly string[]).includes(value)

/** Status picker for one demo request on the Console home. */
export function DemoStatusSelect({ id, status, company }: { id: string; status: Status; company: string }) {
  const [value, setValue] = useState<Status>(status)
  const [run, pending] = useAction(setDemoRequestStatus)
  const change = async (next: string) => {
    if (!isStatus(next) || next === value) return
    const previous = value
    setValue(next)
    const result = await run({ id, status: next })
    if (!result.ok) setValue(previous)
  }
  return <Select size="sm" value={value} onValueChange={change} options={OPTIONS} disabled={pending} aria-label={`Status of ${company}'s demo request`} className="w-[140px]" />
}
