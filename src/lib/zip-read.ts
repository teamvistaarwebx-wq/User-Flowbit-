import { inflateRawSync } from 'node:zlib'
import { crc32 } from './zip'

/**
 * Reads a ZIP written by lib/zip through its central directory (as unzip
 * tools do), checking every CRC. Used by the tests of the zip writer and
 * the workspace export; handles only what lib/zip writes (deflate, no ZIP64).
 */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const out = new Map<string, Buffer>()
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central header')
    const crc = zip.readUInt32LE(at + 16)
    const size = zip.readUInt32LE(at + 20)
    const nameLen = zip.readUInt16LE(at + 28)
    const offset = zip.readUInt32LE(at + 42)
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString('utf8')
    const localNameLen = zip.readUInt16LE(offset + 26)
    const start = offset + 30 + localNameLen
    const data = inflateRawSync(zip.subarray(start, start + size))
    if (crc32(data) !== crc) throw new Error(`bad crc for ${name}`)
    out.set(name, data)
    at += 46 + nameLen
  }
  return out
}

