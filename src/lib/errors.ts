import type { ActionErrorCode } from '@/lib/action-types'

/**
 * Errors that server actions turn into `{ ok: false, error }` with the
 * message shown to the user. Anything else is logged and replaced with a
 * generic message.
 */
export class UserError extends Error {
  readonly fieldErrors?: Record<string, string>
  /** Machine-readable reason the client may act on (lib/action-types ActionErrorCode). */
  readonly code?: ActionErrorCode
  constructor(message: string, fieldErrors?: Record<string, string>, code?: ActionErrorCode) {
    super(message)
    this.name = 'UserError'
    this.fieldErrors = fieldErrors
    this.code = code
  }
}

/**
 * Adding a 6th person on the Free plan (console spec 4.2): the client shows
 * "Upgrade or start a 15-day trial" instead of a plain error.
 */
export class FreeSeatLimitError extends UserError {
  constructor(message: string, trialAvailable: boolean) {
    super(message, undefined, trialAvailable ? 'free_seat_limit' : 'free_seat_limit_no_trial')
    this.name = 'FreeSeatLimitError'
  }
}

/** The member lacks a permission or the product is not available. */
export class ForbiddenError extends UserError {
  constructor(message = "You don't have permission to do that. Ask a workspace admin for access.") {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** A record does not exist in this workspace. */
export class NotFoundError extends UserError {
  constructor(what = 'That record') {
    super(`${what} was not found. It may have been removed.`)
    this.name = 'NotFoundError'
  }
}

/** The workspace is read-only (trial or plan ended). */
export class ReadOnlyError extends UserError {
  constructor(message: string) {
    super(message)
    this.name = 'ReadOnlyError'
  }
}
