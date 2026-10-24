'use client'

import { Camera, Languages, UserRound } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { FileUpload } from '@/components/ui/file-upload'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useT } from '@/components/shell/use-t'
import { setLocaleAction } from '@/lib/core-actions'
import { LOCALE_LABEL, LOCALES, type Locale } from '@/lib/i18n'
import { removeAvatar, updateProfile, uploadAvatar } from '@/modules/settings/account-actions'
import { COMMON_TIME_ZONES } from '@/lib/skills'

export function ProfileCard({ name, email, title, skills = [], timezone = '' }: { name: string; email: string; title: string; skills?: string[]; timezone?: string }) {
  return (
    <Card variant="solid">
      <CardHeader label="Your details" icon={<UserRound />} description="Your name shows on tasks, approvals and the audit log in every workspace." />
      <ActionForm action={updateProfile} className="grid gap-4 sm:grid-cols-2">
        <FormField name="name" label="Full name" required>
          <Input id="name" name="name" defaultValue={name} maxLength={80} autoComplete="name" />
        </FormField>
        <FormField name="title" label="Job title" help="In this workspace">
          <Input id="title" name="title" defaultValue={title} maxLength={60} placeholder="e.g. Designer" />
        </FormField>
        <FormField name="skills" label="Skills" help="Comma-separated, in this workspace. Teammates find you with “who knows…” on team pages.">
          <Input id="skills" name="skills" defaultValue={skills.join(', ')} maxLength={1000} placeholder="e.g. Figma, SEO, Meta Ads" />
        </FormField>
        <FormField name="timezone" label="Time zone" help="Shows your local time on team cards. Blank uses the workspace's.">
          <Input id="timezone" name="timezone" defaultValue={timezone} list="profile-timezones" maxLength={64} placeholder="Asia/Kolkata" autoComplete="off" />
          <datalist id="profile-timezones">{COMMON_TIME_ZONES.map((z) => <option key={z} value={z} />)}</datalist>
        </FormField>
        <FormField label="Your sign-in email" className="sm:col-span-2" help="Ask a workspace owner to invite a different email if this one changes.">
          <Input value={email} readOnly disabled />
        </FormField>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>Save profile</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}

export function AvatarCard({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [remove, removing] = useAction(removeAvatar)
  return (
    <Card variant="solid">
      <CardHeader label="Photo" icon={<Camera />} description="PNG, JPG or WebP under 2 MB." />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <Avatar name={name} src={avatarUrl} size="xl" className="ring-[1.5px] ring-white" />
        <ActionForm action={uploadAvatar} resetOnSuccess className="w-full flex-1 space-y-3">
          <FormField name="avatar">
            <FileUpload name="avatar" accept="image/png,image/jpeg,image/webp" maxMb={2} hint="PNG, JPG or WebP · up to 2 MB" />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2">
            {avatarUrl ? (
              <Button variant="ghost" loading={removing} onClick={() => remove({})}>
                Remove photo
              </Button>
            ) : null}
            <SubmitButton pendingLabel="Uploading…">Upload photo</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </Card>
  )
}

/** Language of My HR, check-in, leave and payslips (the rest of the app stays English). */
export function LanguageCard({ locale }: { locale: Locale }) {
  const t = useT()
  const [run, pending] = useAction(setLocaleAction)
  return (
    <Card variant="solid">
      <CardHeader label={t('lang.label')} icon={<Languages />} description={t('lang.description')} />
      <Select aria-label={t('lang.label')} value={locale} disabled={pending} onValueChange={(next) => run({ locale: next as Locale })} options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABEL[l] }))} />
    </Card>
  )
}
