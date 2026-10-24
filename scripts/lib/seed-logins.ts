import path from 'node:path'

/**
 * The demo logins `scripts/seed.ts` creates, and the git-ignored file it writes them to (pure).
 * Shared with `.local-test/reset-demo-logins.mts`, which resets those same users' passwords.
 */

export const OWNER_EMAIL = 'sanskaar@vistaarsws.com'
/** The main demo database; only its logins go to seed-logins.local.md. */
export const MAIN_SEED_DB = 'flowbit'
export const OWNER_ROLE_LABEL = 'owner (also Console Admin, same password; enrols 2FA on first Console sign-in)'

export const ROLE_PEOPLE = {
  owner: { name: 'Sanskaar Singh', email: OWNER_EMAIL, title: 'Founder & CEO', department: 'Leadership' },
  admin: { name: 'Aditi Sharma', email: 'aditi.sharma@flowbit.test', title: 'Operations Lead', department: 'Operations' },
  hr_admin: { name: 'Neha Verma', email: 'neha.verma@flowbit.test', title: 'HR Manager', department: 'People' },
  hr_exec: { name: 'Rohan Mehta', email: 'rohan.mehta@flowbit.test', title: 'HR Executive', department: 'People' },
  finance: { name: 'Priya Iyer', email: 'priya.iyer@flowbit.test', title: 'Finance Manager', department: 'Finance' },
  manager: { name: 'Arjun Nair', email: 'arjun.nair@flowbit.test', title: 'Delivery Manager', department: 'Delivery' },
  sales: { name: 'Kavya Reddy', email: 'kavya.reddy@flowbit.test', title: 'Business Development', department: 'Sales' },
  member: { name: 'Vikram Joshi', email: 'vikram.joshi@flowbit.test', title: 'Frontend Developer', department: 'Engineering' },
} as const

export const EXTRA_PEOPLE = [
  { name: 'Ishaan Gupta', title: 'Backend Developer', department: 'Engineering' },
  { name: 'Meera Pillai', title: 'UI/UX Designer', department: 'Design' },
  { name: 'Siddharth Rao', title: 'QA Engineer', department: 'Engineering' },
  { name: 'Ananya Kulkarni', title: 'Content Strategist', department: 'Marketing' },
  { name: 'Karan Malhotra', title: 'Performance Marketer', department: 'Marketing' },
  { name: 'Pooja Desai', title: 'Project Coordinator', department: 'Delivery' },
  { name: 'Rahul Chauhan', title: 'Full-stack Developer', department: 'Engineering' },
  { name: 'Sneha Banerjee', title: 'Graphic Designer', department: 'Design' },
] as const

export const emailFor = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@flowbit.test`

export type SeedPerson = { role: string; name: string; email: string }
export type SeedLogin = SeedPerson & { password: string }

/** Every user the seed creates, in the order it creates them (owner, each built-in role, the demo people). */
export function seedPeople(): SeedPerson[] {
  const roles = (Object.keys(ROLE_PEOPLE) as (keyof typeof ROLE_PEOPLE)[]).map((role) => ({ role: role === 'owner' ? OWNER_ROLE_LABEL : role, name: ROLE_PEOPLE[role].name, email: ROLE_PEOPLE[role].email }))
  return [...roles, ...EXTRA_PEOPLE.map((p) => ({ role: 'member (demo)', name: p.name, email: emailFor(p.name) }))]
}

/** seed-logins.local.md for the main demo database, seed-logins.<db>.local.md for any other, so a second seed never overwrites the main file. */
export function loginsFileName(db: string): string {
  const safe = db.trim().replace(/[^A-Za-z0-9_-]/g, '_')
  if (!safe) throw new Error('The database name is empty.')
  return safe === MAIN_SEED_DB ? 'seed-logins.local.md' : `seed-logins.${safe}.local.md`
}

export const loginsFilePath = (root: string, db: string) => path.join(root, loginsFileName(db))

/** The logins table as markdown. `note` goes first (e.g. "Reset 9 Oct for the `flowbit` demo DB"). */
export function loginsMarkdown(logins: readonly SeedLogin[], opts: { generated: string; appUrl?: string; note?: string }): string {
  const signIn = (opts.appUrl ?? 'http://127.0.0.1:4100').replace(/\/$/, '')
  return [
    ...(opts.note ? [`> ${opts.note}`, ''] : []),
    '# Flowbit seed logins (local only, git-ignored)',
    '',
    `${opts.generated} Workspace: Vistaar WebX (slug \`vistaar\`). Sign in at ${signIn}/login.`,
    '',
    '| Role | Name | Email | Password |',
    '|---|---|---|---|',
    ...logins.map((l) => `| ${l.role} | ${l.name} | ${l.email} | \`${l.password}\` |`),
    '',
  ].join('\n')
}
