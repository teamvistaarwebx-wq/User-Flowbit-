/**
 * Claiming a policy-ack reminder slot (pure, R3 L-27b). The update matches the
 * reminder time that was read, so of two quick clicks only one changes the post
 * and only that one sends the reminder.
 */
export const reminderClaimFilter = (postId: unknown, previous: Date | null | undefined) => ({ _id: postId, ackRemindedAt: previous ?? null })

/** True when this request won the slot (the conditional update changed the post). */
export const wonReminderClaim = (result: { modifiedCount?: number | null }): boolean => result.modifiedCount === 1
