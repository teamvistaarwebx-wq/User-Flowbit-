/**
 * When employees may change their tax declaration and upload proofs (pure).
 * Declarations stay open until HR closes them; proofs need a window HR sets.
 */

import { formatDate } from '@/lib/dates'

type YearSettings = { declarationsOpen?: boolean | null; proofOpens?: string | null; proofCloses?: string | null } | null | undefined

export type WindowState = { open: true } | { open: false; reason: string }

export function declarationWindow(settings: YearSettings): WindowState {
  if (settings?.declarationsOpen === false) return { open: false, reason: 'HR has closed declarations for this tax year. Ask HR if something changed.' }
  return { open: true }
}

export function proofWindow(settings: YearSettings, today: string): WindowState {
  const opens = settings?.proofOpens
  const closes = settings?.proofCloses
  if (!opens || !closes) return { open: false, reason: 'HR has not opened the proof window yet. You will be able to upload proofs once it opens.' }
  if (today < opens) return { open: false, reason: `Proofs can be uploaded from ${formatDate(opens)}.` }
  if (today > closes) return { open: false, reason: `The proof window closed on ${formatDate(closes)}. Ask HR if you still need to submit.` }
  return { open: true }
}
