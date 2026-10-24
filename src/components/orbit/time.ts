import { formatDate, isoDateIST, minutesOfDayIST } from '@/lib/dates'
import { BACKDATE_DAYS } from '@/modules/orbit/constants'

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DDTHH:mm' in IST, for datetime-local inputs. */
export function istLocalInput(at: Date = new Date()): string {
  const m = minutesOfDayIST(at)
  return `${isoDateIST(at)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Bounds for backdating a logged activity (last 7 days, not in the future). */
export const occurredBounds = (now: Date = new Date()) => ({ min: istLocalInput(new Date(now.getTime() - BACKDATE_DAYS * 86_400_000)), max: istLocalInput(now) })

/** "3 Oct" / "3 Oct, 4:00 pm" for a planned activity. */
export function dueLabel(dueDate: string, dueTime?: string | null): string {
  if (!dueTime) return formatDate(dueDate, { short: true })
  const [h, m] = dueTime.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${formatDate(dueDate, { short: true })}, ${h12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`
}

/** Whole days between two 'YYYY-MM-DD' dates (b − a). */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
