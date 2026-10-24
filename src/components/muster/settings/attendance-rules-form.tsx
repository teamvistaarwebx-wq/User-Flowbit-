'use client'

import { AlarmClock, CalendarCog, Coffee } from 'lucide-react'
import { BREAK_LABEL, BREAK_TYPES, type BreakPolicies } from '@/lib/break-types'
import { Checkbox } from '@/components/ui/checkbox'
import { GlassBreakIcon } from '../ui/glass-break-icon'
import { WEEKDAY_SHORT } from '@/lib/dates'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { ChipGroup } from '@/components/ui/chip-group'
import { DateInput, Input } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import { saveAttendanceRules } from '@/modules/muster/settings/rule-actions'

type Rules = { start: string; end: string; graceMinutes: number; halfDayHours: number; workWeek: number[]; unmarkedPolicy: string; correctionWindowDays: number; compOffValidDays: number; breaks: BreakPolicies }

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0]

/** Office hours, late threshold, half-day hours, work week, how unmarked days count, and the break types. */
export function AttendanceRulesForm({ rules, canWrite }: { rules: Rules; canWrite: boolean }) {
  return (
    <ActionForm action={saveAttendanceRules} className="grid grid-cols-12 gap-4">
      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="Office hours" icon={<AlarmClock />} description="The one place to edit working hours: the check-in widget, the register, payroll and Work timesheets use them." />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="start" label="Day starts"><DateInput type="time" id="start" name="start" defaultValue={rules.start} disabled={!canWrite} /></FormField>
          <FormField name="end" label="Day ends"><DateInput type="time" id="end" name="end" defaultValue={rules.end} disabled={!canWrite} /></FormField>
          <FormField name="graceMinutes" label="Late after (minutes past start)" help={`Checking in after ${rules.start} + this counts as late`}><Input id="graceMinutes" name="graceMinutes" inputMode="numeric" defaultValue={rules.graceMinutes} disabled={!canWrite} /></FormField>
          <FormField name="halfDayHours" label="Half day under (hours)" help="Checking out with fewer worked hours marks a half day"><Input id="halfDayHours" name="halfDayHours" inputMode="decimal" defaultValue={rules.halfDayHours} disabled={!canWrite} /></FormField>
          <FormField name="workWeek" label="Working days" className="sm:col-span-2" help="The rest are weekly offs">
            <ChipGroup multiple name="workWeek" defaultValue={rules.workWeek.map(String)} options={MONDAY_FIRST.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))} disabled={!canWrite} />
          </FormField>
        </div>
      </Card>
      <Card variant="solid" className="col-span-12 lg:col-span-6">
        <CardHeader label="Register rules" icon={<CalendarCog />} />
        <FormField name="unmarkedPolicy" label="A working day with no check-in and no mark counts as">
          <RadioCards
            name="unmarkedPolicy"
            defaultValue={rules.unmarkedPolicy}
            columns={3}
            options={[
              { value: 'present', title: 'Present', description: 'Paid, shown as assumed' },
              { value: 'absent', title: 'Absent', description: 'Costs a day’s pay' },
              { value: 'pending', title: 'Unmarked', description: 'Blocks the month lock' },
            ]}
          />
        </FormField>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField name="correctionWindowDays" label="Corrections allowed within (days)"><Input id="correctionWindowDays" name="correctionWindowDays" inputMode="numeric" defaultValue={rules.correctionWindowDays} disabled={!canWrite} /></FormField>
          <FormField name="compOffValidDays" label="Comp-off lapses after (days)" help="0 means it never lapses"><Input id="compOffValidDays" name="compOffValidDays" inputMode="numeric" defaultValue={rules.compOffValidDays} disabled={!canWrite} /></FormField>
        </div>
      </Card>
      <Card variant="solid" className="col-span-12">
        <CardHeader label="Break types" icon={<Coffee />} description="Take break asks which one. Paid breaks count towards payable hours, up to their daily limit; time past the limit and unpaid breaks do not." />
        <div className="divide-y divide-white/[0.06]">
          {BREAK_TYPES.map((t) => (
            <div key={t} className="grid grid-cols-1 items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto_10rem]">
              <span className="flex items-center gap-2.5 text-sm text-white"><GlassBreakIcon type={t} size={26} />{BREAK_LABEL[t]}</span>
              <Checkbox name={`breaks.${t}.paid`} defaultChecked={rules.breaks[t].paid} disabled={!canWrite} label="Paid" />
              <FormField name={`breaks.${t}.limitMinutes`} label="Daily limit (minutes)">
                <Input id={`breaks.${t}.limitMinutes`} name={`breaks.${t}.limitMinutes`} inputMode="numeric" defaultValue={rules.breaks[t].limitMinutes} disabled={!canWrite} />
              </FormField>
            </div>
          ))}
        </div>
      </Card>
      {canWrite ? <div className="col-span-12 flex justify-end"><SubmitButton>Save attendance rules</SubmitButton></div> : null}
    </ActionForm>
  )
}
