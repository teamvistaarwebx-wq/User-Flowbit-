import { FREE_MONTHS, FREE_SEAT_LIMIT } from '@/lib/account-types'
import { TRIAL_DAYS } from '@/lib/plans'

/**
 * The one call to action on the website (owner decision D2, 11 Oct 2026):
 * "Start free", with the short note on who gets what. Signup decides by team
 * size (lib/account-types): up to 5 people start on Free for 6 months; bigger
 * teams get the 15-day trial of everything. Client-safe.
 */
export const START_FREE_LABEL = 'Start free'

/** "Up to 5 people: free for 6 months · bigger teams: 15-day full trial". */
export const START_FREE_NOTE = `Up to ${FREE_SEAT_LIMIT} people: free for ${FREE_MONTHS} months · bigger teams: ${TRIAL_DAYS}-day full trial`

/** The note as one sentence, for meta descriptions and running text. */
export const START_FREE_SENTENCE = `Teams of up to ${FREE_SEAT_LIMIT} people use Flowbit free for ${FREE_MONTHS} months; bigger teams get a ${TRIAL_DAYS}-day trial of everything. No card needed.`
