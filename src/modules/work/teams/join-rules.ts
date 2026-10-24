/**
 * Who may join a team on their own (pure). An invite-only team takes members only
 * from someone with teams.manage, so its post audience cannot be joined into (R3 M2).
 */

type JoinableTeam = Readonly<{ isActive?: boolean | null; isPrivate?: boolean | null; members: readonly { memberId: unknown }[] }>

export const INVITE_ONLY_REFUSAL = 'This team is invite only. Ask someone who manages teams to add you.'

/** Why `memberId` cannot join `team` themselves, or null when they can. */
export function joinRefusal(team: JoinableTeam, memberId: string): string | null {
  if (team.isActive === false) return 'This team is not taking new members.'
  if (team.members.some((m) => String(m.memberId) === memberId)) return "You're already in this team"
  if (team.isPrivate) return INVITE_ONLY_REFUSAL
  return null
}
