'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { ActionResult } from '@/lib/action-types'
import { Button } from '@/components/ui/button'
import type { ButtonSize, ButtonVariant } from '@/components/ui/button-styles'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Props<I extends object, K extends string> = {
  action: (input: I) => Promise<ActionResult<unknown>>
  /** The action's input without the reason field, which the dialog fills in. */
  input: NoInfer<Omit<Exclude<I, FormData>, K>>
  label: ReactNode
  title: string
  description?: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  /** Ask for a reason and send it as `reasonKey` (default 'reason'). */
  reason?: { label: string; placeholder?: string; required?: boolean }
  reasonKey?: K
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

/** A button that confirms (optionally with a reason), runs a server action, then refreshes or follows its redirect. */
export function ActionButton<I extends object, K extends string = 'reason'>({ action, input, label, title, description, confirmLabel = 'Confirm', tone = 'danger', reason, reasonKey = 'reason' as K, variant = 'ghost', size = 'sm', icon }: Props<I, K>) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={<Button variant={variant} size={size} icon={icon}>{label}</Button>}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      tone={tone}
      reason={reason}
      onConfirm={async (text) => {
        const result = await action((reason ? { ...input, [reasonKey]: text } : input) as unknown as I)
        if (result.ok) {
          if (result.redirect) router.push(result.redirect)
          else router.refresh()
        }
        return result
      }}
    />
  )
}
