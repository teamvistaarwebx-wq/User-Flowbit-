'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, CalendarClock, Check, Loader2, MapPin, X } from 'lucide-react'
import { TEAM_SIZE_VALUES } from '@/lib/account-types'
import { PRODUCTS } from '@/lib/catalog'
import { WORKSPACE_KIND_DEFS, WORKSPACE_KINDS, type WorkspaceKind } from '@/lib/workspace-kind'
import { WEEKDAY_SHORT } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { Card, CardHeader } from '@/components/ui/card'
import { ChipGroup } from '@/components/ui/chip-group'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateInput, Input } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { checkWorkspaceSlug, deleteWorkspace, saveWorkingCalendar, updateWorkspace, type SlugStatus } from '@/modules/settings/general-actions'

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]
const SLUG_DEBOUNCE_MS = 300

const SLUG_HINT: Record<SlugStatus, { text: string; tone: string }> = {
  current: { text: 'Your current URL', tone: 'text-fg-3' },
  available: { text: 'Available', tone: 'text-success' },
  taken: { text: 'Taken', tone: 'text-danger' },
  reserved: { text: 'Reserved', tone: 'text-danger' },
  invalid: { text: 'Use 3–40 lowercase letters, numbers and single hyphens', tone: 'text-warning' },
}

function SlugField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<SlugStatus | 'checking'>('current')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const onChange = (next: string) => {
    const clean = next.toLowerCase().replace(/\s+/g, '-')
    setValue(clean)
    setStatus('checking')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const res = await checkWorkspaceSlug({ slug: clean })
      setStatus(res.ok && res.data ? res.data.status : 'invalid')
    }, SLUG_DEBOUNCE_MS)
  }
  const hint = status === 'checking' ? null : SLUG_HINT[status]
  return (
    <FormField name="slug" label="Workspace URL" required help={value !== initial && status === 'available' ? `Your workspace URL changes to useflowbit.com/${value}.` : undefined}>
      <Input
        id="slug"
        name="slug"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        icon={<span className="text-xs">useflowbit.com/</span>}
        className="[&_input]:pl-[92px]"
        trailing={status === 'checking' ? <Loader2 className="size-4 animate-spin" /> : status === 'available' || status === 'current' ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger" />}
      />
      {hint ? <p className={cn('mt-1 text-xs', hint.tone)}>{hint.text}</p> : null}
    </FormField>
  )
}

