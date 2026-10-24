import { deflateRawSync } from 'node:zlib'

/**
 * A small streaming ZIP writer (PKWARE APPNOTE 6.3, deflate, UTF-8 names, no
 * ZIP64). Each entry is compressed and written as soon as it is produced, so
 * the workspace export never holds the whole archive in memory. Server-only
 * (node:zlib); limits: 65,535 entries and 4 GB, plenty for a workspace export.
 */

export type ZipEntry = { name: string; data: Buffer | string }

const MAX_ENTRIES = 0xffff
const MAX_SIZE = 0xffffffff
const UTF8_FLAG = 0x0800
const DEFLATE = 8
const VERSION = 20

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS time and date fields. */
function dosDateTime(at: Date): { time: number; date: number } {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2)
  const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()
  return { time, date }
}

type Written = { name: Buffer; crc: number; compressed: number; size: number; offset: number }

function localHeader(name: Buffer, crc: number, compressed: number, size: number, stamp: { time: number; date: number }): Buffer {
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50, 0)
  h.writeUInt16LE(VERSION, 4)
  h.writeUInt16LE(UTF8_FLAG, 6)
  h.writeUInt16LE(DEFLATE, 8)
  h.writeUInt16LE(stamp.time, 10)
  h.writeUInt16LE(stamp.date, 12)
  h.writeUInt32LE(crc, 14)
  h.writeUInt32LE(compressed, 18)
  h.writeUInt32LE(size, 22)
  h.writeUInt16LE(name.length, 26)
  h.writeUInt16LE(0, 28)
  return Buffer.concat([h, name])
}

function centralHeader(e: Written, stamp: { time: number; date: number }): Buffer {
  const h = Buffer.alloc(46)
  h.writeUInt32LE(0x02014b50, 0)
  h.writeUInt16LE(VERSION, 4)
  h.writeUInt16LE(VERSION, 6)
  h.writeUInt16LE(UTF8_FLAG, 8)
  h.writeUInt16LE(DEFLATE, 10)
  h.writeUInt16LE(stamp.time, 12)
  h.writeUInt16LE(stamp.date, 14)
  h.writeUInt32LE(e.crc, 16)
  h.writeUInt32LE(e.compressed, 20)
  h.writeUInt32LE(e.size, 24)
  h.writeUInt16LE(e.name.length, 28)
  h.writeUInt32LE(e.offset, 42)
  return Buffer.concat([h, e.name])
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const h = Buffer.alloc(22)
  h.writeUInt32LE(0x06054b50, 0)
  h.writeUInt16LE(count, 8)
  h.writeUInt16LE(count, 10)
  h.writeUInt32LE(size, 12)
  h.writeUInt32LE(offset, 16)
  return h
}

/** The ZIP's bytes, chunk by chunk, as the entries are produced. */
export async function* zipChunks(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, now: Date = new Date()): AsyncGenerator<Buffer> {
  const stamp = dosDateTime(now)
  const written: Written[] = []
  let offset = 0
  for await (const entry of entries) {
    if (written.length >= MAX_ENTRIES) throw new Error('Too many files for one ZIP.')
    const data = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data
    const body = deflateRawSync(data)
    const name = Buffer.from(entry.name.replace(/^\/+/, ''), 'utf8')
    const crc = crc32(data)
    const header = localHeader(name, crc, body.length, data.length, stamp)
    if (offset + header.length + body.length > MAX_SIZE) throw new Error('The export is larger than 4 GB.')
    written.push({ name, crc, compressed: body.length, size: data.length, offset })
    yield header
    yield body
    offset += header.length + body.length
  }
  const central = Buffer.concat(written.map((e) => centralHeader(e, stamp)))
  yield central
  yield endRecord(written.length, central.length, offset)
}

/**
 * A ZIP as a web stream for a Response body. Pull-based: the next entry is
 * read from the database only when the client has taken the previous one.
 */
export function zipStream(entries: AsyncIterable<ZipEntry>, onError: (error: unknown) => void = () => {}): ReadableStream<Uint8Array> {
  const chunks = zipChunks(entries)
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next()
        if (next.done) controller.close()
        else controller.enqueue(new Uint8Array(next.value))
      } catch (error) {
        onError(error)
        controller.error(error)
      }
    },
    async cancel() {
      await chunks.return(undefined)
    },
  })
}

/** The whole ZIP in memory (tests and small archives). */
export async function zipBuffer(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>, now?: Date): Promise<Buffer> {
  const out: Buffer[] = []
  for await (const chunk of zipChunks(entries, now)) out.push(chunk)
  return Buffer.concat(out)
}
