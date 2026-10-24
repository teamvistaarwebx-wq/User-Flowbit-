'use client'

import Link from 'next/link'
import { forwardRef, type ButtonHTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { play, type SoundName } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles'

export type { ButtonSize, ButtonVariant }

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  /** Runs on press, for the button and for the `href` link alike. */
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Icon before the label. */
  icon?: ReactNode
  /** Icon after the label. */
  iconRight?: ReactNode
  /** Renders a Next Link styled as a button. */
  href?: string
  /** Sound on press; false for silent. Default 'click' for buttons, silent for `href` links (navigation stays quiet). */
  sound?: SoundName | false
}

/** Pill button. Plays `click` on press. `href` renders a Link, silent unless `sound` is set. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, href, sound, className, children, onClick, disabled, type = 'button', ...rest },
  ref,
) {
  const content = (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </>
  )
  const classes = buttonClass(variant, size, className)
  const pressSound = sound ?? (href ? false : 'click')
  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={rest['aria-label']}
        title={rest.title}
        onClick={(e) => {
          if (pressSound) play(pressSound)
          onClick?.(e)
        }}
      >
        {content}
      </Link>
    )
  }
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (pressSound) play(pressSound)
        onClick?.(e)
      }}
      {...rest}
    >
      {content}
    </button>
  )
})

export type IconButtonProps = Omit<ButtonProps, 'icon' | 'iconRight' | 'children'> & {
  /** Accessible name (also the tooltip title). */
  label: string
  children: ReactNode
}

const iconSizes: Record<ButtonSize, string> = { sm: 'size-8', md: 'size-10', lg: 'size-12' }

/** Round icon-only button. `label` is required for screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, children, ...rest },
  ref,
) {
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} className={cn('hit-area px-0', iconSizes[size], className)} {...rest}>
      {children}
    </Button>
  )
})
