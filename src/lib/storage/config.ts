import type { ServerEnv } from '@/lib/env'
import type { S3Config } from './s3'

export type StorageEnv = Pick<ServerEnv, 'STORAGE_DRIVER' | 'STORAGE_DIR' | 'S3_ENDPOINT' | 'S3_REGION' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_FORCE_PATH_STYLE'>

/** The S3 variables that STORAGE_DRIVER=s3 cannot work without. */
export function missingS3Vars(env: Partial<Record<keyof StorageEnv, string | undefined>>): string[] {
  return (['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter((k) => !env[k]?.trim())
}

export function s3ConfigFrom(env: StorageEnv): S3Config {
  const missing = missingS3Vars(env)
  if (missing.length) throw new Error(`STORAGE_DRIVER=s3 needs ${missing.join(', ')}.`)
  return {
    endpoint: env.S3_ENDPOINT.trim() || undefined,
    region: env.S3_REGION.trim(),
    bucket: env.S3_BUCKET.trim(),
    accessKeyId: env.S3_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY.trim(),
    forcePathStyle: env.S3_FORCE_PATH_STYLE.trim().toLowerCase() === 'true',
  }
}
