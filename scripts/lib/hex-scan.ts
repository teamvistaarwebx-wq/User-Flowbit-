import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { findHexClasses, isCheckedFile, type HexClassHit } from '../../src/lib/hex-classes'

const SKIP_DIRS = new Set(['node_modules', '.next'])

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : listFiles(join(dir, entry.name))
    return [join(dir, entry.name)]
  })
}

/** Every non-allowed `-[#hex]` class under `<root>/src`. */
export function scanHexClasses(root: string): HexClassHit[] {
  return listFiles(join(root, 'src'))
    .map((abs) => relative(root, abs).split('\\').join('/'))
    .filter((rel) => isCheckedFile(rel))
    .flatMap((rel) => findHexClasses(rel, readFileSync(join(root, rel), 'utf8')))
}
