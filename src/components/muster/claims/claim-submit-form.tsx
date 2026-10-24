'use client'

import { LogOut, Send } from 'lucide-react'
import { submitClaim, endClaimSession } from '@/modules/muster/claims/public-actions'
import { PAYMENT_METHODS } from '@/modules/muster/claims/constants'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

type Props = { slug: string; categories: { value: string; label: string }[]; requiresReceipt: boolean; capHint: string | null; today: string }

/** The expense form on the public claim page. Input is kept on refusal (including a lapsed session). */
export function ClaimSubmitForm({ slug, categories, requiresReceipt, capHint, today }: Props) {
  return (
    <ActionForm action={submitClaim} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="slug" value={slug} />
      <FormField name="categoryId" label="Category" required>
        <NativeSelect id="categoryId" name="categoryId" options={categories} placeholder="Choose a category" />
      </FormField>
      <FormField name="expenseDate" label="Date of expense" required>
        <DateInput id="expenseDate" name="expenseDate" max={today} defaultValue={today} />
      </FormField>
      <FormField name="amount" label="Amount (₹)" required help={capHint ?? undefined}>
        <Input id="amount" name="amount" inputMode="decimal" placeholder="1250" />
      </FormField>
      <FormField name="vendor" label="Paid to">
        <Input id="vendor" name="vendor" placeholder="Hotel, cab, shop" />
      </FormField>
      <FormField name="purpose" label="What it was for" required className="sm:col-span-2">
        <Input id="purpose" name="purpose" placeholder="Client lunch with Sharma Organics" />
      </FormField>
      <FormField name="project" label="Client or project">
        <Input id="project" name="project" placeholder="Optional" />
      </FormField>
      <FormField name="paymentMethod" label="Paid by">
        <NativeSelect id="paymentMethod" name="paymentMethod" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} placeholder="Choose" />
      </FormField>
      <FormField name="description" label="Anything HR should know" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={2} />
      </FormField>
      <FormField name="receipt" label="Receipt" required={requiresReceipt} className="sm:col-span-2">
        <FileUpload name="receipt" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" hint={`PDF or photo, up to ${MAX_UPLOAD_LABEL}`} />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton icon={<Send className="size-4" />} pendingLabel="Submitting…">
          Submit claim
        </SubmitButton>
      </div>
    </ActionForm>
  )
}

export function ClaimSignOut({ slug }: { slug: string }) {
  const [run, pending] = useAction(endClaimSession)
  return (
    <Button variant="ghost" size="sm" icon={<LogOut className="size-3.5" />} loading={pending} onClick={() => run({ slug })}>
      Not you? Sign out
    </Button>
  )
}
