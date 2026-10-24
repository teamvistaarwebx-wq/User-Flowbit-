import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { columnIndex, decodeXml, readXlsx, serialToText } from '@/lib/xlsx-read'
import { zipBuffer } from '@/lib/zip'
import { previewSummary, undoBatch, undoLockRefusal, undoRefusal, undoUntilFrom, UNDO_DAYS, type UndoStore } from './batch'
import { checkContactRows, checkFolioClientRows, groupContacts } from './importers/clients-rules'
import { rupeesToPaise } from './importers/common'
import { checkFolioItemRows } from './importers/folio-items-rules'
import { checkTeamRows } from './importers/team-rules'
import { checkProjectRows, checkTaskRows, type WorkLookups } from './importers/work-rules'
import { seatProblem, seatsAdded } from './seats'
import { readSheet, sheetFromCsv, sheetRows } from './sheet'
import type { BatchModel } from './types'

const rows = (csv: string) => {
  const sheet = sheetFromCsv(csv)
  if ('error' in sheet) throw new Error(sheet.error)
  return sheetRows(sheet).rows
}

describe('reading the upload', () => {
  it('parses CSV with a BOM, loose headers and blank lines', () => {
    const sheet = sheetFromCsv('﻿Work Email, Role \nriya@x.in,manager\n\n,\n')
    expect(sheet).toEqual({ headers: ['Work Email', 'Role'], cells: [['riya@x.in', 'manager']] })
    const { headers, rows: data } = sheetRows(sheet as never)
    expect(headers).toEqual(['work_email', 'role'])
    expect(data).toEqual([{ line: 2, values: { work_email: 'riya@x.in', role: 'manager' } }])
  })

  it('refuses an unclosed quote, an empty file, a big file and other types', () => {
    expect(sheetFromCsv('a,b\n"x,1\n')).toHaveProperty('error')
    expect(readSheet('t.csv', Buffer.alloc(0))).toEqual({ error: expect.stringMatching(/empty/) })
    expect(readSheet('t.csv', Buffer.alloc(3 * 1024 * 1024 + 1, 'a'))).toEqual({ error: expect.stringMatching(/larger than 3 MB/) })
    expect(readSheet('t.pdf', Buffer.from('x'))).toEqual({ error: 'Upload a .csv or .xlsx file.' })
    expect(readSheet('t.xlsx', Buffer.from('not a zip'))).toEqual({ error: expect.stringMatching(/could not be read/) })
  })

  it('reads the first sheet of an .xlsx: shared and inline strings, numbers, dates, times', async () => {
    const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`
    const file = await zipBuffer([
      { name: 'xl/workbook.xml', data: xml('<workbook xmlns:r="r"><sheets><sheet name="People" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: xml('<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/sharedStrings.xml', data: xml('<sst><si><t>name</t></si><si><t>joined</t></si><si><r><t>Riya</t></r><r><t xml:space="preserve"> &amp; Co</t></r></si></sst>') },
      { name: 'xl/styles.xml', data: xml('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="20"/><xf numFmtId="164"/></cellXfs></styleSheet>') },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: xml('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>in</t></is></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>46327</v></c><c r="C2"><v>42.5</v></c><c r="D2" s="2"><v>0.4166666667</v></c><c r="E2" s="3"><v>46328</v></c><c r="F2" t="b"><v>1</v></c></row><row r="4"/></sheetData></worksheet>'),
      },
    ])
    expect(readXlsx(file)).toEqual([
      ['name', 'joined', '', 'in'],
      ['Riya & Co', '2026-11-01', '42.5', '10:00', '2026-11-02', 'TRUE'],
    ])
    const sheet = readSheet('people.XLSX', file)
    expect(sheet).toEqual({ headers: ['name', 'joined', '', 'in'], cells: [['Riya & Co', '2026-11-01', '42.5', '10:00', '2026-11-02', 'TRUE']] })
  })

  it('has the small helpers right', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AB12')).toBe(27)
    expect(decodeXml('&lt;a&gt; &#65;&#x42;')).toBe('<a> AB')
    expect(serialToText(46327.5, 'datetime')).toBe('2026-11-01 12:00')
    expect(rupeesToPaise('₹ 1,250.50')).toBe(125050)
    expect(rupeesToPaise('')).toBe(0)
    expect(rupeesToPaise('12.345')).toBeNull()
  })
})

describe('team import: validate and preview', () => {
  const lookups = { roles: new Map([['manager', 'manager'], ['project manager', 'pm_custom'], ['member', 'member']]), taken: new Set(['old@x.in']) }
  it('accepts a role by key or label and keeps title and department', () => {
    const [row] = checkTeamRows(rows('email,name,role,title,department\nRiya@X.in,Riya,Project Manager,PM,Delivery'), lookups)
    expect(row).toEqual({ line: 2, label: 'Riya', errors: [], warnings: [], record: { email: 'riya@x.in', name: 'Riya', role: 'pm_custom', title: 'PM', department: 'Delivery' } })
  })
  it('lists every row error and holds back the record', () => {
    const checked = checkTeamRows(rows('email,role\nnot-an-email,member\nold@x.in,member\na@x.in,owner\nb@x.in,ceo\nb@x.in,member\n,member'), lookups)
    expect(checked.map((r) => r.errors[0])).toEqual([
      '"not-an-email" is not an email address.',
      'This person is already in the workspace or has a pending invite.',
      'Nobody can be imported as owner. Use another role and transfer ownership later.',
      'No role called "ceo". Use one from Settings → Roles.',
      'The same email is on line 5.',
      'Email is missing.',
    ])
    expect(checked.every((r) => r.record === null)).toBe(true)
    expect(previewSummary(checked.length, 0)).toBe('0 of 6 rows are ready and 6 need fixing.')
  })
})

describe('Work import', () => {
  const lookups: WorkLookups = {
    members: new Map([['riya@x.in', 'm1']]),
    clients: new Map([['acme', 'c1']]),
    projectCodes: new Set(['WEB-01']),
    projects: new Map([['web-01', 'p1'], ['website', 'p1']]),
  }
  it('checks projects: names, codes, clients, leads, status and dates', () => {
    const checked = checkProjectRows(rows('name,code,client,lead_email,status,start_date,end_date\nRelaunch,new-1,Acme,riya@x.in,on hold,2026-11-01,2026-12-01\nDup,WEB-01,,,,,\nX,NEW-1,Nope,ghost@x.in,paused,2026-13-01,\nY,,,,,2026-12-02,2026-12-01\n,NEW-2,,,,,'), lookups)
    expect(checked[0].record).toEqual({ name: 'Relaunch', code: 'NEW-1', clientId: 'c1', leadId: 'm1', status: 'on_hold', startDate: '2026-11-01', endDate: '2026-12-01', description: undefined })
    expect(checked[1].errors).toEqual(['Project code WEB-01 is already in use.'])
    expect(checked[2].errors).toEqual(['Project code NEW-1 is also on line 2.', 'No client called "Nope". Import clients first or leave it blank.', 'No active member with the email "ghost@x.in".', expect.stringMatching(/Status "paused"/), 'Start date "2026-13-01" is not a real day. Use YYYY-MM-DD.'])
    expect(checked[3].errors).toEqual(['The end date is before the start date.'])
    expect(checked[4].errors).toEqual(['Project name is missing.'])
  })
  it('checks tasks and defaults status and priority', () => {
    const checked = checkTaskRows(rows('title,project,assignee_email,status,priority,due_date\nWrite copy,website,riya@x.in,,,2026-11-15\nShip,missing,,done,urgent,\nBad,,,later,highest,15/11/2026'), lookups)
    expect(checked[0].record).toEqual({ title: 'Write copy', projectId: 'p1', assigneeId: 'm1', status: 'todo', priority: 'medium', dueDate: '2026-11-15', description: undefined })
    expect(checked[1].errors).toEqual(['No project with the code or name "missing".'])
    expect(checked[2].errors).toHaveLength(3)
  })
})

describe('client imports (Orbit contacts and companies, Folio clients)', () => {
  const lookups = { names: new Set(['old co']), gstins: new Set(['23ABCDE1234F1Z5']) }
  it('folds several contact rows of one company into one client', () => {
    const checked = checkContactRows(rows('company,contact_name,contact_email,sector\nAcme,Vikram,vikram@acme.in,retail\nAcme,Neha,bad-email,\nOld Co,X,,\nSolo,,,'), lookups)
    expect(checked[1].warnings).toEqual(['"bad-email" is not an email address, so it was left out.'])
    expect(checked[2].errors).toEqual(['A client called "Old Co" already exists.'])
    const grouped = groupContacts(checked.flatMap((r) => (r.record ? [r.record] : [])))
    expect(grouped).toEqual([
      { name: 'Acme', website: undefined, sector: 'retail', source: undefined, notes: undefined, contacts: [{ name: 'Vikram', email: 'vikram@acme.in', phone: undefined, role: undefined, primary: true }, { name: 'Neha', email: undefined, phone: undefined, role: undefined, primary: false }] },
      { name: 'Solo', website: undefined, sector: undefined, source: undefined, notes: undefined, contacts: [] },
    ])
  })
  it('checks GSTIN, PAN and state for Folio clients and fills them from the GSTIN', () => {
    const checked = checkFolioClientRows(rows('name,gstin,pan,state,email\nAcme Pvt Ltd,27AAACA1234A1Z5,,,acct@acme.in\nDup GST,23ABCDE1234F1Z5,,,\nBad,12345,ZZ,XX,nope\nNo State,,,,'), lookups)
    expect(checked[0].record).toMatchObject({ name: 'Acme Pvt Ltd', gstin: '27AAACA1234A1Z5', pan: 'AAACA1234A', state: 'MH', email: 'acct@acme.in' })
    expect(checked[1].errors).toEqual(['A client with GSTIN 23ABCDE1234F1Z5 already exists.'])
    expect(checked[2].errors).toEqual(['GSTIN "12345" is not a valid 15-character GSTIN.', 'PAN "ZZ" does not look right.', expect.stringMatching(/State "XX"/), '"nope" is not an email address.'])
    expect(checked[3].warnings).toEqual(['No state: Folio asks for the place of supply on the first invoice.'])
  })
})

describe('Folio items import', () => {
  it('converts rupees to paise and checks codes, HSN/SAC and GST rates', () => {
    const checked = checkFolioItemRows(rows('code,name,hsn_sac,rate,gst_rate\nweb-dev,Website,998314,"25,000",18%\nOLD,Old,,1,\nX,,12,abc,7'), new Set(['OLD']))
    expect(checked[0].record).toEqual({ code: 'WEB-DEV', name: 'Website', description: undefined, hsnSac: '998314', unit: 'nos', defaultRatePaise: 2_500_000, defaultGstRatePercent: 18 })
    expect(checked[1].errors).toEqual(['Item code OLD is already in use.'])
    expect(checked[2].errors).toEqual(['Name is missing.', 'HSN/SAC "12" should be 4 to 8 digits.', 'Rate "abc" is not an amount in rupees.', expect.stringMatching(/GST rate "7"/)])
  })
})

describe('seat limits on import', () => {
  it('counts invites and employees without a login', () => {
    expect(seatsAdded({ logins: 2, employees: 3 })).toBe(5)
    expect(seatsAdded({})).toBe(0)
  })
  it('stops a Free workspace at 5 people', () => {
    expect(seatProblem({ seatLimit: 5, seatsUsed: 4, accountType: 'free' }, { logins: 1 })).toBeNull()
    expect(seatProblem({ seatLimit: 5, seatsUsed: 4, accountType: 'free' }, { logins: 2 })).toBe('The Free plan covers 5 people and 4 are in use, so only 1 more can be added. This file adds 2. Upgrade, start a trial, or import fewer people.')
    expect(seatProblem({ seatLimit: 5, seatsUsed: 5, accountType: 'free' }, { employees: 1 })).toMatch(/no one more/)
  })
  it('lets unlimited plans and seat-free imports through', () => {
    expect(seatProblem({ seatLimit: null, seatsUsed: 40 }, { logins: 100 })).toBeNull()
    expect(seatProblem({ seatLimit: 5, seatsUsed: 5 }, {})).toBeNull()
    expect(seatProblem({ seatLimit: 20, seatsUsed: 18, accountType: 'paid' }, { employees: 3 })).toMatch(/^Your plan covers 20 people/)
  })
})

describe('batch undo', () => {
  const orgA = new Types.ObjectId()
  const orgB = new Types.ObjectId()
  const ids = (n: number) => Array.from({ length: n }, () => new Types.ObjectId())

  /** An in-memory store: documents per model, each with an orgId. */
  function memoryStore(docs: { model: BatchModel; _id: Types.ObjectId; orgId: Types.ObjectId; v?: number }[]) {
    let data = [...docs]
    const store: UndoStore = {
      deleteIds: async (model, orgId, list) => {
        const wanted = new Set(list.map(String))
        const before = data.length
        data = data.filter((d) => !(d.model === model && String(d.orgId) === String(orgId) && wanted.has(String(d._id))))
        return before - data.length
      },
      replaceDocs: async (model, orgId, list) => {
        const keep = data.filter((d) => !(d.model === model && list.some((x) => String(x._id) === String(d._id)) && String(d.orgId) === String(orgId)))
        data = [...keep, ...list.map((x) => ({ ...(x as { _id: Types.ObjectId; v?: number }), model, orgId: orgId as Types.ObjectId }))]
        return list.length
      },
    }
    return { store, all: () => data }
  }

  it('removes only the documents its own batch created, in its own workspace', async () => {
    const mine = ids(3)
    const other = ids(2)
    const { store, all } = memoryStore([
      ...mine.map((_id) => ({ model: 'Employee' as const, _id, orgId: orgA })),
      ...other.map((_id) => ({ model: 'Employee' as const, _id, orgId: orgA })),
      { model: 'Employee', _id: mine[0], orgId: orgB },
      { model: 'Lead', _id: mine[1], orgId: orgA },
    ])
    const result = await undoBatch(store, { orgId: orgA, status: 'done', undoUntil: new Date(Date.now() + 1000), created: [{ model: 'Employee', ids: mine }] })
    expect(result).toEqual({ deleted: 3, restored: 0 })
    expect(all().map((d) => `${d.model}:${String(d._id) === String(mine[0]) ? 'mine0' : String(d._id) === String(mine[1]) ? 'mine1' : 'other'}:${String(d.orgId) === String(orgA) ? 'A' : 'B'}`).sort()).toEqual(['Employee:mine0:B', 'Employee:other:A', 'Employee:other:A', 'Lead:mine1:A'])
  })

  it('puts back what the import changed, after removing what it created', async () => {
    const [day] = ids(1)
    const { store, all } = memoryStore([{ model: 'AttendanceDay', _id: day, orgId: orgA, v: 2 }])
    await undoBatch(store, { orgId: orgA, status: 'done', undoUntil: new Date(Date.now() + 1000), created: [{ model: 'AttendanceDay', ids: [day] }], restore: [{ model: 'AttendanceDay', docs: [{ _id: day, v: 1 }] }] })
    expect(all()).toEqual([{ _id: day, v: 1, model: 'AttendanceDay', orgId: orgA }])
  })

  it('refuses an undone or expired batch', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    expect(undoUntilFrom(now)).toEqual(new Date(now.getTime() + UNDO_DAYS * 86_400_000))
    expect(undoRefusal({ status: 'done', undoUntil: undoUntilFrom(now) }, new Date(now.getTime() + 6 * 86_400_000))).toBeNull()
    expect(undoRefusal({ status: 'done', undoUntil: undoUntilFrom(now) }, new Date(now.getTime() + 7 * 86_400_000))).toMatch(/7 days/)
    expect(undoRefusal({ status: 'undone', undoUntil: undoUntilFrom(now) }, now)).toBe('This import was already undone.')
  })

  it('summarises a preview', () => {
    expect(previewSummary(0, 0)).toBe('The file has a header but no rows.')
    expect(previewSummary(1, 1)).toBe('The row is ready to import.')
    expect(previewSummary(4, 4)).toBe('All 4 rows are ready to import.')
    expect(previewSummary(5, 3)).toBe('3 of 5 rows are ready and 2 need fixing.')
  })
})

describe('V2-REVIEW T2: undo never changes locked or paid records', () => {
  it('refuses attendance in a locked month and employees already in payroll', () => {
    const lockedMonths = new Set(['2026-09'])
    expect(undoLockRefusal({ attendanceDates: ['2026-10-01', '2026-09-30'], lockedMonths, employeesInPayroll: false })).toMatch(/2026-09.*locked/)
    expect(undoLockRefusal({ attendanceDates: [], lockedMonths, employeesInPayroll: true })).toMatch(/Payroll/)
    expect(undoLockRefusal({ attendanceDates: ['2026-10-01'], lockedMonths, employeesInPayroll: false })).toBeNull()
  })
})

describe('V2-REVIEW C7: staff imports respect the product switch', () => {
  it('refuses an importer whose product is off', async () => {
    const { importProductRefusal } = await import('./product-gate')
    expect(importProductRefusal(() => false, { product: 'muster', label: 'Employees' })).toMatch(/not on/)
    expect(importProductRefusal(() => true, { product: 'muster', label: 'Employees' })).toBeNull()
    expect(importProductRefusal(() => false, { product: null, label: 'Members' })).toBeNull()
  })
})
