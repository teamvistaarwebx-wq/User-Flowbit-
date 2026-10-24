import type { CsvRow } from '@/modules/muster/import/csv'
import type { CheckedRow } from '../types'
import { EMAIL, firstSeen, key, pick, rowResult } from './common'

/** Team import: one invite per row, with a role and a department (pure). */

export const TEAM_COLUMNS = [
  { key: 'email', required: true, example: 'riya.sharma@example.com' },
  { key: 'name', example: 'Riya Sharma' },
  { key: 'role', required: true, example: 'manager', help: 'A role name or key from Settings → Roles (not owner).' },
  { key: 'title', example: 'Project Manager' },
  { key: 'department', example: 'Delivery' },
] as const

export type TeamRecord = { email: string; name?: string; role: string; title?: string; department?: string }

export type TeamLookups = {
  /** Lower-cased role key or label -> role key (owner left out). */
  roles: ReadonlyMap<string, string>
  /** Emails already in the workspace: members (any status) and pending invites. */
  taken: ReadonlySet<string>
}

export function checkTeamRows(rows: readonly CsvRow[], lookups: TeamLookups): CheckedRow<TeamRecord>[] {
  const seen = firstSeen()
  return rows.map((row) => {
    const email = key(pick(row, 'email', 'work_email', 'email_address'))
    const roleRaw = pick(row, 'role')
    const errors: string[] = []
    if (!email) errors.push('Email is missing.')
    else if (!EMAIL.test(email)) errors.push(`"${email}" is not an email address.`)
    else if (lookups.taken.has(email)) errors.push('This person is already in the workspace or has a pending invite.')
    const earlier = seen(email, row.line)
    if (earlier != null) errors.push(`The same email is on line ${earlier}.`)
    const role = lookups.roles.get(key(roleRaw))
    if (!roleRaw) errors.push('Role is missing.')
    else if (key(roleRaw) === 'owner') errors.push('Nobody can be imported as owner. Use another role and transfer ownership later.')
    else if (!role) errors.push(`No role called "${roleRaw}". Use one from Settings → Roles.`)
    const name = pick(row, 'name', 'full_name').slice(0, 80) || undefined
    return rowResult(row.line, name ?? email, errors, [], { email, name, role: role ?? '', title: pick(row, 'title', 'designation').slice(0, 60) || undefined, department: pick(row, 'department').slice(0, 60) || undefined })
  })
}
