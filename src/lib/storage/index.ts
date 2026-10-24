import { serverEnv } from '@/lib/env'
import { s3ConfigFrom, type StorageEnv } from './config'
import { localDriver } from './local'
import { s3Driver } from './s3'
import type { StorageDriver } from './types'

export type { StorageDriver, StorageDriverName, StoredObjectStream } from './types'
export { normaliseKey } from './types'
export { missingS3Vars, s3ConfigFrom } from './config'

/** Builds the driver STORAGE_DRIVER names: 'local' (default) or 's3'. */
export function storageFromEnv(env: StorageEnv): StorageDriver {
  return env.STORAGE_DRIVER === 's3' ? s3Driver(s3ConfigFrom(env)) : localDriver(env.STORAGE_DIR)
}

let cached: StorageDriver | null = null

/** The storage driver for this process (one S3 client is reused across requests). */
export function storage(): StorageDriver {
  cached ??= storageFromEnv(serverEnv())
  return cached
}
