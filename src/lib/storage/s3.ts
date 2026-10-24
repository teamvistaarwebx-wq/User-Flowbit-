import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { safeKey, type StorageDriver } from './types'

export type S3Config = {
  /** Custom endpoint for S3-compatible stores (Cloudflare R2); empty for AWS S3. */
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

/** The one method the driver uses, so tests can pass a mock client. */
export type S3Sender = Pick<S3Client, 'send'>

export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // S3-compatible stores (R2) may reject the optional checksums newer SDKs add by default.
    ...(config.endpoint ? { requestChecksumCalculation: 'WHEN_REQUIRED' as const, responseChecksumValidation: 'WHEN_REQUIRED' as const } : {}),
  })
}

/** NoSuchKey on GET, NotFound (404) on HEAD. */
function isMissing(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}

/**
 * Private objects in an S3-compatible bucket. Nothing is public: the app
 * reads objects server-side and streams them through /api/files/[id] after
 * its access checks.
 */
export function s3Driver(config: S3Config, client: S3Sender = createS3Client(config)): StorageDriver {
  const Bucket = config.bucket
  // safeKey: some S3-compatible edges collapse `..` segments, so relative keys are refused outright.
  const object = (key: string) => ({ Bucket, Key: safeKey(key) })

  return {
    name: 's3',
    async put(key, data, mime) {
      await client.send(new PutObjectCommand({ ...object(key), Body: data, ContentType: mime || 'application/octet-stream', ContentLength: data.length }))
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand(object(key)))
        if (!res.Body) return null
        return Buffer.from(await res.Body.transformToByteArray())
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async stream(key) {
      try {
        const res = await client.send(new GetObjectCommand(object(key)))
        if (!res.Body) return null
        return { body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>, size: res.ContentLength }
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand(object(key)))
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand(object(key)))
        return true
      } catch (error) {
        if (isMissing(error)) return false
        throw error
      }
    },
    async size(key) {
      try {
        const res = await client.send(new HeadObjectCommand(object(key)))
        return res.ContentLength ?? null
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
  }
}
