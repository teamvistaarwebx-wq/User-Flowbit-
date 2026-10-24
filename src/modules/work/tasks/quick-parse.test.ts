import { describe, expect, it } from 'vitest'
import { fuzzyFind, parseQuickAdd, type QuickOptions } from './quick-parse'

/** Wednesday 7 Oct 2026, 10:00 IST. */
const NOW = new Date('2026-10-07T04:30:00Z')

const OPTS: QuickOptions = {
  people: [{ id: 'p-vik', name: 'Vikram Singh' }, { id: 'p-ana', name: 'Ananya Rao' }, { id: 'p-sam', name: 'Sameer Khan' }],
  projects: [{ id: 'pr-ds', name: 'Design Sprint', code: 'DS' }, { id: 'pr-web', name: 'Website Revamp', code: 'WEB' }],
  spaces: [{ id: 'sp-mkt', name: 'Marketing', listIds: ['l-cal'] }, { id: 'sp-eng', name: 'Engineering', listIds: ['l-ops', 'l-bugs'] }],
  lists: [{ id: 'l-cal', name: 'Content calendar', spaceId: 'sp-mkt' }, { id: 'l-ops', name: 'Ops', spaceId: 'sp-eng' }, { id: 'l-bugs', name: 'Bugs', spaceId: 'sp-eng' }],
  clients: [{ id: 'c-acme', name: 'Acme Corp' }, { id: 'c-zen', name: 'Zenith Foods' }],
}

const parse = (text: string, skip: string[] = []) => parseQuickAdd(text, OPTS, NOW, skip)

describe('parseQuickAdd: dates', () => {
  it.each([
    ['aaj report bhejo', '2026-10-07'],
    ['kal report bhejo', '2026-10-08'],
    ['parso report bhejo', '2026-10-09'],
    ['report tomorrow', '2026-10-08'],
    ['report next mon', '2026-10-12'],
    ['report monday', '2026-10-12'],
    ['report wed', '2026-10-14'],
    ['report next friday', '2026-10-16'],
    ['report agle hafte', '2026-10-12'],
    ['report 15 oct', '2026-10-15'],
    ['report oct 5', '2027-10-05'],
    ['report 15/10', '2026-10-15'],
    ['report in 3 days', '2026-10-10'],
    ['report 3 din mein', '2026-10-10'],
  ])('%s → %s', (text, date) => {
    const r = parse(text)
    expect(r.dueDate).toBe(date)
    expect(r.title).toBe(text.endsWith('bhejo') ? 'report bhejo' : 'report')
  })

  it('leaves an impossible date in the title', () => {
    const r = parse('report 31 feb')
    expect(r.dueDate).toBeUndefined()
    expect(r.title).toBe('report 31 feb')
  })

  it('does not read everyday words as weekdays (QA 5.4)', () => {
    const sun = parse('baat sun lo')
    expect(sun.dueDate).toBeUndefined()
    expect(sun.title).toBe('baat sun lo')
    const guru = parse('guru ko call karo')
    expect(guru.dueDate).toBeUndefined()
    expect(guru.title).toBe('guru ko call karo')
    expect(parse('mangal ho').dueDate).toBeUndefined()
  })

  it('still reads those words after agle/next, and their full forms alone', () => {
    expect(parse('call agle guru').dueDate).toBe('2026-10-15')
    expect(parse('call next sun').dueDate).toBe('2026-10-18')
    expect(parse('call guruvar').dueDate).toBe('2026-10-08')
    expect(parse('call sunday').dueDate).toBe('2026-10-11')
  })

  it("reads today's weekday as a week from today, but 'by' or 'tak' as today", () => {
    expect(parse('report wednesday').dueDate).toBe('2026-10-14')
    expect(parse('report by wednesday').dueDate).toBe('2026-10-07')
    expect(parse('report budhvar tak').dueDate).toBe('2026-10-07')
  })

  it('drops the little words that tie a date on ("by friday", "kal tak")', () => {
    expect(parse('send deck by friday').title).toBe('send deck')
    expect(parse('kal tak deck bhejo').title).toBe('deck bhejo')
  })
})

