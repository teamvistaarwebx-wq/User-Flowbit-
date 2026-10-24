import { Briefcase, Code, Folder, Globe, Heart, Megaphone, Palette, Rocket, Star, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpaceIcon } from '@/modules/work/spaces/constants'

export const SPACE_ICON_MAP: Record<SpaceIcon, LucideIcon> = {
  folder: Folder, rocket: Rocket, palette: Palette, code: Code, megaphone: Megaphone, briefcase: Briefcase, users: Users, heart: Heart, globe: Globe, star: Star,
}

/**
 * The space's icon on a solid square in its colour, muted towards the page like the Figma workspace avatar
 * (#784082, radius 6): a white glyph, no outline, no glow.
 */
export function SpaceTile({ icon, color, size = 'md', className }: { icon: string; color: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = SPACE_ICON_MAP[icon as SpaceIcon] ?? Folder
  const box = { sm: 'size-7 rounded-[6px] [&_svg]:size-3.5', md: 'size-9 rounded-[8px] [&_svg]:size-[18px]', lg: 'size-11 rounded-[10px] [&_svg]:size-5' }[size]
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]', box, className)} style={{ background: `color-mix(in srgb, ${color} 62%, #1A1A1A)` }}>
      <Icon aria-hidden />
    </span>
  )
}
