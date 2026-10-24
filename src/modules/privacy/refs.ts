import { z } from 'zod'
import { objectId } from '@/lib/validation'
import type { SubjectRef } from './core'

/** A subject reference from a form or a query string, validated (ids must be ObjectIds). */
export const subjectRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contact'), clientId: objectId, contactId: objectId }),
  z.object({ kind: z.literal('lead'), leadId: objectId }),
  z.object({ kind: z.literal('member'), memberId: objectId }),
])

export function subjectRefFrom(params: URLSearchParams): SubjectRef | null {
  const parsed = subjectRefSchema.safeParse(Object.fromEntries(params.entries()))
  return parsed.success ? parsed.data : null
}

/** The id the audit log names (never the person's name or contact details). */
export const subjectId = (ref: SubjectRef): string => (ref.kind === 'contact' ? ref.contactId : ref.kind === 'lead' ? ref.leadId : ref.memberId)

export const subjectQuery = (ref: SubjectRef): string => new URLSearchParams(Object.entries(ref)).toString()
