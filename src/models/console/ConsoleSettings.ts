import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * The single Console settings document (key 'global'): prices, limits,
 * templates and help links (lib/console/settings-defaults). Read through
 * mergeConsoleSettings, which fills gaps with the defaults.
 */
const ConsoleSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    prices: { type: Schema.Types.Mixed },
    limits: { type: Schema.Types.Mixed },
    templates: { type: Schema.Types.Mixed },
    helpLinks: { type: Schema.Types.Mixed },
    /** WhatsApp A: the template registry (name, language, variable order) and the per-message rate card. */
    whatsapp: { type: Schema.Types.Mixed },
    /** WhatsApp B wallet: rate card (paise), BYO platform fee, free messages per plan, low-balance alert. */
    wallet: { type: Schema.Types.Mixed },
    /** Platform feature switches (lib/feature-flags), e.g. { whatsapp: false }. */
    features: { type: Schema.Types.Mixed },
    /** Arc AI caps: { caps: { free, trial, paid, comped, internal, test } } requests a month (lib/ai-caps). */
    ai: { type: Schema.Types.Mixed },
    /** Meetings AI: { caps: { free, trial, paidPerSeat } } transcription hours a month (lib/meeting-caps). */
    meetings: { type: Schema.Types.Mixed },
    /** Salary TDS rules (modules/muster/tax/rules): slabs, rebates, surcharge, cess and caps per tax year. */
    tax: { type: Schema.Types.Mixed },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { timestamps: true },
)

export const ConsoleSettings = defineModel('ConsoleSettings', ConsoleSettingsSchema)