export function WorkspaceCard({ org, canChangeKind }: { org: { name: string; slug: string; teamSize: string; mode: string; workspaceKind: WorkspaceKind }; canChangeKind: boolean }) {
  return (
    <Card variant="solid">
      <CardHeader label="Workspace" icon={<Building2 />} description="Shown in the workspace switcher, emails and the header of every PDF." />
      <ActionForm action={updateWorkspace} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="name" label="Workspace name" required>
            <Input id="name" name="name" defaultValue={org.name} maxLength={60} />
          </FormField>
          <SlugField initial={org.slug} />
        </div>
        <FormField name="teamSize" label="How many people use this workspace?">
          <ChipGroup name="teamSize" defaultValue={org.teamSize} options={TEAM_SIZE_VALUES.filter((s) => s !== '2-10' || org.teamSize === s).map((s) => ({ value: s, label: s.replace('-', '–') }))} size="sm" />
        </FormField>
        <FormField name="workspaceKind" label="Workspace type" help={canChangeKind ? 'Decides which products, roles and settings show. Nothing is deleted when you change it.' : 'Only the owner can change this.'}>
          {canChangeKind ? (
            <RadioCards name="workspaceKind" columns={3} defaultValue={org.workspaceKind} options={WORKSPACE_KINDS.map((k) => ({ value: k, title: WORKSPACE_KIND_DEFS[k].label, description: WORKSPACE_KIND_DEFS[k].products.map((p) => PRODUCTS[p].shortName).join(' · ') }))} />
          ) : (
            <>
              <input type="hidden" name="workspaceKind" value={org.workspaceKind} />
              <p className="text-sm text-white">{WORKSPACE_KIND_DEFS[org.workspaceKind].label}</p>
            </>
          )}
        </FormField>
        <FormField name="mode" label="How you work">
          <RadioCards
            name="mode"
            defaultValue={org.mode}
            options={[
              { value: 'project', title: 'Project-based', description: 'Workspace → Projects → Tasks → Subtasks' },
              { value: 'personal', title: 'Personal tasks', description: 'Workspace → My Tasks, no project setup' },
            ]}
          />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton>Save workspace</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}

/** Address, GSTIN and logo moved to Settings → Company profile; General links there instead of repeating them. */
export function CompanyProfileLink({ legalName, gstin }: { legalName: string; gstin: string | null }) {
  return (
    <Card variant="solid">
      <CardHeader label="Company profile" icon={<MapPin />} description="Legal name, address, GSTIN, logo and authorised signatories for every PDF." />
      <p className="text-[13px] text-fg-2">{legalName}{gstin ? ` · GSTIN ${gstin}` : ' · Not registered under GST'}</p>
      <div className="mt-3 flex justify-end">
        <Link href="/app/settings/company" className={buttonClass('secondary', 'sm')}>Open company profile</Link>
      </div>
    </Card>
  )
}

/**
 * Working hours. With Muster on they are edited in HR settings → Attendance rules (one place), so this card only
 * shows them, with a link there (`editHref`).
 */
export function CalendarCard({ start, end, halfDayHours, workWeek, editHref }: { start: string; end: string; halfDayHours: number; workWeek: number[]; editHref?: string | null }) {
  if (editHref) {
    return (
      <Card variant="solid">
        <CardHeader label="Working calendar" icon={<CalendarClock />} description="Muster's attendance rules set these for the whole workspace: the check-in widget, timesheets, attendance and payroll use them." />
        <p className="text-[13px] text-fg-2">
          {start}–{end} · half day under {halfDayHours} h · {MONDAY_FIRST.filter((d) => workWeek.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')}
        </p>
        <div className="mt-3 flex justify-end">
          <Link href={editHref} className={buttonClass('secondary', 'sm')}>Edit in Attendance rules</Link>
        </div>
      </Card>
    )
  }
  return (
    <Card variant="solid">
      <CardHeader label="Working calendar" icon={<CalendarClock />} description="The check-in widget, timesheets, attendance and payroll working days use these." />
      <ActionForm action={saveWorkingCalendar} className="grid gap-4 sm:grid-cols-2">
        <FormField name="start" label="Day starts">
          <DateInput type="time" id="start" name="start" defaultValue={start} />
        </FormField>
        <FormField name="end" label="Day ends">
          <DateInput type="time" id="end" name="end" defaultValue={end} />
        </FormField>
        <FormField name="halfDayHours" label="Half day under (hours)">
          <Input id="halfDayHours" name="halfDayHours" defaultValue={halfDayHours} inputMode="decimal" />
        </FormField>
        <FormField name="workWeek" label="Working days" className="sm:col-span-2">
          <ChipGroup multiple name="workWeek" defaultValue={workWeek.map(String)} options={MONDAY_FIRST.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))} size="sm" />
        </FormField>
        <p className="text-xs text-fg-3 sm:self-center">Time zone: Asia/Kolkata (IST)</p>
        <div className="flex justify-end">
          <SubmitButton>Save hours</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}

export function DangerZone({ slug }: { slug: string }) {
  return (
    <Card variant="solid">
      <CardHeader label="Delete workspace" icon={<AlertTriangle />} description="Everyone loses access now. Billing stops. Data is kept for 30 days in case you change your mind (write to support to restore it), then removed for good. We email you the date." />
      <ConfirmDialog
        trigger={<Button variant="danger">Delete workspace</Button>}
        title="Delete this workspace?"
        description="Everyone loses access now. Billing stops. Data is kept for 30 days in case you change your mind (write to support to restore it), then removed for good. We email you the date."
        confirmLabel="Delete workspace"
        reason={{ label: `Type ${slug} to confirm`, placeholder: slug, required: true }}
        onConfirm={async (confirm) => {
          const result = await deleteWorkspace({ confirm: confirm ?? '' })
          if (result.ok) window.location.assign(result.redirect ?? '/app')
          return result
        }}
      />
    </Card>
  )
}
