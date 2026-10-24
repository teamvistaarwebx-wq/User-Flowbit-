/**
 * Schema helpers for Folio models (port of BillingOS `models/_money.ts`).
 * Money is a whole number of paise; null/undefined pass for "no limit" fields.
 */

const wholePaise = {
  validator: (value: unknown) => value === null || value === undefined || Number.isInteger(value),
  message: 'Money must be a whole number of paise, not a fraction.',
}

/** Integer paise, default 0. */
export const paise = (options: { required?: boolean; default?: number } = {}) => ({
  type: Number,
  required: options.required ?? false,
  default: options.default ?? 0,
  validate: wholePaise,
})

/** Integer paise that may be null ("no limit"). */
export const optionalPaise = () => ({ type: Number, default: null, validate: wholePaise })

/** A percentage 0–100 (rates like 18 or 2.5). */
export const percent = (defaultValue = 0) => ({ type: Number, default: defaultValue, min: 0, max: 100 })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Optional 'YYYY-MM-DD', stored as a string (a calendar fact, not an instant). */
export const isoDate = () => ({ type: String, default: null, match: ISO_DATE })

/** Required 'YYYY-MM-DD'. */
export const requiredIsoDate = () => ({ type: String, required: true as const, match: ISO_DATE })
