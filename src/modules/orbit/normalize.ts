/** Normalisers for lead/contact fields. Pure. */

/** 'kesarclay.in' -> 'https://kesarclay.in'; blank stays blank. */
export function normaliseUrl(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

/** '@kesar.clay', 'instagram.com/kesar.clay/' -> 'kesar.clay'. */
export function normaliseInstagram(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
}

/** An http(s) link with a dotted host and no spaces ('https://not a site' is refused). */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)
  } catch {
    return false
  }
}

export const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/
export const isPhoneLike = (value: string) => /^\+?[\d\s-]{7,20}$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15

/** WhatsApp link for a 10-digit Indian number (or a full international one). */
export function whatsappHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `https://wa.me/91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `https://wa.me/${digits}`
  return null
}
