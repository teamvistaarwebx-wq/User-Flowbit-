import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DEFAULT_STALE_DAYS, DEFAULT_TARGETS, STAGE_COLOR_KEYS } from '@/modules/orbit/constants'

const item = { key: { type: String, required: true }, label: { type: String, required: true }, active: { type: Boolean, default: true }, order: { type: Number, default: 0 } }

const DealStageSchema = new Schema({ key: { type: String, required: true }, label: { type: String, required: true }, probability: { type: Number, min: 0, max: 100, required: true }, color: { type: String, enum: STAGE_COLOR_KEYS, default: 'sky' }, order: { type: Number, default: 0 } }, { _id: false })
const SourceSchema = new Schema({ ...item, warm: { type: Boolean, default: false } }, { _id: false })
const SectorSchema = new Schema({ ...item, primary: { type: Boolean, default: false } }, { _id: false })
const ReasonItemSchema = new Schema(item, { _id: false })

/** One document per org; created with defaults on first read (modules/orbit/settings.ts). */
const OrbitSettingsSchema = new Schema(
  {
    ...tenantFields,
    dealStages: { type: [DealStageSchema], default: [] },
    sources: { type: [SourceSchema], default: [] },
    sectors: { type: [SectorSchema], default: [] },
    lostReasons: { type: [ReasonItemSchema], default: [] },
    wonReasons: { type: [ReasonItemSchema], default: [] },
    targets: {
      coldMinPct: { type: Number, default: DEFAULT_TARGETS.coldMinPct },
      coldMaxPct: { type: Number, default: DEFAULT_TARGETS.coldMaxPct },
      warmPct: { type: Number, default: DEFAULT_TARGETS.warmPct },
      weeklyNewLeads: { type: Number, default: DEFAULT_TARGETS.weeklyNewLeads },
      weeklyOutreach: { type: Number, default: DEFAULT_TARGETS.weeklyOutreach },
      monthlyMeetings: { type: Number, default: DEFAULT_TARGETS.monthlyMeetings },
    },
    staleDays: { type: Number, default: DEFAULT_STALE_DAYS, min: 1, max: 60 },
    defaultReviewerId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
  },
  { timestamps: true },
)
OrbitSettingsSchema.plugin(tenant)

export const OrbitSettings = defineModel('OrbitSettings', OrbitSettingsSchema)
