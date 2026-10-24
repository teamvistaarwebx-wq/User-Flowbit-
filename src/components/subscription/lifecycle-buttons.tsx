'use client'

import Link from 'next/link'
import { Download, Sparkles, Users } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button, type ButtonSize } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { returnToFreeAction, startTrialAction } from '@/modules/subscription/free-trial-actions'

/** The lifecycle actions (console spec 4.2, 4.3): Upgrade, Start trial, Stay on Free, Export. */

export const EXPORT_DOWNLOAD_HREF = '/api/settings/export'
export const UPGRADE_HREF = '/app/settings/subscription#plans'

export function UpgradeLink({ size = 'sm', onClick }: { size?: ButtonSize; onClick?: () => void }) {
  return (
    <Link href={UPGRADE_HREF} onClick={onClick} className={buttonClass('primary', size)}>
      Upgrade
    </Link>
  )
}

export function StartTrialButton({ size = 'sm', onDone }: { size?: ButtonSize; onDone?: () => void }) {
  const [run, pending] = useAction(startTrialAction, { onDone })
  return (
    <Button size={size} variant="secondary" loading={pending} icon={<Sparkles className="size-4" strokeWidth={1.5} />} onClick={() => run({})}>
      Start 15-day trial
    </Button>
  )
}

export function ReturnToFreeButton({ size = 'sm' }: { size?: ButtonSize }) {
  const [run, pending] = useAction(returnToFreeAction)
  return (
    <Button size={size} variant="secondary" loading={pending} icon={<Users className="size-4" strokeWidth={1.5} />} onClick={() => run({})}>
      Stay on Free (5 people)
    </Button>
  )
}

/** A plain download link: the route streams the ZIP, so no client code is needed. */
export function ExportLink({ size = 'sm' }: { size?: ButtonSize }) {
  return (
    <a href={EXPORT_DOWNLOAD_HREF} download className={buttonClass('outline', size)}>
      <Download className="size-4" strokeWidth={1.5} />
      Export data
    </a>
  )
}
