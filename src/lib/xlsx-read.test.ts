import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { unzip } from './xlsx-read'

/** A ZIP with one deflated part and `entries` central-directory records that all point at it, each declaring `declared` bytes. */
function craftedZip(data: Buffer, entries: number, declared: number, distinctNames = true): Buffer {
  const name = Buffer.from('xl/a.xml')
  const packed = deflateRawSync(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(packed.length, 18)
  local.writeUInt32LE(declared, 22)
  local.writeUInt16LE(name.length, 26)
  const body = Buffer.concat([local, name, packed])
  const central: Buffer[] = []
  for (let i = 0; i < entries; i += 1) {
    const entryName = distinctNames ? Buffer.from(`xl/a${i}.xml`) : name
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(8, 10)
    head.writeUInt32LE(packed.length, 20)
    head.writeUInt32LE(declared, 24)
    head.writeUInt16LE(entryName.length, 28)
    head.writeUInt32LE(0, 42)
    central.push(head, entryName)
  }
  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries, 8)
  end.writeUInt16LE(entries, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(body.length, 16)
  return Buffer.concat([body, dir, end])
}

describe('unzip zip-bomb guards', () => {
  it('reads a normal single-part archive', () => {
    const parts = unzip(craftedZip(Buffer.from('<x/>'), 1, 4))
    expect(parts.get('xl/a0.xml')?.toString()).toBe('<x/>')
  })

  it('refuses a part that inflates past the cap even when it declares size 0', () => {
    expect(() => unzip(craftedZip(Buffer.alloc(41 * 1024 * 1024), 1, 0))).toThrow(/too large once unpacked/)
  })

  it('refuses many directory entries that point at the same stored part', () => {
    expect(() => unzip(craftedZip(Buffer.alloc(1024), 3, 0))).toThrow(/damaged zip/)
  })

  it('refuses archives with an absurd number of parts', () => {
    expect(() => unzip(craftedZip(Buffer.alloc(8), 1001, 8))).toThrow(/too many parts/)
  })
})
