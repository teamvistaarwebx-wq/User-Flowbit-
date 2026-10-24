import { gstinMatchesState, stateByCode2, stateOfGstin } from '@/lib/india-states'
import type { CsvRow } from '@/modules/muster/import/csv'
import type { CheckedRow } from '../types'
import { EMAIL, firstSeen, key, pick, rowResult } from './common'

/**
 * Clients (pure): Orbit contacts and companies (one company, many contact
 * rows) and Folio clients (GSTIN, PAN, state, billing address). Both land in
 * the shared Client collection; an existing name or GSTIN is refused.
 */

export const CONTACT_COLUMNS = [
  { key: 'company', required: true, example: 'Acme Traders' },
  { key: 'contact_name', example: 'Vikram Rao' },
  { key: 'contact_email', example: 'vikram@acme.example' },
  { key: 'contact_phone', example: '9876543210' },
  { key: 'contact_role', example: 'Founder' },
  { key: 'website', example: 'acme.example' },
  { key: 'sector', example: 'retail' },
  { key: 'source', example: 'referral' },
  { key: 'notes', example: '' },
] as const

export const FOLIO_CLIENT_COLUMNS = [
  { key: 'name', required: true, example: 'Acme Traders Pvt Ltd' },
  { key: 'gstin', example: '23ABCDE1234F1Z5' },
  { key: 'pan', example: 'ABCDE1234F' },
  { key: 'state', example: 'MP', help: 'Two-letter state code; taken from the GSTIN when blank.' },
  { key: 'email', example: 'accounts@acme.example' },
  { key: 'phone', example: '9876543210' },
  { key: 'address_line1', example: '12 MG Road' },
  { key: 'city', example: 'Indore' },
  { key: 'pincode', example: '452001' },
  { key: 'contact_name', example: 'Vikram Rao' },
] as const

type Contact = { name: string; email?: string; phone?: string; role?: string; primary: boolean }
export type ContactRecord = { name: string; website?: string; sector?: string; source?: string; notes?: string; contact?: Contact }
export type FolioClientRecord = { name: string; gstin?: string; pan?: string; state?: string; email?: string; phone?: string; billingAddress: { line1?: string; city?: string; state?: string; pincode?: string }; contact?: Contact }

export type ClientLookups = { names: ReadonlySet<string>; gstins: ReadonlySet<string> }

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/

function contactOf(row: CsvRow, errors: string[], warnings: string[], primary: boolean): Contact | undefined {
  const name = pick(row, 'contact_name', 'contact', 'person').slice(0, 80)
  const email = key(pick(row, 'contact_email', 'email'))
  if (email && !EMAIL.test(email)) {
    warnings.push(`"${email}" is not an email address, so it was left out.`)
  }
  if (!name) {
    if (email) errors.push('A contact email needs a contact name.')
    return undefined
  }
  return { name, email: email && EMAIL.test(email) ? email : undefined, phone: pick(row, 'contact_phone', 'phone').slice(0, 20) || undefined, role: pick(row, 'contact_role', 'designation').slice(0, 60) || undefined, primary }
}

/** One record per row; rows of the same company after the first only add a contact (see groupContacts). */
export function checkContactRows(rows: readonly CsvRow[], lookups: ClientLookups): CheckedRow<ContactRecord>[] {
  const seenCompany = firstSeen()
  return rows.map((row) => {
    const errors: string[] = []
    const warnings: string[] = []
    const name = pick(row, 'company', 'company_name', 'name').slice(0, 120)
    if (!name) errors.push('Company is missing.')
    else if (lookups.names.has(key(name))) errors.push(`A client called "${name}" already exists.`)
    const first = seenCompany(key(name), row.line) == null
    const contact = contactOf(row, errors, warnings, first)
    return rowResult(row.line, name, errors, warnings, { name, website: pick(row, 'website').slice(0, 200) || undefined, sector: pick(row, 'sector').slice(0, 40) || undefined, source: pick(row, 'source').slice(0, 40) || undefined, notes: pick(row, 'notes').slice(0, 2000) || undefined, contact })
  })
}

