import Image from "next/image";
import { cn } from "@/lib/utils";

/** The vector brand assets in public/brand (DESIGN 9). Tight viewBoxes, so size = rendered height. */
const MARK = {
  gradient: "/brand/flowbit-mark-gradient.svg",
  white: "/brand/flowbit-mark.svg",
} as const;
const LOCKUP = {
  gradient: "/brand/flowbit-logo-gradient.svg",
  white: "/brand/flowbit-logo-white.svg",
} as const;
const MARK_RATIO = 41.87 / 40.43;
const LOCKUP_RATIO = 171.31 / 40.43;

export type LogoVariant = keyof typeof MARK;

/**
 * The Flowbit mark: ten rays around a centre dot, from the brand kit.
 * `gradient` (default) is the app logo; `white` sits on the brand mesh.
 */
export function BurstMark({
  size = 28,
  className,
  animated,
  variant = "gradient",
}: {
  size?: number;
  className?: string;
  /** Slow breathing, for hero moments. */ animated?: boolean;
  variant?: LogoVariant;
}) {
  // SVG sources are served unoptimized by next/image, straight from public/brand.
  return (
    <Image
      src={MARK[variant]}
      alt=""
      aria-hidden
      width={Math.round(size * MARK_RATIO)}
      height={size}
      draggable={false}
      className={cn(
        "shrink-0 select-none",
        animated && "animate-[breathe_6s_var(--ease-in-out)_infinite]",
        className,
      )}
    />
  );
}

/**
 * Mark + "Flowbit" wordmark (the brand-kit lockup). `size` is the mark height; the wordmark scales with it.
 * `showText={false}` renders the mark alone.
 */
export function Logo({
  size = 28,
  className,
  showText = true,
  variant = "gradient",
}: {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: LogoVariant;
  /** @deprecated The wordmark is part of the vector lockup; use `variant` and `size`. Ignored. */
  textClassName?: string;
}) {
  if (!showText)
    return <BurstMark size={size} variant={variant} className={className} />;
  return (
    <Image
      src={LOCKUP[variant]}
      alt="Flowbit"
      width={Math.round(size * LOCKUP_RATIO)}
      height={size}
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

/**
 * The Arc assistant mark (Figma rail tile and "arc.ai"): a square with a rounded top-left and a quarter bite
 * out of the bottom-right, lit from blush at the bottom-left to deep indigo at the top-right.
 */
export function ArcMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const id = `arc-${size}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden>
      <defs>
        <linearGradient
          id={id}
          x1="2"
          y1="22"
          x2="22"
          y2="2"
          gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F2C2E4" />
          <stop offset="0.45" stopColor="#C38BC0" />
          <stop offset="1" stopColor="#3B2A72" />
        </linearGradient>
      </defs>
      <path
        d="M12 0H24V12A12 12 0 0 0 12 24H0V12A12 12 0 0 1 12 0Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
