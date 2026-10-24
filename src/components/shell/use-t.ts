'use client'

import { useMemo } from 'react'
import { translator, type Translate } from '@/lib/i18n'
import { useShell } from './shell-context'

/** `t()` in the signed-in user's language (Settings → Profile → Language). */
export function useT(): Translate {
  const { user } = useShell()
  return useMemo(() => translator(user.locale), [user.locale])
}
