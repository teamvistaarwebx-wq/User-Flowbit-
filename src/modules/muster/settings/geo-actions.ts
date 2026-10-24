'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok, type ActionResult } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { assertRateLimit } from '@/lib/rate-limit'
import type { Ctx } from '@/lib/ctx'
import { geoSettingsFor } from '@/lib/attendance'
import { GEO_MODES, MAX_ADDRESS, MAX_OFFICES, MAX_RADIUS_M, MIN_RADIUS_M, OUTSIDE_POLICIES, cleanOffices, type Office } from '@/lib/geo'
import { checkbox } from '@/lib/validation'
import { Org } from '@/models/Org'
import { addressNear, geocodeAddress, type GeocodeHit } from './geocode'

const OPTS = { product: 'muster', perm: 'hr.settings' } as const

/** Muster → HR settings → Attendance rules: location at check-in (off / optional / required) and what happens outside every office. */
export const saveCheckInLocation = action(
  z.object({ mode: z.enum(GEO_MODES), outside: z.enum(OUTSIDE_POLICIES) }),
  async (input, ctx) => {
    await Org.updateOne({ _id: ctx.orgId }, { $set: { 'attendanceGeo.mode': input.mode, 'attendanceGeo.outside': input.outside } })
    await audit(ctx, {
      action: 'muster.checkin_location_saved',
      entity: 'Org',
      entityId: ctx.orgId,
      summary: `Location at check-in: ${input.mode}, outside every office ${input.outside === 'block' ? 'blocked' : 'flagged'}`,
      product: 'muster',
      meta: { mode: input.mode, outside: input.outside },
    })
    revalidatePath('/app', 'layout')
    return ok('Location settings saved')
  },
  OPTS,
)

const radius = (label: string) => z.coerce.number({ error: `Enter the ${label} in metres` }).min(MIN_RADIUS_M, `Use ${MIN_RADIUS_M} m or more`).max(MAX_RADIUS_M, `Use at most ${MAX_RADIUS_M} m`)

const officeSchema = z
  .object({
    id: z.string().trim().max(40).optional(),
    name: z.string().trim().min(1, 'Name the office').max(80, 'Use at most 80 characters'),
    address: z.string().trim().max(MAX_ADDRESS, `Use at most ${MAX_ADDRESS} characters`).optional(),
    lat: z.coerce.number({ error: 'Place the pin on the map' }).min(-90).max(90),
    lng: z.coerce.number({ error: 'Place the pin on the map' }).min(-180).max(180),
    radiusM: radius('phone radius'),
    laptopRadiusM: radius('laptop radius'),
    active: checkbox,
  })
  .refine((o) => !(o.lat === 0 && o.lng === 0), { path: ['lat'], message: 'Place the pin on the map' })
  .refine((o) => o.laptopRadiusM >= o.radiusM, { path: ['laptopRadiusM'], message: 'The laptop circle cannot be smaller than the phone circle' })

/** Writes the whole office list (ids kept, so offices saved before ids existed get theirs now). */
async function writeOffices(ctx: Ctx, offices: Office[]) {
  await Org.updateOne({ _id: ctx.orgId }, { $set: { 'attendanceGeo.offices': offices } })
  revalidatePath('/app', 'layout')
}

const describe = (o: Office) => `${o.name}: ${o.radiusM} m phone, ${o.laptopRadiusM} m laptop${o.active ? '' : ', paused'}`

/** Adds an office area, or saves one (by id): pin, address, the phone and laptop circles, active or paused. */
export const saveOffice = action(
  officeSchema,
  async (input, ctx) => {
    const offices = [...geoSettingsFor(ctx).offices]
    const at = input.id ? offices.findIndex((o) => o.id === input.id) : -1
    if (input.id && at < 0) return fail('That office was removed by someone else. Close this and refresh.')
    if (at < 0 && offices.length >= MAX_OFFICES) return fail(`A workspace can have up to ${MAX_OFFICES} offices.`)
    const before = at >= 0 ? offices[at] : null
    const [office] = cleanOffices([{ ...input, id: before?.id ?? randomUUID().slice(0, 8) }])
    if (!office) return fail('Check the office: it needs a name and a pin on the map.')
    if (at >= 0) offices[at] = office
    else offices.push(office)
    await writeOffices(ctx, offices)
    await audit(ctx, {
      action: before ? 'muster.office_saved' : 'muster.office_added',
      entity: 'Org',
      entityId: ctx.orgId,
      summary: before ? `Office saved: ${describe(office)}` : `Office added: ${describe(office)}`,
      product: 'muster',
      meta: { office: office.name, lat: office.lat, lng: office.lng, radiusM: office.radiusM, laptopRadiusM: office.laptopRadiusM, active: office.active, ...(before ? { before: { lat: before.lat, lng: before.lng, radiusM: before.radiusM, laptopRadiusM: before.laptopRadiusM, active: before.active } } : {}) },
    })
    return ok(before ? `${office.name} saved` : `${office.name} added`)
  },
  OPTS,
)

/**
 * Office editor: an address → its point ("Find"), or a point → the nearest address ("Pin near"), on the server's
 * Geocoding key. Only people who may edit HR settings, and at most RATE_LIMITS.geocode a workspace each hour.
 */
export const geocodeForOffice = action(
  z.union([z.object({ address: z.string().trim().min(3, 'Type more of the address').max(MAX_ADDRESS) }), z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })]),
  async (input, ctx): Promise<ActionResult<GeocodeHit | null>> => {
    await assertRateLimit('geocode', String(ctx.orgId))
    const hit = 'address' in input ? await geocodeAddress(input.address) : await addressNear(input)
    return ok(undefined, hit)
  },
  OPTS,
)

export const removeOffice = action(
  z.object({ id: z.string().trim().min(1).max(40) }),
  async ({ id }, ctx) => {
    const offices = geoSettingsFor(ctx).offices
    const gone = offices.find((o) => o.id === id)
    if (!gone) return fail('That office was already removed.')
    await writeOffices(ctx, offices.filter((o) => o.id !== id))
    await audit(ctx, { action: 'muster.office_removed', entity: 'Org', entityId: ctx.orgId, summary: `Office removed: ${gone.name}`, product: 'muster', meta: { office: gone.name } })
    return ok(`${gone.name} removed`)
  },
  OPTS,
)
