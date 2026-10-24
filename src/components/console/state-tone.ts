import type { Tone } from '@/lib/status'
import type { OrgState } from '@/modules/console/metrics'

/** Badge tone per Console account state. */
export const STATE_TONE: Record<OrgState, Tone> = { trial: 'info', free: 'info', house: 'neutral', active: 'success', past_due: 'warning', ending: 'info', read_only: 'danger', locked: 'danger', disabled: 'neutral', deleted: 'neutral' }