/** Ready rows folded into one client per company, its contacts in file order. */
export function groupContacts(records: readonly ContactRecord[]): (Omit<ContactRecord, 'contact'> & { contacts: Contact[] })[] {
  const byName = new Map<string, Omit<ContactRecord, 'contact'> & { contacts: Contact[] }>()
  for (const r of records) {
    const k = key(r.name)
    const existing = byName.get(k)
    const contacts = r.contact ? [{ ...r.contact, primary: !existing?.contacts.length }] : []
    byName.set(k, existing ? { ...existing, contacts: [...existing.contacts, ...contacts] } : { name: r.name, website: r.website, sector: r.sector, source: r.source, notes: r.notes, contacts })
  }
  return [...byName.values()]
}

export function checkFolioClientRows(rows: readonly CsvRow[], lookups: ClientLookups): CheckedRow<FolioClientRecord>[] {
  const seenName = firstSeen()
  const seenGstin = firstSeen()
  return rows.map((row) => {
    const errors: string[] = []
    const warnings: string[] = []
    const name = pick(row, 'name', 'client', 'company').slice(0, 120)
    if (!name) errors.push('Client name is missing.')
    else if (lookups.names.has(key(name))) errors.push(`A client called "${name}" already exists.`)
    const earlierName = name ? seenName(key(name), row.line) : null
    if (earlierName != null) errors.push(`The same client is on line ${earlierName}.`)
    const gstin = pick(row, 'gstin', 'gst', 'gst_number').toUpperCase().replace(/\s/g, '') || undefined
    if (gstin && !GSTIN.test(gstin)) errors.push(`GSTIN "${gstin}" is not a valid 15-character GSTIN.`)
    else if (gstin && lookups.gstins.has(gstin)) errors.push(`A client with GSTIN ${gstin} already exists.`)
    const earlierGstin = gstin ? seenGstin(gstin, row.line) : null
    if (earlierGstin != null) errors.push(`GSTIN ${gstin} is also on line ${earlierGstin}.`)
    const pan = pick(row, 'pan').toUpperCase().replace(/\s/g, '') || (gstin && GSTIN.test(gstin) ? gstin.slice(2, 12) : undefined)
    if (pan && !PAN.test(pan)) errors.push(`PAN "${pan}" does not look right.`)
    const stateRaw = pick(row, 'state', 'state_code').toUpperCase()
    const state = stateRaw ? stateByCode2(stateRaw)?.code2 : gstin && GSTIN.test(gstin) ? stateOfGstin(gstin)?.code2 : undefined
    if (stateRaw && !state) errors.push(`State "${stateRaw}" is not a two-letter state code (MP, MH, KA…).`)
    if (state && gstin && GSTIN.test(gstin) && !gstinMatchesState(gstin, state)) errors.push(`The GSTIN is registered in another state than ${state}.`)
    if (!state && !gstin) warnings.push('No state: Folio asks for the place of supply on the first invoice.')
    const email = key(pick(row, 'email'))
    if (email && !EMAIL.test(email)) errors.push(`"${email}" is not an email address.`)
    const contact = contactOf({ ...row, values: { contact_name: pick(row, 'contact_name'), contact_email: '' } }, errors, warnings, true)
    return rowResult(row.line, name, errors, warnings, {
      name, gstin, pan, state, email: email || undefined, phone: pick(row, 'phone').slice(0, 20) || undefined,
      billingAddress: { line1: pick(row, 'address_line1', 'address').slice(0, 200) || undefined, city: pick(row, 'city').slice(0, 60) || undefined, state, pincode: pick(row, 'pincode', 'pin').slice(0, 10) || undefined },
      contact: contact ? { ...contact, email: email || undefined } : undefined,
    })
  })
}
