import { cn } from '@/lib/utils'

/** Button classes, usable from server components (e.g. styling a Link). */

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'violet'
export type ButtonSize = 'sm' | 'md' | 'lg'

export const buttonBase =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(202,129,184,0.85)]'

/**
 * primary: the Figma "Sign in" gradient (light left, deep violet right), drifting slowly, one light sweep on hover.
 * secondary (the default): the #171717 pill with a translucent hairline. outline: the same hairline, no fill.
 * violet: the solid "Add Member" pill. Borders are translucent white, never a hue.
 */
export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'shimmer bg-grad-button text-white [text-shadow:0_1px_2px_rgba(33,11,93,0.5)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-[1.06]',
  secondary: 'border border-white/[0.18] bg-control text-fg hover:border-white/30 hover:bg-[#1e1e1e]',
  outline: 'border border-white/[0.18] bg-transparent text-fg hover:border-white/30 hover:bg-white/[0.04]',
  violet: 'bg-chip-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-[color-mix(in_oklab,var(--chip-active)_92%,white)]',
  ghost: 'text-fg hover:bg-white/[0.06]',
  danger: 'border border-white/[0.18] bg-control text-[#FF6A66] hover:border-white/30 hover:bg-danger/10',
}

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-[46px] px-7 text-[15px]',
}

/** Class string for anything that should look like a button (e.g. a Link). */
export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) =>
  cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
