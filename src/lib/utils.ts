import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names and resolves Tailwind conflicts (last wins). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** "Aditi Singh" -> "AS". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? ''

const SLUG_MAX = 48

/** Lowercase letters and digits, every other run turned into one hyphen, no leading hyphen. */
const slugChars = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)

/** Lowercase URL slug: "Vistaar WebX" -> "vistaar-webx". */
export function slugify(value: string): string {
  return slugChars(value).replace(/-+$/, '')
}

/**
 * A slug while it is being typed: like slugify, but one trailing hyphen stays
 * so "my-" can still become "my-team". Run slugify before saving it.
 */
export function slugDraft(value: string): string {
  return slugChars(value)
}

/** Escapes a user string for use inside a RegExp (search boxes). */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 1.4 MB / 820 KB / 12 B. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export const pluralize = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
