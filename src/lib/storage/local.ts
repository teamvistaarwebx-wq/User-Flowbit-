import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { safeKey, type StorageDriver } from './types'

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'

/**
 * Files on the server's disk under `root` (STORAGE_DIR, default ./storage).
 * For local development and single-server hosting; not for Vercel, whose
 * disk is temporary and not shared between function instances.
 */
export function localDriver(rootDir: string): StorageDriver {
  // Uploaded bytes are runtime data, not code: keep the bundler from tracing the whole project.
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), rootDir)
  const resolve = (key: string) => {
    // safeKey refuses `..`, `.` and empty segments, so the key names exactly one file below root.
    const absolute = path.resolve(/*turbopackIgnore: true*/ root, safeKey(key))
    if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error(`Storage key leaves the storage folder: ${key}`)
    return absolute
  }

  return {
    name: 'local',
    async put(key, data) {
      const absolute = resolve(key)
      await mkdir(path.dirname(absolute), { recursive: true })
      await writeFile(absolute, data)
    },
    async get(key) {
      try {
        return await readFile(resolve(key))
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async stream(key) {
      const absolute = resolve(key)
      try {
        const { size } = await stat(absolute)
        return { body: Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>, size }
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async delete(key) {
      try {
        await unlink(resolve(key))
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    },
    async exists(key) {
      try {
        await access(resolve(key))
        return true
      } catch {
        return false
      }
    },
    async size(key) {
      try {
        return (await stat(resolve(key))).size
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
  }
}
