import { CalendarStarIcon } from '@phosphor-icons/react/dist/ssr/CalendarStar'
import { ChartBarIcon } from '@phosphor-icons/react/dist/ssr/ChartBar'
import { ConfettiIcon } from '@phosphor-icons/react/dist/ssr/Confetti'
import { HandWavingIcon } from '@phosphor-icons/react/dist/ssr/HandWaving'
import { HandsClappingIcon } from '@phosphor-icons/react/dist/ssr/HandsClapping'
import { InfoIcon } from '@phosphor-icons/react/dist/ssr/Info'
import { MegaphoneIcon } from '@phosphor-icons/react/dist/ssr/Megaphone'
import { QuestionIcon } from '@phosphor-icons/react/dist/ssr/Question'
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/ssr/ShieldCheck'
import { TrophyIcon } from '@phosphor-icons/react/dist/ssr/Trophy'
import type { Icon } from '@phosphor-icons/react/dist/lib/types'
import { TONE_TEXT } from '@/components/ui/badge'
import type { Tone } from '@/lib/status'
import { cn } from '@/lib/utils'
import { POST_TYPE_META, type PostType } from '@/modules/work/posts/post-types'

/**
 * Post type icons: Phosphor duotone (MIT), imported one file each so only these ten ship. The SSR build
 * has no React context, so the same icons render in server and client components.
 */
const ICONS: Record<PostType, Icon> = {
  announcement: MegaphoneIcon,
  update: InfoIcon,
  kudos: HandsClappingIcon,
  celebration: ConfettiIcon,
  policy: ShieldCheckIcon,
  question: QuestionIcon,
  poll: ChartBarIcon,
  win: TrophyIcon,
  welcome: HandWavingIcon,
  event: CalendarStarIcon,
}

/** Tinted fill per tone: a quiet wash of the tone colour behind the coloured icon and label. */
const TINT: Record<Tone, string> = {
  success: 'bg-success/15 ring-success/30',
  warning: 'bg-warning/15 ring-warning/30',
  danger: 'bg-[#E9403B]/15 ring-[#E9403B]/30',
  info: 'bg-info/20 ring-info/35',
  pink: 'bg-pink/15 ring-pink/30',
  orange: 'bg-orange/15 ring-orange/30',
  violet: 'bg-[#8B6BC2]/20 ring-[#8B6BC2]/40',
  orchid: 'bg-orchid/20 ring-orchid/35',
  neutral: 'bg-white/[0.06] ring-white/15',
}

/** The duotone icon of a post type, in its tone colour. */
export function PostTypeIcon({ type, className }: { type: PostType; className?: string }) {
  const Glyph = ICONS[type]
  return <Glyph weight="duotone" aria-hidden className={cn('size-4 shrink-0', TONE_TEXT[POST_TYPE_META[type].tone], className)} />
}

/** Tinted pill with the type's icon and label (feed cards, filter chips). */
export function PostTypeBadge({ type, className }: { type: PostType; className?: string }) {
  const meta = POST_TYPE_META[type]
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset', TINT[meta.tone], TONE_TEXT[meta.tone], className)}>
      <PostTypeIcon type={type} className="size-3.5" />
      {meta.label}
    </span>
  )
}
