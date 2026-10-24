import type { ClientSession } from 'mongoose'
import { withTransaction } from '@/lib/db'

/**
 * Runs `fn` in one MongoDB transaction. The callback can be retried on a
 * transient conflict, so never send mail, audit, notify or revalidate inside
 * it: do those after it returns.
 */
export const withTxn = <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => withTransaction(fn)
