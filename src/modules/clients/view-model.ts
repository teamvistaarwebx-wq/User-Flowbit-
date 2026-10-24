import type { Margin } from './dashboard-math'
import type { ClientHealth } from './health'

/** What a client card and a client row show, built once on the server from the list data. */
export type ClientCardRow = {
  id: string
  name: string
  displayName: string | null
  kind: string
  logoUrl: string | null
  status: string
  ownerName: string | null
  primaryContact: { name: string; phone: string | null } | null
  health: ClientHealth | null
  /** Minutes logged this month; null when the viewer has no Work access. */
  minutesThisMonth: number | null
  retainerHours: number | null
  /** Undefined: the viewer may not see salary cost, so margin is left out entirely. */
  margin?: Margin
  overduePaise: number | null
  outstandingPaise: number | null
  pipelinePaise: number | null
  projects: number | null
  lastActivityAt: Date | null
  onboardedAt: Date | null
}

export type ClientRowFlags = { work: boolean; folio: boolean; orbit: boolean; margin: boolean }
