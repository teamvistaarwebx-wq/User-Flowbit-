/** Shared shapes of the biometric import, safe for the browser (pure, no parsing code). */

export const BIOMETRIC_FORMATS = ['auto', 'essl', 'zkteco_dat', 'zkteco_csv', 'generic'] as const
export type BiometricFormatChoice = (typeof BIOMETRIC_FORMATS)[number]
export type BiometricFormat = Exclude<BiometricFormatChoice, 'auto'>

export const FORMAT_LABELS: Record<BiometricFormat, string> = {
  essl: 'eSSL / eTimeTrackLite attendance logs',
  zkteco_dat: 'ZKTeco attlog.dat',
  zkteco_csv: 'ZKTeco export',
  generic: 'Punch file (columns picked by hand)',
}

export const PUNCH_FIELDS = ['id', 'datetime', 'date', 'time', 'direction'] as const
export type PunchField = (typeof PUNCH_FIELDS)[number]
/** Which (normalised) header feeds each field. */
export type PunchColumns = Partial<Record<PunchField, string>>

export type SkippedPunchLine = { line: number; reason: string }
export type UnmappedDeviceRow = { deviceId: string; days: number; punches: number }

export type BiometricPreviewRow = { line: number; code: string; name: string | null; date: string; status: string; in: string; out: string | null; punches: number; errors: string[]; warnings: string[] }

/** What the check step returns to the browser. */
export type BiometricPreview = {
  format: BiometricFormat
  formatLabel: string
  headers: string[]
  columns: PunchColumns
  summary: string
  punches: number
  days: number
  ready: number
  skipped: SkippedPunchLine[]
  skippedCount: number
  unmapped: UnmappedDeviceRow[]
  rows: BiometricPreviewRow[]
}

export const DEFAULT_CUTOFF = '04:00'
