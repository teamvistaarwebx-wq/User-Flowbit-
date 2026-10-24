import 'server-only'
import { dbConnect } from '@/lib/db'
import { isResendConfigured, serverEnv } from '@/lib/env'
import { storage } from '@/lib/storage'

/**
 * The checks behind /api/health and the public /status page: whether MongoDB
 * and file storage answer, the storage driver and how email goes out. No
 * secrets, no hostnames.
 */

const CHECK_TIMEOUT_MS = 3000
/** A fixed key that never exists: a 404 for it still proves the bucket answers with these keys. */
const STORAGE_PROBE_KEY = '__flowbit-health-check'
/** Monitors poll every few minutes; one bucket request a minute per instance is plenty. */
const STORAGE_CACHE_MS = 60_000

let storageChecked: { at: number; reachable: boolean } | null = null

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  return Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), CHECK_TIMEOUT_MS))])
}

export async function databaseReachable(): Promise<boolean> {
  try {
    const conn = await dbConnect()
    const ping = conn.connection.db?.admin().ping()
    if (!ping) return false
    await withTimeout(ping, 'ping')
    return true
  } catch (error) {
    console.error('[health] database unreachable', error)
    return false
  }
}

/** True when the storage driver answers (S3: the bucket and keys work; a missing probe object is fine). */
export async function storageReachable(): Promise<boolean> {
  if (storageChecked && Date.now() - storageChecked.at < STORAGE_CACHE_MS) return storageChecked.reachable
  let reachable = true
  try {
    await withTimeout(storage().exists(STORAGE_PROBE_KEY), 'storage check')
  } catch (error) {
    console.error('[health] storage unreachable', error)
    reachable = false
  }
  storageChecked = { at: Date.now(), reachable }
  return reachable
}

export type HealthSnapshot = Readonly<{ db: boolean; storage: boolean; storageDriver: string; email: 'resend' | 'outbox' }>

export async function healthSnapshot(): Promise<HealthSnapshot> {
  const [db, files] = await Promise.all([databaseReachable(), storageReachable()])
  return { db, storage: files, storageDriver: serverEnv().STORAGE_DRIVER, email: isResendConfigured() ? 'resend' : 'outbox' }
}
