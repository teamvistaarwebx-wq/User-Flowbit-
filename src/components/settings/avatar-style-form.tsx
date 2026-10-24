'use client'

import { UserRoundPen } from 'lucide-react'
import { useState } from 'react'
import { AVATAR_STYLE_LABEL, AVATAR_STYLES, type AvatarStyle } from '@/lib/avatar-pattern'
import { cn } from '@/lib/utils'
import { saveAvatarStyle } from '@/modules/settings/appearance-actions'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Card, CardHeader } from '@/components/ui/card'

const SAMPLE = ['Asha Rao', 'Vikram Singh', 'Meera Iyer', 'Kabir Shah']

/** Settings → Appearance: how people without a photo look across the workspace. */
export function AvatarStyleForm({ initial }: { initial: AvatarStyle }) {
  const [style, setStyle] = useState<AvatarStyle>(initial)
  const [save, saving] = useAction(saveAvatarStyle)
  const choose = (next: AvatarStyle) => {
    setStyle(next)
    void save({ style: next })
  }
  return (
    <Card variant="solid" className="col-span-12">
      <CardHeader label="Default avatars" icon={<UserRoundPen />} description="For everyone without a profile photo, in every list and card of this workspace." />
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Avatar style">
        {AVATAR_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={style === s}
            disabled={saving}
            onClick={() => choose(s)}
            className={cn('press flex items-center justify-between gap-3 rounded-[10px] border p-3 text-left transition-colors', style === s ? 'border-white/60 bg-white/[0.06]' : 'border-white/[0.1] hover:bg-white/[0.04]')}
          >
            <span className="text-sm text-white">{AVATAR_STYLE_LABEL[s]}</span>
            <span className="flex -space-x-2">{SAMPLE.map((n) => <Avatar key={n} name={n} size="sm" ring className={s === 'pattern' ? 'avatar-force-pattern' : 'avatar-force-initials'} />)}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}
