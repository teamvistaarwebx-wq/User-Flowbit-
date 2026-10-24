import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { missingS3Vars, s3ConfigFrom, storageFromEnv } from './index'
import { localDriver } from './local'
import { s3Driver, type S3Sender } from './s3'
import { normaliseKey } from './types'

const CONFIG = { region: 'auto', bucket: 'flowbit-files', accessKeyId: 'key', secretAccessKey: 'secret', endpoint: 'https://acc.r2.cloudflarestorage.com' }
const KEY = '64f000000000000000000001/2026-10/64f0000000000000000000aa-receipt.pdf'
const VICTIM_KEY = '64f000000000000000000002/2026-09/64f0000000000000000000bb-payslip.pdf'
const TRAVERSAL_KEY = `64f000000000000000000001/2026-10/64f0000000000000000000cc-x/../../../${VICTIM_KEY}`

/** A fake S3 client: `send` resolves or rejects per command class. */
function mockClient(handler: (command: unknown) => unknown) {
  const send = vi.fn(async (command: unknown) => handler(command))
  return { client: { send } as unknown as S3Sender, send }
}

const body = (bytes: Uint8Array) => ({
  transformToByteArray: async () => bytes,
  transformToWebStream: () => new Blob([Buffer.from(bytes)]).stream(),
})

const notFound = (name: string) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } })

