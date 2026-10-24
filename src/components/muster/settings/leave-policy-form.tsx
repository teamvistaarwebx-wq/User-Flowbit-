'use client'

import { Scale } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, NativeSelect } from '@/components/ui/input'
import { saveLeavePolicy } from '@/modules/muster/settings/rule-actions'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Policy = { leaveYearStartMonth: number; carryForwardPercent: number; allowNegativeBalance: boolean; internDays: number; probationDays: number; confirmedDays: number }

/** Leave year, carry forward and notice periods. */
export function LeavePolicyForm({ policy, canWrite }: { policy: Policy; canWrite: boolean }) {
  return (
    <Card variant="solid">
      <CardHeader label="Leave and notice policy" icon={<Scale />} description="Balances and notice terms follow these unless a contract says otherwise." />
      <ActionForm action={saveLeavePolicy} className="grid gap-4 sm:grid-cols-3">
        <FormField name="leaveYearStartMonth" label="Leave year starts in"><NativeSelect id="leaveYearStartMonth" name="leaveYearStartMonth" defaultValue={String(policy.leaveYearStartMonth)} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} disabled={!canWrite} /></FormField>
        <FormField name="carryForwardPercent" label="Carry forward (%)" help="Share of an unused balance that moves to next year"><Input id="carryForwardPercent" name="carryForwardPercent" inputMode="numeric" defaultValue={policy.carryForwardPercent} disabled={!canWrite} /></FormField>
        <FormField name="allowNegativeBalance" label="Negative balance"><Checkbox name="allowNegativeBalance" defaultChecked={policy.allowNegativeBalance} disabled={!canWrite} label="Allow leave beyond the balance as paid" /></FormField>
        <FormField name="internDays" label="Notice for interns (days)"><Input id="internDays" name="internDays" inputMode="numeric" defaultValue={policy.internDays} disabled={!canWrite} /></FormField>
        <FormField name="probationDays" label="Notice on probation (days)"><Input id="probationDays" name="probationDays" inputMode="numeric" defaultValue={policy.probationDays} disabled={!canWrite} /></FormField>
        <FormField name="confirmedDays" label="Notice once confirmed (days)"><Input id="confirmedDays" name="confirmedDays" inputMode="numeric" defaultValue={policy.confirmedDays} disabled={!canWrite} /></FormField>
        {canWrite ? <div className="flex justify-end sm:col-span-3"><SubmitButton>Save policy</SubmitButton></div> : null}
      </ActionForm>
    </Card>
  )
}
