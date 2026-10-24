'use client'

import { BookOpen, CircleHelp, LogOut, Settings, UserRound, Volume2, VolumeX } from 'lucide-react'
import Image from 'next/image'
import { REPLAY_TOUR_EVENT } from '@/components/activation/product-tour'
import { signOut as endSession } from '@/lib/sign-out'
import { play, useSoundPref } from '@/lib/sound'
import { Avatar } from '@/components/ui/avatar'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { initials } from '@/lib/utils'
import { useShell } from './shell-context'

/** The white avatar circle (Figma: 32px, initial in #200C55) with profile, settings, sound on/off and sign out. */
export function UserMenu() {
  const shell = useShell()
  const [soundOn, setSoundOn] = useSoundPref()
  const signOut = async () => {
    play('whoosh')
    await endSession()
  }
  return (
    <DropdownMenu
      className="w-64"
      header={
        <div className="mb-1 flex items-center gap-3 border-b border-white/[0.08] px-3 pb-3 pt-2">
          <Avatar name={shell.user.name} src={shell.user.avatarUrl} size="md" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{shell.user.name}</div>
            <div className="truncate text-xs text-fg-2">{shell.user.email}</div>
          </div>
        </div>
      }
      trigger={
        <button type="button" className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-white text-xs font-semibold text-[#200C55] transition-[box-shadow,transform] hover:shadow-[0_0_0_3px_rgba(255,255,255,0.14)] active:scale-95" aria-label="Account menu">
          {shell.user.avatarUrl ? (
            // unoptimized: org-checked /api/files stream, which the image optimizer would fetch without the session
            <Image src={shell.user.avatarUrl} alt="" width={32} height={32} unoptimized className="size-full object-cover" />
          ) : (
            initials(shell.user.name).slice(0, 1)
          )}
        </button>
      }
      items={[
        { label: 'My account', icon: <UserRound />, href: '/app/settings/profile' },
        { label: 'Settings', icon: <Settings />, href: shell.can('org.manage') ? '/app/settings' : '/app/settings/profile' },
        { label: soundOn ? 'Sound on' : 'Sound off', icon: soundOn ? <Volume2 /> : <VolumeX />, onSelect: () => void setSoundOn(!soundOn), shortcut: soundOn ? 'On' : 'Off' },
        { label: 'Help centre', icon: <BookOpen />, href: '/help' },
        { label: 'Help: replay the tour', icon: <CircleHelp />, onSelect: () => window.dispatchEvent(new Event(REPLAY_TOUR_EVENT)) },
        { type: 'separator' as const },
        { label: 'Sign out', icon: <LogOut />, onSelect: () => void signOut(), danger: true },
      ]}
    />
  )
}
