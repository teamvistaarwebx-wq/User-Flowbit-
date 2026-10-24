'use client'

import { useState } from 'react'
import type { ProductKey } from '@/lib/catalog'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { setProductEnabled } from '@/modules/settings/workspace-actions'

/** On/off for an entitled product; turning off asks first (nothing is deleted). */
export function ModuleSwitch({ product, name, enabled }: { product: ProductKey; name: string; enabled: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [run, pending] = useAction(setProductEnabled)
  // Close on any answer: a refusal (e.g. the last product) is explained by its toast.
  const turnOff = () => run({ product, enabled: false }).then(() => setConfirming(false))
  return (
    <>
      <Switch aria-label={`${name} on or off`} checked={enabled} disabled={pending} onCheckedChange={(next) => (next ? run({ product, enabled: true }) : setConfirming(true))} />
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        size="sm"
        title={`Turn off ${name}?`}
        description="Its pages leave the menu for everyone. Nothing is deleted. Turn it back on any time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it on</Button>
            <Button variant="danger" loading={pending} onClick={turnOff}>Turn off</Button>
          </>
        }
      />
    </>
  )
}
