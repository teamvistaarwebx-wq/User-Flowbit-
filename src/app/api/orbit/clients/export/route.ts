import type { NextRequest } from 'next/server'
import { blockedResponse, getCtx, routeRefused } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { HEALTH_LABEL } from '@/modules/clients/health'
import { exportClients, parseClientQuery } from '@/modules/clients/queries'
import { csvResponse, toCsv } from '@/modules/orbit/csv'
import { nameOf, orbitPeople, peopleIndex } from '@/modules/orbit/people'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_ROWS = 10_000
const HEADERS = ['Name', 'Display name', 'Kind', 'GSTIN', 'PAN', 'State', 'Email', 'Phone', 'Primary contact', 'Primary contact email', 'Status', 'Health', 'Owner', 'City', 'Tags']

/** CSV of the clients list: every filter of /app/clients, health included, in the list's order. Needs clients.write. */
export async function GET(req: NextRequest) {
  const ctx = await getCtx()
  if (routeRefused(ctx)) return blockedResponse()
  const product = ctx && (ctx.has('work') || ctx.has('orbit') || ctx.has('folio'))
  // A bulk export (GSTIN, PAN, contacts) is for people who manage clients, not every member who can read one (R3 L-21d).
  if (!ctx || !product || !ctx.can('clients.write')) return new Response('Not allowed', { status: 403 })
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries())
  const [clients, people] = await Promise.all([exportClients(ctx, parseClientQuery(sp), todayIST(), MAX_ROWS), orbitPeople(ctx)])
  const index = peopleIndex(people)
  const rows = clients.map(({ client: c, health }) => {
    const primary = c.contacts.find((x) => x.primary) ?? c.contacts[0]
    return [c.name, c.displayName, c.kind, c.gstin, c.pan, c.state, c.email, c.phone, primary?.name, primary?.email, c.status, health ? HEALTH_LABEL[health] : '', c.ownerId ? nameOf(index, c.ownerId) : '', c.billingAddress?.city, (c.tags ?? []).join('; ')]
  })
  return csvResponse(toCsv(HEADERS, rows), `clients-${todayIST()}.csv`)
}