describe('s3 driver', () => {
  it('puts a private object with its content type under the StoredFile key', async () => {
    const { client, send } = mockClient(() => ({}))
    await s3Driver(CONFIG, client).put(KEY, Buffer.from('pdf'), 'application/pdf')
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect((command as PutObjectCommand).input).toMatchObject({ Bucket: 'flowbit-files', Key: KEY, ContentType: 'application/pdf', ContentLength: 3 })
    expect((command as PutObjectCommand).input).not.toHaveProperty('ACL')
  })

  it('reads bytes back, and returns null for a missing key', async () => {
    const { client } = mockClient((command) => {
      if ((command as GetObjectCommand).input.Key === KEY) return { Body: body(new Uint8Array([1, 2, 3])) }
      throw notFound('NoSuchKey')
    })
    const driver = s3Driver(CONFIG, client)
    expect(await driver.get(KEY)).toEqual(Buffer.from([1, 2, 3]))
    expect(await driver.get('nope')).toBeNull()
  })

  it('streams an object with its size', async () => {
    const { client } = mockClient(() => ({ Body: body(new TextEncoder().encode('hello')), ContentLength: 5 }))
    const object = await s3Driver(CONFIG, client).stream(KEY)
    expect(object?.size).toBe(5)
    expect(await new Response(object!.body).text()).toBe('hello')
  })

  it('returns null when streaming a missing key, and rethrows other errors', async () => {
    const missing = s3Driver(CONFIG, mockClient(() => { throw notFound('NoSuchKey') }).client)
    expect(await missing.stream(KEY)).toBeNull()
    const broken = s3Driver(CONFIG, mockClient(() => { throw Object.assign(new Error('AccessDenied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }) }).client)
    await expect(broken.get(KEY)).rejects.toThrow('AccessDenied')
  })

  it('deletes by key and checks existence with HEAD', async () => {
    const { client, send } = mockClient((command) => {
      if (command instanceof HeadObjectCommand && command.input.Key !== KEY) throw notFound('NotFound')
      return {}
    })
    const driver = s3Driver(CONFIG, client)
    await driver.delete(KEY)
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand)
    expect(await driver.exists(KEY)).toBe(true)
    expect(await driver.exists('other')).toBe(false)
  })

  it('refuses relative keys before they reach the bucket (R3 H1)', async () => {
    const { client, send } = mockClient(() => ({}))
    const driver = s3Driver(CONFIG, client)
    await expect(driver.get(TRAVERSAL_KEY)).rejects.toThrow(/Unsafe storage key/)
    await expect(driver.delete('a//b')).rejects.toThrow(/Unsafe storage key/)
    await expect(driver.put('a/./b', Buffer.from('x'), 'text/plain')).rejects.toThrow(/Unsafe storage key/)
    expect(send).not.toHaveBeenCalled()
  })

  it('reads the object size with HEAD, null when missing', async () => {
    const { client } = mockClient((command) => {
      if (command instanceof HeadObjectCommand && command.input.Key === KEY) return { ContentLength: 42 }
      throw notFound('NotFound')
    })
    const driver = s3Driver(CONFIG, client)
    expect(await driver.size(KEY)).toBe(42)
    expect(await driver.size('org/2026-10/other.pdf')).toBeNull()
  })

  it('turns Windows separators into forward slashes', async () => {
    const { client, send } = mockClient(() => ({}))
    await s3Driver(CONFIG, client).delete('org\\2026-10\\a.pdf')
    expect((send.mock.calls[0][0] as DeleteObjectCommand).input.Key).toBe('org/2026-10/a.pdf')
    expect(normaliseKey('/a/b')).toBe('a/b')
  })
})

describe('driver selection', () => {
  const base = { STORAGE_DIR: './storage', S3_ENDPOINT: '', S3_REGION: '', S3_BUCKET: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '', S3_FORCE_PATH_STYLE: '' }

  it('uses the local disk by default', () => {
    expect(storageFromEnv({ ...base, STORAGE_DRIVER: 'local' }).name).toBe('local')
  })

  it('names every missing S3 variable', () => {
    expect(missingS3Vars({ S3_REGION: 'auto' })).toEqual(['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])
    expect(() => storageFromEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/)
  })

  it('reads the S3 settings, with path style only when asked', () => {
    const env = { ...base, STORAGE_DRIVER: 's3' as const, S3_REGION: 'ap-south-1', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }
    expect(s3ConfigFrom(env)).toEqual({ endpoint: undefined, region: 'ap-south-1', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', forcePathStyle: false })
    expect(s3ConfigFrom({ ...env, S3_FORCE_PATH_STYLE: 'TRUE' }).forcePathStyle).toBe(true)
    expect(storageFromEnv(env).name).toBe('s3')
  })
})

describe('local driver', () => {
  let dir = ''
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'flowbit-storage-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes, reads, streams and deletes under the storage folder', async () => {
    const driver = localDriver(dir)
    await driver.put(KEY, Buffer.from('bytes'), 'application/pdf')
    expect((await driver.get(KEY))?.toString()).toBe('bytes')
    const object = await driver.stream(KEY)
    expect(object?.size).toBe(5)
    expect(await new Response(object!.body).text()).toBe('bytes')
    await driver.delete(KEY)
    expect(await driver.exists(KEY)).toBe(false)
    expect(await driver.get(KEY)).toBeNull()
    await expect(driver.delete(KEY)).resolves.toBeUndefined()
  })

  it('refuses keys that climb out of the folder', async () => {
    await expect(localDriver(dir).put('../escape.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(/Unsafe storage key/)
  })

  it('refuses a key that climbs into another org and stays inside root (R3 H1)', async () => {
    // Arrange: org B's file exists under root.
    const driver = localDriver(dir)
    await driver.put(VICTIM_KEY, Buffer.from('payslip'), 'application/pdf')

    // Act + Assert: the traversal key neither reads, finds, sizes nor deletes it.
    await expect(driver.get(TRAVERSAL_KEY)).rejects.toThrow(/Unsafe storage key/)
    await expect(driver.size(TRAVERSAL_KEY)).rejects.toThrow(/Unsafe storage key/)
    await expect(driver.delete(TRAVERSAL_KEY)).rejects.toThrow(/Unsafe storage key/)
    expect(await driver.exists(TRAVERSAL_KEY)).toBe(false)
    expect((await driver.get(VICTIM_KEY))?.toString()).toBe('payslip')
  })

  it('reports the real size of a stored object, null when missing', async () => {
    const driver = localDriver(dir)
    await driver.put(KEY, Buffer.from('12345678'), 'application/pdf')
    expect(await driver.size(KEY)).toBe(8)
    await driver.delete(KEY)
    expect(await driver.size(KEY)).toBeNull()
  })
})
