'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { FormField } from '@/components/ui/action-form'
import { IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ChipGroup } from '@/components/ui/chip-group'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { BUILTIN_ROLES, BUILTIN_ROLE_KEYS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '@/modules/work/posts/polls'
import { POST_TYPE_META, type PostType } from '@/modules/work/posts/post-types'
import type { GroupOptions } from '@/modules/work/posts/audience'
import { PostTypeIcon } from './post-type-icon'

const ROLE_CHIPS = BUILTIN_ROLE_KEYS.map((k) => ({ value: k, label: BUILTIN_ROLES[k].label }))

/** Post type as a radio group of icon chips (arrow keys move, as native radios do). */
export function TypePicker({ types, value, onChange }: { types: PostType[]; value: PostType; onChange: (type: PostType) => void }) {
  return (
    <fieldset className="sm:col-span-3">
      <legend className="mb-2 text-sm font-medium text-fg">Type</legend>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {types.map((t) => (
          <label key={t} className={cn('press flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/40', value === t ? 'border-transparent bg-chip-active text-white' : 'border-white/[0.12] bg-control text-fg-2 hover:border-white/25')}>
            <input type="radio" name="category" value={t} checked={value === t} onChange={() => onChange(t)} className="sr-only" />
            <PostTypeIcon type={t} />
            {POST_TYPE_META[t].label}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-3">{POST_TYPE_META[value].hint}</p>
    </fieldset>
  )
}

/** Two to eight options, single or multiple choice, anonymous, optional close date. */
export function PollFields() {
  const [options, setOptions] = useState(['', ''])
  const set = (i: number, v: string) => setOptions((cur) => cur.map((o, j) => (j === i ? v : o)))
  return (
    <div className="space-y-3 sm:col-span-3">
      <FormField name="pollOptions" label="Options" required>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input name="pollOptions[]" value={o} maxLength={120} onChange={(e) => set(i, e.target.value)} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
              {options.length > MIN_POLL_OPTIONS ? <IconButton label={`Remove option ${i + 1}`} size="sm" onClick={() => setOptions((cur) => cur.filter((_, j) => j !== i))}><X className="size-4" /></IconButton> : null}
            </div>
          ))}
          {options.length < MAX_POLL_OPTIONS ? (
            <button type="button" onClick={() => setOptions((cur) => [...cur, ''])} className="inline-flex items-center gap-1 text-[13px] text-link hover:underline"><Plus className="size-3.5" /> Add option</button>
          ) : null}
        </div>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <Checkbox name="pollMultiple" label="Allow several choices" />
        <Checkbox name="pollAnonymous" label="Anonymous votes" description="Nobody sees who voted for what." />
        <FormField name="pollClosesOn" label="Closes on" help="Optional">
          <DateInput id="pollClosesOn" name="pollClosesOn" />
        </FormField>
      </div>
    </div>
  )
}

export function EventFields({ startsAt, place }: { startsAt?: string; place?: string }) {
  return (
    <>
      <FormField name="eventAt" label="When" required>
        <DateInput id="eventAt" name="eventAt" type="datetime-local" defaultValue={startsAt} />
      </FormField>
      <FormField name="eventPlace" label="Where" className="sm:col-span-2" help="Optional: a room, an address or a meeting link">
        <Input id="eventPlace" name="eventPlace" maxLength={200} defaultValue={place} />
      </FormField>
    </>
  )
}

/** Open teams can be joined by anyone, who then reads what is posted to the team (R3 M2). */
const OPEN_TEAM_HINT = 'Anyone can join an open team and then see posts sent to it. For private posts, pick invite-only teams.'

export type AudienceDefaults = { audience?: string; targetRoles?: string[]; targetTeamIds?: string[]; targetDepartments?: string[]; targetLocations?: string[] }

/** Everyone, some roles, some teams / departments / locations (only the kinds this workspace has), or only mentioned people. */
export function AudienceFields({ groups, defaults }: { groups: GroupOptions; defaults: AudienceDefaults }) {
  const [audience, setAudience] = useState(defaults.audience ?? 'org')
  const hasGroups = groups.teams.length + groups.departments.length + groups.locations.length > 0
  const options = [
    { value: 'org', label: 'Everyone' },
    { value: 'roles', label: 'Some roles' },
    ...(hasGroups ? [{ value: 'groups', label: 'Teams, departments or locations' }] : []),
    { value: 'private', label: 'Only mentioned people' },
  ]
  return (
    <>
      <FormField name="audience" label="Audience">
        <Select name="audience" value={audience} onValueChange={setAudience} options={options} />
      </FormField>
      {audience === 'roles' ? (
        <FormField name="targetRoles" label="Roles" className="sm:col-span-3">
          <ChipGroup name="targetRoles" multiple size="sm" options={ROLE_CHIPS} defaultValue={defaults.targetRoles} />
        </FormField>
      ) : null}
      {audience === 'groups' ? (
        <div className="space-y-3 sm:col-span-3">
          {groups.teams.length ? (
            <FormField name="targetTeamIds" label="Teams" help={groups.teams.some((t) => !t.isPrivate) ? OPEN_TEAM_HINT : undefined}>
              <ChipGroup name="targetTeamIds" multiple size="sm" options={groups.teams.map((t) => ({ value: t.id, label: t.isPrivate ? `${t.name} (invite only)` : t.name }))} defaultValue={defaults.targetTeamIds} />
            </FormField>
          ) : null}
          {groups.departments.length ? (
            <FormField name="targetDepartments" label="Departments">
              <ChipGroup name="targetDepartments" multiple size="sm" options={groups.departments.map((d) => ({ value: d, label: d }))} defaultValue={defaults.targetDepartments} />
            </FormField>
          ) : null}
          {groups.locations.length ? (
            <FormField name="targetLocations" label="Locations">
              <ChipGroup name="targetLocations" multiple size="sm" options={groups.locations.map((l) => ({ value: l, label: l }))} defaultValue={defaults.targetLocations} />
            </FormField>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** Publish now, or at an IST date and time (the posts cron publishes it within 15 minutes). */
export function ScheduleField({ defaultAt }: { defaultAt?: string }) {
  const [later, setLater] = useState(Boolean(defaultAt))
  return (
    <>
      <FormField name="publishWhen" label="Publish">
        <Select value={later ? 'later' : 'now'} onValueChange={(v) => setLater(v === 'later')} options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'At a set time' }]} />
      </FormField>
      {later ? (
        <FormField name="publishAt" label="Publish at (IST)" help="Goes out within 15 minutes of this time.">
          <DateInput id="publishAt" name="publishAt" type="datetime-local" defaultValue={defaultAt} />
        </FormField>
      ) : null}
    </>
  )
}
