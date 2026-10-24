/**
 * The largest file one upload may carry (client-safe). Set MAX_UPLOAD_MB:
 * 10 by default for local and single-server hosting, 4 by default on Vercel,
 * which refuses request bodies over about 4.5 MB before they reach the app.
 * next.config.ts inlines MAX_UPLOAD_MB into the browser bundle at build time
 * (Vercel builds with VERCEL=1, so an unset value bakes in 4 there).
 */
export const DEFAULT_MAX_UPLOAD_MB = 10
/** Vercel's ~4.5 MB request-body limit, less room for the form's other fields. */
export const VERCEL_MAX_UPLOAD_MB = 4

export function parseMaxUploadMb(raw: string | undefined, onVercel: boolean = process.env.VERCEL === '1'): number {
  const value = Number(raw)
  if (raw?.trim() && Number.isFinite(value) && value > 0 && value <= 100) return value
  return onVercel ? VERCEL_MAX_UPLOAD_MB : DEFAULT_MAX_UPLOAD_MB
}

export const MAX_UPLOAD_MB = parseMaxUploadMb(process.env.MAX_UPLOAD_MB)
export const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_MB * 1024 * 1024)
/** "10 MB" */
export const MAX_UPLOAD_LABEL = `${MAX_UPLOAD_MB} MB`

/** `"scan.pdf" is larger than 4 MB. Choose a smaller file.` */
export const fileTooLargeMessage = (name: string, maxMb: number = MAX_UPLOAD_MB) => `"${name}" is larger than ${maxMb} MB. Choose a smaller file.`
