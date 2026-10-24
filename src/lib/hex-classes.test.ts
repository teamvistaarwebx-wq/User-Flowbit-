import { describe, expect, it } from 'vitest'
import { scanHexClasses } from '../../scripts/lib/hex-scan'
import { compareWithBaseline, findHexClasses, isCheckedFile, worstFiles } from './hex-classes'

describe('findHexClasses', () => {
  it('finds arbitrary hex classes with variants and opacity', () => {
    // Arrange
    const source = `<div className="text-[#979797] hover:bg-[#B86BA8]/35 [&_svg]:text-[#08ad93] bg-orchid" />`
    // Act
    const hits = findHexClasses('a.tsx', source, [])
    // Assert
    expect(hits.map((h) => h.hex)).toEqual(['#979797', '#B86BA8', '#08AD93'])
  })

  it('skips allowed hex values in any case', () => {
    expect(findHexClasses('a.tsx', 'text-[#3b2c0b] bg-[#E4BD6D]', ['#3B2C0B'])).toEqual([{ file: 'a.tsx', hex: '#E4BD6D' }])
  })

  it('ignores hex values outside an arbitrary class', () => {
    expect(findHexClasses('a.tsx', `const c = '#979797'; style={{ color: '#fff' }}`, [])).toEqual([])
  })
})

describe('isCheckedFile', () => {
  it('checks TS and TSX source but not tests or allowed paths', () => {
    expect(isCheckedFile('src/a.tsx', [])).toBe(true)
    expect(isCheckedFile('src/a.test.ts', [])).toBe(false)
    expect(isCheckedFile('src/a.css', [])).toBe(false)
    expect(isCheckedFile('src/mocks/a.tsx', ['src/mocks/'])).toBe(false)
  })
})

describe('compareWithBaseline', () => {
  it('fails when the count rises above the baseline', () => {
    expect(compareWithBaseline(11, 10).ok).toBe(false)
  })

  it('passes at or below the baseline and asks to lower it when below', () => {
    expect(compareWithBaseline(10, 10).ok).toBe(true)
    const below = compareWithBaseline(8, 10)
    expect(below.ok).toBe(true)
    expect(below.message).toContain('Lower HEX_CLASS_BASELINE')
  })
})

describe('worstFiles', () => {
  it('groups hits by file, worst first', () => {
    const hits = [{ file: 'b', hex: '#1' }, { file: 'a', hex: '#1' }, { file: 'b', hex: '#2' }]
    expect(worstFiles(hits)).toEqual([{ file: 'b', count: 2 }, { file: 'a', count: 1 }])
  })
})

describe('hex class ratchet', () => {
  it('has no more arbitrary [#hex] classes in src than the baseline', () => {
    // Arrange / Act
    const hits = scanHexClasses(process.cwd())
    const result = compareWithBaseline(hits.length)
    // Assert
    expect(result.ok, `${result.message}\n${worstFiles(hits).map((f) => `${f.count}\t${f.file}`).join('\n')}`).toBe(true)
  })
})
