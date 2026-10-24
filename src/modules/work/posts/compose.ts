import { POST_TYPE_META, needsFeatured, type PostType } from './post-types'
import { buildPollOptions, type PollOption } from './polls'
import { istLocalToDate, publishPlan } from './schedule'

/**
 * Checks a new or edited post (pure) and turns the composer's fields into
 * what is stored: audience targets, poll, event and the publish plan. Returns
 * field errors keyed like the form, or the clean values.
 */

export type ComposeInput = Readonly<{
  category: PostType
  audience: 'org' | 'roles' | 'groups' | 'private'
  targetRoles: readonly string[]
  targetTeamIds: readonly string[]
  targetDepartments: readonly string[]
  targetLocations: readonly string[]
  featuredIds: readonly string[]
  pollOptions: readonly string[]
  pollMultiple: boolean
  pollAnonymous: boolean
  pollClosesOn?: string
  eventAt?: string
  eventPlace?: string
  publishAt?: string
}>

export type Composed = {
  audience: { audience: ComposeInput['audience']; targetRoles: string[]; targetTeamIds: string[]; targetDepartments: string[]; targetLocations: string[] }
  featuredIds: string[]
  poll?: { options: PollOption[]; multiple: boolean; anonymous: boolean; closesAt?: Date }
  event?: { startsAt: Date; place?: string }
  published: boolean
  publishAt?: Date
}

export type ComposeResult = { ok: true; value: Composed } | { ok: false; forbidden?: string; errors: Record<string, string> }

const clean = (list: readonly string[]) => [...new Set(list.map((v) => v.trim()).filter(Boolean))]

function audienceOf(input: ComposeInput, errors: Record<string, string>): Composed['audience'] {
  const none = { targetRoles: [], targetTeamIds: [], targetDepartments: [], targetLocations: [] }
  if (input.audience === 'roles') {
    if (!input.targetRoles.length) errors.targetRoles = 'Pick at least one role'
    return { ...none, audience: 'roles', targetRoles: clean(input.targetRoles) }
  }
  if (input.audience === 'groups') {
    const groups = { targetTeamIds: clean(input.targetTeamIds), targetDepartments: clean(input.targetDepartments), targetLocations: clean(input.targetLocations) }
    if (!groups.targetTeamIds.length && !groups.targetDepartments.length && !groups.targetLocations.length) errors.targetTeamIds = 'Pick at least one team, department or location'
    return { ...none, ...groups, audience: 'groups' }
  }
  return { ...none, audience: input.audience }
}

function pollOf(input: ComposeInput, now: Date, errors: Record<string, string>): Composed['poll'] {
  if (input.category !== 'poll') return undefined
  const built = buildPollOptions(input.pollOptions)
  if (!built.ok) {
    errors.pollOptions = built.error
    return undefined
  }
  const closesAt = input.pollClosesOn ? new Date(`${input.pollClosesOn}T23:59:59+05:30`) : undefined
  if (closesAt && closesAt <= now) errors.pollClosesOn = 'Pick a date from today on'
  return { options: built.options, multiple: input.pollMultiple, anonymous: input.pollAnonymous, ...(closesAt ? { closesAt } : {}) }
}

function eventOf(input: ComposeInput, errors: Record<string, string>): Composed['event'] {
  if (input.category !== 'event') return undefined
  const startsAt = input.eventAt ? istLocalToDate(input.eventAt) : null
  if (!startsAt) {
    errors.eventAt = 'Pick when it happens'
    return undefined
  }
  const place = input.eventPlace?.trim()
  return { startsAt, ...(place ? { place: place.slice(0, 200) } : {}) }
}

/** Validates the composer input for a member (moderators may use every type). */
export function composePost(input: ComposeInput, isModerator: boolean, now: Date): ComposeResult {
  const meta = POST_TYPE_META[input.category]
  if (meta.moderatorOnly && !isModerator) return { ok: false, forbidden: `Only managers and admins can post a ${meta.label.toLowerCase()}.`, errors: {} }
  const errors: Record<string, string> = {}
  const audience = audienceOf(input, errors)
  const featuredIds = clean(input.featuredIds)
  if (needsFeatured(input.category) && !featuredIds.length) errors.featuredIds = input.category === 'kudos' ? 'Pick who the kudos is for' : 'Pick who joined'
  const poll = pollOf(input, now, errors)
  const event = eventOf(input, errors)
  const at = input.publishAt ? istLocalToDate(input.publishAt) : null
  if (input.publishAt && !at) errors.publishAt = 'Use a date and time'
  const plan = publishPlan(at, now)
  if (!plan.ok) errors.publishAt = plan.error
  if (Object.keys(errors).length || !plan.ok) return { ok: false, errors }
  return { ok: true, value: { audience, featuredIds, poll, event, published: plan.published, ...(plan.publishAt ? { publishAt: plan.publishAt } : {}) } }
}
