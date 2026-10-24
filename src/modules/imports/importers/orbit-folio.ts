import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { Client } from '@/models/Client'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { IMPORT_FIELDS, mapRows } from '@/modules/orbit/csvImport'
import { checkLeadRows, insertLeads, type LeadDoc } from '@/modules/orbit/lead-import-run'
import { getOrbitSettings } from '@/modules/orbit/settings'
import { IMPORT_MAX_ROWS } from '@/modules/orbit/constants'
import { sheetRows } from '../sheet'
import type { Importer } from '../types'
import { key, unknownHeaders } from './common'
import { checkContactRows, checkFolioClientRows, CONTACT_COLUMNS, FOLIO_CLIENT_COLUMNS, groupContacts, type ClientLookups, type ContactRecord, type FolioClientRecord } from './clients-rules'
import { checkFolioItemRows, FOLIO_ITEM_COLUMNS, type FolioItemRecord } from './folio-items-rules'

/** Orbit leads (existing importer, wrapped), Orbit contacts and companies, Folio clients and items. */

const LEAD_EXAMPLE: Record<string, string> = { company: 'Acme Traders', linkedin: '', instagram: '', email: 'vikram@acme.example', phone: '9876543210', designation: 'Founder', contact: 'Vikram Rao', website: 'acme.example', sector: 'retail', source: 'referral', notes: '' }

export const leadsImporter: Importer<LeadDoc> = {
  kind: 'leads',
  label: 'Leads',
  description: 'Orbit leads: company, contact, sector and source. Open duplicates are skipped.',
  product: 'orbit',
  perm: 'leads.write',
  maxRows: IMPORT_MAX_ROWS,
  columns: IMPORT_FIELDS.map((k) => ({ key: k, required: k === 'company', example: LEAD_EXAMPLE[k] ?? '' })),
  check: async (sheet, ctx) => {
    const cfg = await getOrbitSettings(ctx)
    const mapped = mapRows([sheet.headers, ...sheet.cells], { sectors: cfg.sectors, sources: cfg.sources })
    const rows = await checkLeadRows(ctx, mapped.rows, { ownerId: String(ctx.memberId), reviewerId: cfg.defaultReviewerId })
    return { ignored: [], rows: rows.map((r) => ({ line: r.line, label: r.label, errors: r.errors, warnings: r.warnings, record: r.doc })) }
  },
  commit: async (records, ctx) => {
    const { leadIds, eventIds } = await insertLeads(ctx, records)
    return { created: [{ model: 'Lead', ids: leadIds }, { model: 'StageEvent', ids: eventIds }], count: leadIds.length }
  },
}

async function clientLookups(ctx: Ctx): Promise<ClientLookups> {
  const clients = await ctx.db(Client).find({}, { name: 1, gstin: 1 }).lean()
  return { names: new Set(clients.map((c) => key(c.name))), gstins: new Set(clients.flatMap((c) => (c.gstin ? [c.gstin.toUpperCase()] : []))) }
}

const insertClients = async (ctx: Ctx, docs: Record<string, unknown>[]) => {
  const inserted = await ctx.db(Client).insertMany(docs.map((d) => ({ ...d, ownerId: ctx.memberId })))
  return { created: [{ model: 'Client' as const, ids: inserted.map((d) => d._id as Types.ObjectId) }], count: inserted.length }
}

export const contactsImporter: Importer<ContactRecord> = {
  kind: 'contacts',
  label: 'Contacts and companies',
  description: 'Companies with their contact people. Several rows with the same company add several contacts.',
  product: 'orbit',
  perm: 'clients.write',
  maxRows: 2000,
  columns: CONTACT_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    return { ignored: unknownHeaders(headers, ['company', 'company_name', 'name', 'contact_name', 'contact', 'person', 'contact_email', 'email', 'contact_phone', 'phone', 'contact_role', 'designation', 'website', 'sector', 'source', 'notes']), rows: checkContactRows(rows, await clientLookups(ctx)) }
  },
  commit: (records, ctx) => insertClients(ctx, groupContacts(records).map((c) => ({ ...c, kind: 'company', status: 'active' }))),
}

export const folioClientsImporter: Importer<FolioClientRecord> = {
  kind: 'folio_clients',
  label: 'Folio clients',
  description: 'Billing clients with GSTIN, PAN, state and address, ready for invoices.',
  product: 'folio',
  perm: 'clients.write',
  maxRows: 2000,
  columns: FOLIO_CLIENT_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    return { ignored: unknownHeaders(headers, ['name', 'client', 'company', 'gstin', 'gst', 'gst_number', 'pan', 'state', 'state_code', 'email', 'phone', 'address_line1', 'address', 'city', 'pincode', 'pin', 'contact_name']), rows: checkFolioClientRows(rows, await clientLookups(ctx)) }
  },
  commit: (records, ctx) => insertClients(ctx, records.map(({ contact, ...r }) => ({ ...r, kind: 'company', status: 'active', contacts: contact ? [contact] : [] }))),
}

export const folioItemsImporter: Importer<FolioItemRecord> = {
  kind: 'folio_items',
  label: 'Folio items',
  description: 'Your service catalogue: code, name, HSN/SAC, rate and GST rate.',
  product: 'folio',
  perm: 'folio.settings',
  maxRows: 1000,
  columns: FOLIO_ITEM_COLUMNS,
  check: async (sheet, ctx) => {
    const { headers, rows } = sheetRows(sheet)
    const codes = new Set((await ctx.db(FolioServiceItem).find({}, { code: 1 }).lean()).map((i) => i.code.toUpperCase()))
    return { ignored: unknownHeaders(headers, ['code', 'item_code', 'sku', 'name', 'item', 'item_name', 'description', 'hsn_sac', 'hsn', 'sac', 'unit', 'rate', 'price', 'amount', 'gst_rate', 'gst', 'tax_rate']), rows: checkFolioItemRows(rows, codes) }
  },
  commit: async (records, ctx) => {
    const inserted = await ctx.db(FolioServiceItem).insertMany(records.map((r) => ({ ...r })))
    return { created: [{ model: 'FolioServiceItem', ids: inserted.map((d) => d._id as Types.ObjectId) }], count: inserted.length }
  },
}
