import 'server-only'
import type { Ctx } from '@/lib/ctx'
import type { ClientValues } from './values'
import { orbitPeople } from '@/modules/orbit/people'
import { getOrbitSettings } from '@/modules/orbit/settings'

type Opt = { value: string; label: string; hint?: string }

/** Owner, source and sector choices for the client form (sources/sectors from Orbit when it is on). */
export async function clientFormOptions(ctx: Ctx): Promise<{ owners: Opt[]; sources: Opt[] | null; sectors: Opt[] | null }> {
  const people = await orbitPeople(ctx)
  const owners = people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name, hint: p.title }))
  if (!ctx.has('orbit')) return { owners, sources: null, sectors: null }
  const cfg = await getOrbitSettings(ctx)
  return {
    owners,
    sources: cfg.sources.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label })),
    sectors: cfg.sectors.filter((s) => s.active).map((s) => ({ value: s.key, label: s.label })),
  }
}

type ClientDoc = {
  _id: unknown; kind?: string | null; name: string; displayName?: string | null; email?: string | null; phone?: string | null; website?: string | null; gstin?: string | null; pan?: string | null; state?: string | null
  billingAddress?: { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; pincode?: string | null; country?: string | null } | null
  ownerId?: unknown; tags?: string[] | null; source?: string | null; sector?: string | null; status?: string | null; notes?: string | null
}

/** A client document as form values (plain strings). */
export function clientValues(c: ClientDoc): ClientValues {
  const a = c.billingAddress ?? {}
  return {
    id: String(c._id), kind: c.kind === 'individual' ? 'individual' : 'company', name: c.name, displayName: c.displayName ?? '', email: c.email ?? '', phone: c.phone ?? '', website: c.website ?? '',
    gstin: c.gstin ?? '', pan: c.pan ?? '', state: c.state ?? '',
    billingAddress: { line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', state: a.state ?? '', pincode: a.pincode ?? '', country: a.country ?? 'India' },
    ownerId: c.ownerId ? String(c.ownerId) : '', tags: c.tags ?? [], source: c.source ?? '', sector: c.sector ?? '',
    status: c.status === 'lead' || c.status === 'inactive' ? c.status : 'active', notes: c.notes ?? '',
  }
}
