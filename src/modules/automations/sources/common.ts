import 'server-only'
import type { Types } from 'mongoose'
import { istInstant, addDays } from '@/lib/dates'
import { scoped } from '@/lib/db/scoped'
import type { DateWindow } from '../timing'
import type { RunSubject, SourceKey } from '../types'

/** A time-trigger source: the records due now in one workspace, as run subjects. */

export type OrgScope = Readonly<{ orgId: Types.ObjectId; orgName: string; db: <M extends Parameters<typeof scoped>[0]>(model: M) => ReturnType<typeof scoped<M>> }>

export type SourceInput = Readonly<{ window: DateWindow | null; now: Date }>

export type Source = (scope: OrgScope, input: SourceInput) => Promise<RunSubject[]>

export type SourceRegistry = Readonly<Record<SourceKey, Source>>

export const orgScope = (orgId: Types.ObjectId, orgName: string): OrgScope => ({ orgId, orgName, db: (model) => scoped(model, orgId) })

/** Most records one rule handles per scan; the rest wait for the next scan. */
export const SCAN_LIMIT = 200

/** A date window as a Mongo filter on an ISO date string field. */
export const isoRange = (window: DateWindow | null) => (window?.unit === 'days' ? { $gte: window.from, $lte: window.to } : null)

/** A window as a filter on a Date field (days become whole IST days). */
export function instantRange(window: DateWindow | null): { $gt: Date; $lte: Date } | null {
  if (!window) return null
  if (window.unit === 'days') return { $gt: new Date(istInstant(window.from).getTime() - 1), $lte: new Date(istInstant(addDays(window.to, 1)).getTime() - 1) }
  return { $gt: window.fromAt, $lte: window.toAt }
}
