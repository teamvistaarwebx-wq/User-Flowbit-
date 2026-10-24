import { formatDateTime, timeAgo } from '@/lib/dates'

/**
 * "5 min ago" that hydrates cleanly: the server and the browser render a few seconds apart, so the label can
 * differ ("Just now" vs "1 min ago"); React keeps the server text instead of throwing a hydration error.
 */
export function TimeAgo({ value, className, title }: { value: Date | string; className?: string; title?: boolean }) {
  const iso = new Date(value).toISOString()
  return (
    <time dateTime={iso} className={className} title={title ? formatDateTime(iso) : undefined} suppressHydrationWarning>
      {timeAgo(value)}
    </time>
  )
}
