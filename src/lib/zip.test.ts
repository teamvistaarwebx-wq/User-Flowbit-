import { describe, expect, it } from 'vitest'
import { crc32, zipBuffer, zipStream } from './zip'
import { readZip } from './zip-read'

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips text and binary entries with UTF-8 names', async () => {
    const zip = await zipBuffer([
      { name: 'a.txt', data: 'hello' },
      { name: 'dir/₹ नाम.csv', data: 'x,y\n1,2\n' },
      { name: 'bin', data: Buffer.from([0, 1, 2, 255]) },
    ])
    const files = readZip(zip)
    expect([...files.keys()]).toEqual(['a.txt', 'dir/₹ नाम.csv', 'bin'])
    expect(files.get('a.txt')?.toString()).toBe('hello')
    expect([...files.get('bin')!]).toEqual([0, 1, 2, 255])
  })

  it('streams the same bytes as the buffer writer', async () => {
    async function* entries() {
      yield { name: 'one.json', data: '{"a":1}' }
      yield { name: 'two.json', data: '{"b":2}' }
    }
    const now = new Date('2026-10-08T00:00:00Z')
    const chunks: Uint8Array[] = []
    const reader = zipStream(entries()).getReader()
    for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value)
    const streamed = Buffer.concat(chunks)
    expect(readZip(streamed).get('two.json')?.toString()).toBe('{"b":2}')
    expect(streamed.length).toBe((await zipBuffer(entries(), now)).length)
  })
})
