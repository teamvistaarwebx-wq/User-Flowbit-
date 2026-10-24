import 'server-only'
import type { Types } from 'mongoose'
import { Org } from '@/models/Org'
import { ComplianceSettings } from '@/models/compliance/ComplianceSettings'
import { readComplianceSettings, type ComplianceSettings as Settings } from './rules'

/** A workspace's compliance settings, with the state defaulting to the workspace's own. */
export async function loadComplianceSettings(orgId: Types.ObjectId): Promise<Settings> {
  const [row, org] = await Promise.all([ComplianceSettings.findOne({ orgId }).lean(), Org.findById(orgId, { 'subscription.billing.address.stateCode': 1 }).lean()])
  const settings = readComplianceSettings(row ?? {})
  return settings.state ? settings : { ...settings, state: String(org?.subscription?.billing?.address?.stateCode ?? '').toUpperCase() }
}
