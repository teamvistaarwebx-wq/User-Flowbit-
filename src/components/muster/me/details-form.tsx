'use client'

import { Landmark, Phone, Save, UserRound } from 'lucide-react'
import { updateMyDetails } from '@/modules/muster/me/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { SectionLabel } from '@/components/ui/card'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { useT } from '@/components/shell/use-t'

export type MyDetails = {
  personalEmail: string
  phone: string
  dob: string
  address: string
  emergencyName: string
  emergencyPhone: string
  emergencyRelation: string
  pan: string
  uan: string
  bankName: string
  accountName: string
  accountNumber: string
  ifsc: string
}

/** The details an employee keeps up to date themselves. A changed account is sent to HR to verify. */
export function DetailsForm({ values, missing }: { values: MyDetails; missing: string[] }) {
  const t = useT()
  const hint = (key: string) => (missing.includes(key) ? t('form.hrNeeds') : undefined)
  return (
    <ActionForm action={updateMyDetails} className="space-y-5">
      <div>
        <SectionLabel icon={<UserRound />} className="mb-3">{t('form.contact')}</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="personalEmail" label={t('form.personalEmail')} help={hint('personalEmail')}>
            <Input id="personalEmail" name="personalEmail" type="email" defaultValue={values.personalEmail} />
          </FormField>
          <FormField name="phone" label={t('form.phone')} help={hint('phone')}>
            <Input id="phone" name="phone" inputMode="tel" defaultValue={values.phone} />
          </FormField>
          <FormField name="dob" label={t('form.dob')} help={hint('dob')}>
            <DateInput id="dob" name="dob" defaultValue={values.dob} />
          </FormField>
          <FormField name="address" label={t('form.address')} help={hint('address')} className="sm:col-span-3">
            <Textarea id="address" name="address" rows={2} maxLength={400} defaultValue={values.address} />
          </FormField>
        </div>
      </div>
      <div>
        <SectionLabel icon={<Phone />} className="mb-3">{t('form.emergency')}</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="emergencyName" label={t('form.name')} help={hint('emergency')}>
            <Input id="emergencyName" name="emergencyName" defaultValue={values.emergencyName} />
          </FormField>
          <FormField name="emergencyPhone" label={t('form.phone')}>
            <Input id="emergencyPhone" name="emergencyPhone" inputMode="tel" defaultValue={values.emergencyPhone} />
          </FormField>
          <FormField name="emergencyRelation" label={t('form.relation')}>
            <Input id="emergencyRelation" name="emergencyRelation" defaultValue={values.emergencyRelation} placeholder={t('form.relationHint')} />
          </FormField>
        </div>
      </div>
      <div>
        <SectionLabel icon={<Landmark />} className="mb-3">{t('form.taxBank')}</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="pan" label="PAN" help={hint('pan') ?? t('form.panHint')}>
            <Input id="pan" name="pan" defaultValue={values.pan} className="uppercase" />
          </FormField>
          <FormField name="uan" label="UAN" help={hint('uan') ?? t('form.uanHint')}>
            <Input id="uan" name="uan" inputMode="numeric" defaultValue={values.uan} />
          </FormField>
          <FormField name="bankName" label={t('form.bank')}>
            <Input id="bankName" name="bankName" defaultValue={values.bankName} />
          </FormField>
          <FormField name="accountName" label={t('form.accountHolder')}>
            <Input id="accountName" name="accountName" defaultValue={values.accountName} />
          </FormField>
          <FormField name="accountNumber" label={t('form.accountNumber')} help={hint('bank')}>
            <Input id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" defaultValue={values.accountNumber} />
          </FormField>
          <FormField name="ifsc" label="IFSC">
            <Input id="ifsc" name="ifsc" defaultValue={values.ifsc} className="uppercase" />
          </FormField>
        </div>
        <p className="mt-2 text-xs text-fg-3">{t('form.bankNote')}</p>
      </div>
      <div className="flex justify-end">
        <SubmitButton icon={<Save className="size-4" />}>{t('form.save')}</SubmitButton>
      </div>
    </ActionForm>
  )
}
