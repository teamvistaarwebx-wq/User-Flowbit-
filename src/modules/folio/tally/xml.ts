import type { Voucher, VoucherEntry } from './vouchers'

/**
 * Tally XML in the documented import envelope (TallyPrime):
 * ENVELOPE / HEADER (TALLYREQUEST = Import Data) / BODY / IMPORTDATA / REQUESTDESC (REPORTNAME,
 * STATICVARIABLES/SVCURRENTCOMPANY) / REQUESTDATA / TALLYMESSAGE / LEDGER | VOUCHER.
 * In a voucher a debit is ISDEEMEDPOSITIVE=Yes with a negative AMOUNT and a credit is No with a
 * positive AMOUNT, so the AMOUNTs of a balanced voucher sum to zero.
 */

export type PartyMaster = { name: string; gstin: string | null; state: string | null }
export type TallyExport = { company: string | null; vouchers: readonly Voucher[]; parties?: readonly PartyMaster[]; debtorsGroup: string }

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
// Characters XML 1.0 does not allow (control codes other than tab, LF and CR).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

export const xmlEscape = (value: string) => value.replace(INVALID_XML, '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

/** '2026-10-09' → '20261009'. */
export const tallyDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '')

/** Paise → '1234.50' (Tally amounts are rupees with two decimals). */
export function tallyAmount(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(Math.round(paise))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const tag = (name: string, value: string) => `<${name}>${xmlEscape(value)}</${name}>`

function entryXml(e: VoucherEntry): string {
  const debit = e.paise > 0
  const bills = (e.bills ?? []).map((b) => ['<BILLALLOCATIONS.LIST>', tag('NAME', b.name), tag('BILLTYPE', b.type), tag('AMOUNT', tallyAmount(-b.paise)), '</BILLALLOCATIONS.LIST>'].join(''))
  return ['<ALLLEDGERENTRIES.LIST>', tag('LEDGERNAME', e.ledger), tag('ISDEEMEDPOSITIVE', debit ? 'Yes' : 'No'), tag('AMOUNT', tallyAmount(-e.paise)), ...bills, '</ALLLEDGERENTRIES.LIST>'].join('')
}

function voucherXml(v: Voucher): string {
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${xmlEscape(v.type)}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    tag('DATE', tallyDate(v.date)),
    tag('VOUCHERTYPENAME', v.type),
    tag('VOUCHERNUMBER', v.number),
    v.party ? tag('PARTYLEDGERNAME', v.party) : '',
    tag('PERSISTEDVIEW', 'Accounting Voucher View'),
    tag('NARRATION', v.narration),
    ...v.entries.map(entryXml),
    '</VOUCHER></TALLYMESSAGE>',
  ].join('')
}

function partyXml(p: PartyMaster, group: string): string {
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xmlEscape(p.name)}" ACTION="Create">`,
    `<NAME.LIST>${tag('NAME', p.name)}</NAME.LIST>`,
    tag('PARENT', group),
    tag('ISBILLWISEON', 'Yes'),
    p.gstin ? tag('PARTYGSTIN', p.gstin) + tag('GSTREGISTRATIONTYPE', 'Regular') : tag('GSTREGISTRATIONTYPE', 'Unregistered/Consumer'),
    p.state ? tag('LEDSTATENAME', p.state) : '',
    '</LEDGER></TALLYMESSAGE>',
  ].join('')
}

/** The whole import file. Party masters (when given) come first so the vouchers can reference them. */
export function toTallyXml(data: TallyExport): string {
  const company = data.company ? `<STATICVARIABLES>${tag('SVCURRENTCOMPANY', data.company)}</STATICVARIABLES>` : ''
  const body = [...(data.parties ?? []).map((p) => partyXml(p, data.debtorsGroup)), ...data.vouchers.map(voucherXml)].join('\n')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ENVELOPE>',
    '<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>',
    '<BODY><IMPORTDATA>',
    `<REQUESTDESC><REPORTNAME>${data.parties?.length ? 'All Masters' : 'Vouchers'}</REPORTNAME>${company}</REQUESTDESC>`,
    '<REQUESTDATA>',
    body,
    '</REQUESTDATA>',
    '</IMPORTDATA></BODY>',
    '</ENVELOPE>',
    '',
  ].join('\n')
}