describe('parseQuickAdd: times (IST)', () => {
  it.each([
    ['call friday 5pm', '2026-10-09', '17:00'],
    ['call 5 baje', '2026-10-07', '17:00'],
    ['call 9 baje', '2026-10-08', '09:00'],
    ['call shaam', '2026-10-07', '18:00'],
    ['call subah 8 baje', '2026-10-08', '08:00'],
    ['call kal shaam 6 baje', '2026-10-08', '18:00'],
    ['call 6 baje shaam', '2026-10-07', '18:00'],
    ['call 17:30', '2026-10-07', '17:30'],
    ['call kal 5:30pm', '2026-10-08', '17:30'],
    ['call kal 12 am', '2026-10-08', '00:00'],
  ])('%s → %s %s', (text, date, time) => {
    const r = parse(text)
    expect(r.dueDate).toBe(date)
    expect(r.dueTime).toBe(time)
    expect(r.title).toBe('call')
  })

  it('does not read a bare number as a time', () => {
    const r = parse('print 5 copies')
    expect(r.dueTime).toBeUndefined()
    expect(r.title).toBe('print 5 copies')
  })
})

describe('parseQuickAdd: people, places, clients, priority', () => {
  it('reads the example from the plan', () => {
    const r = parse('kal 5 baje @vikram #design !acme p1 logo bhejo')
    expect(r).toMatchObject({ title: 'logo bhejo', dueDate: '2026-10-08', dueTime: '17:00', assigneeIds: ['p-vik'], projectId: 'pr-ds', clientId: 'c-acme', priority: 'urgent' })
    expect(r.tokens.map((t) => t.kind)).toEqual(['date', 'time', 'assignee', 'project', 'client', 'priority'])
  })

  it('assigns several people and matches by first-name prefix', () => {
    expect(parse('review @ana @sam').assigneeIds).toEqual(['p-ana', 'p-sam'])
  })

  it('matches a project by its code', () => {
    expect(parse('fix footer #web').projectId).toBe('pr-web')
  })

  it('matches a list, and a space with one list', () => {
    expect(parse('restart worker #ops')).toMatchObject({ spaceId: 'sp-eng', folderId: 'l-ops' })
    expect(parse('reel script #marketing')).toMatchObject({ spaceId: 'sp-mkt', folderId: 'l-cal' })
  })

  it('prefers an exact list name over a project that only contains the word', () => {
    const opts: QuickOptions = {
      ...OPTS,
      projects: [{ id: 'pr-wr', name: 'Website Redesign', code: 'WR' }],
      lists: [...OPTS.lists, { id: 'l-design', name: 'Design', spaceId: 'sp-mkt' }],
    }
    const r = parseQuickAdd('logo bhejo #design', opts, NOW)
    expect(r).toMatchObject({ spaceId: 'sp-mkt', folderId: 'l-design' })
    expect(r.projectId).toBeUndefined()
  })

  it('still prefers a project when it matches as well as a list', () => {
    const opts: QuickOptions = { ...OPTS, lists: [...OPTS.lists, { id: 'l-ds', name: 'Design Sprint', spaceId: 'sp-mkt' }] }
    expect(parseQuickAdd('plan #design', opts, NOW).projectId).toBe('pr-ds')
  })

  it('offers no space chip when the space has several lists or none', () => {
    const many = parse('triage #engineering')
    expect(many.tokens).toEqual([])
    expect(many.spaceId).toBeUndefined()
    expect(many.title).toBe('triage #engineering')
    const opts: QuickOptions = { ...OPTS, spaces: [...OPTS.spaces, { id: 'sp-empty', name: 'Finance', listIds: [] }] }
    expect(parseQuickAdd('budget #finance', opts, NOW).spaceId).toBeUndefined()
  })

  it.each([
    ['p2', 'high'],
    ['p3', 'medium'],
    ['p4', 'low'],
    ['!!', 'high'],
    ['!!!', 'urgent'],
  ])('%s → %s priority', (word, priority) => {
    expect(parse(`ship it ${word}`).priority).toBe(priority)
  })

  it('keeps unknown mentions in the title', () => {
    const r = parse('ping @nobody about #nothing !nope')
    expect(r.tokens).toEqual([])
    expect(r.title).toBe('ping @nobody about #nothing !nope')
  })

  it('keeps a dismissed chip as plain text', () => {
    const first = parse('kal ka plan @vikram')
    const dateKey = first.tokens.find((t) => t.kind === 'date')?.key ?? ''
    const r = parse('kal ka plan @vikram', [dateKey])
    expect(r.dueDate).toBeUndefined()
    expect(r.title).toBe('kal ka plan')
    expect(r.assigneeIds).toEqual(['p-vik'])
  })
})

describe('fuzzyFind', () => {
  it('needs at least two letters and prefers exact names', () => {
    expect(fuzzyFind('a', OPTS.people)).toBeUndefined()
    expect(fuzzyFind('zenith', OPTS.clients)?.id).toBe('c-zen')
    expect(fuzzyFind('foods', OPTS.clients)?.id).toBe('c-zen')
  })
})
