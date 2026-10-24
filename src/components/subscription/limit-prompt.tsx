'use client'

import { useEffect, useState } from 'react'
import { registerLimitPrompt, type LimitPromptDetail } from '@/lib/limit-prompt'
import { Dialog } from '@/components/ui/dialog'
import { useShell } from '@/components/shell/shell-context'
import { StartTrialButton, UpgradeLink } from './lifecycle-buttons'

/**
 * "Upgrade or start a 15-day trial" (console spec 4.2): opens when an action
 * is refused for a 6th person on the Free plan (lib/limit-prompt). People who
 * cannot manage billing are told to ask the owner.
 */
export function LimitPrompt() {
  const shell = useShell()
  const [detail, setDetail] = useState<LimitPromptDetail | null>(null)
  useEffect(() => registerLimitPrompt(setDetail), [])
  const close = () => setDetail(null)
  const canBuy = shell.can('billing.manage')
  const trial = Boolean(detail?.trialAvailable && canBuy)
  return (
    <Dialog
      open={detail !== null}
      onOpenChange={(open) => (open ? null : close())}
      size="sm"
      title="You've reached the Free plan's limit"
      description={detail?.message}
      footer={
        canBuy ? (
          <>
            {trial ? <StartTrialButton size="md" onDone={close} /> : null}
            <UpgradeLink size="md" onClick={close} />
          </>
        ) : null
      }
    >
      <p className="text-sm text-fg-2">
        {canBuy
          ? trial
            ? 'Upgrade to a plan for your team size, or try every product with everyone on a free trial first. The trial can be started once.'
            : 'This workspace has already had its trial. Choose a plan for your team size to add more people.'
          : 'Ask your workspace owner to upgrade the plan or start a trial.'}
      </p>
    </Dialog>
  )
}
