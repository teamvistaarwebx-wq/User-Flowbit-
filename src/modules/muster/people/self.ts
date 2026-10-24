/** Pure: the new-employee form pre-filled for the signed-in person adding their own record (it links by email). */
export function selfEmployeeDefaults(user: { name?: string | null; email?: string | null }): { fullName?: string; workEmail?: string } {
  return {
    ...(user.name?.trim() ? { fullName: user.name.trim() } : {}),
    ...(user.email?.trim() ? { workEmail: user.email.trim().toLowerCase() } : {}),
  }
}
