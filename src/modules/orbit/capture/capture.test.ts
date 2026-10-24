import { describe, expect, it } from 'vitest'
import { pickAssignee } from './assign'
import { cleanOrigins, honeypotTripped, originAllowed } from './guard'
import { draftFromIndiamartPush, indiamartTime, indiamartUrl, mapIndiamartResponse, mayPull, pullWindow, tallyPull } from './indiamart'
import { draftFromFields, draftFromWebhook } from './map'

const NOW = new Date('2026-10-08T06:30:00Z')

describe('website form protection', () => {
  it('trips the honeypot only when the hidden field has text', () => {
    expect(honeypotTripped({ name: 'A', company_website: 'http://spam.biz' })).toBe(true)
    expect(honeypotTripped({ name: 'A', company_website: '  ' })).toBe(false)
    expect(honeypotTripped({ name: 'A' })).toBe(false)
  })

  it('accepts only listed origins (or their referer), with *.domain for subdomains', () => {
    const allowed = ['https://acme.in', '*.acme.co']
    expect(originAllowed('https://acme.in', null, allowed)).toBe(true)
    expect(originAllowed(null, 'https://acme.in/contact?x=1', allowed)).toBe(true)
    expect(originAllowed('https://shop.acme.co', null, allowed)).toBe(true)
    expect(originAllowed('https://acme.co', null, allowed)).toBe(false)
    expect(originAllowed('https://evil.com', 'https://acme.in/', allowed)).toBe(false)
    expect(originAllowed('http://acme.in', null, allowed)).toBe(false)
    expect(originAllowed(null, null, allowed)).toBe(false)
    expect(originAllowed('https://acme.in', null, [])).toBe(false)
  })

  it('cleans a typed list of websites', () => {
    expect(cleanOrigins(['acme.in', 'https://Acme.in/contact', '*.acme.co', 'javascript:alert(1)', ''])).toEqual(['https://acme.in', '*.acme.co'])
  })
})

describe('mapping enquiries to leads', () => {
  it('reads a website form with UTM tags and keeps unknown fields as notes', () => {
    const d = draftFromFields({ name: 'Ravi Kumar', email: 'RAVI@Acme.in', phone: '98765 43210', company: 'Acme', message: 'Need a quote', budget: '2 lakh', utm_source: 'google', utm_campaign: 'diwali' }, 'website_form', { extraTags: ['website'] })
    expect(d).toMatchObject({ companyName: 'Acme', contactName: 'Ravi Kumar', email: 'ravi@acme.in', phone: '+919876543210', source: 'website_form', tags: ['website'], utm: { source: 'google', campaign: 'diwali' }, externalId: null })
    expect(d?.notes).toBe('Need a quote\nbudget: 2 lakh')
  })

  it('needs a way to reach the person', () => {
    expect(draftFromFields({ name: 'No contact', email: 'not-an-email' }, 'website_form')).toBeNull()
  })

  it('maps Meta lead ads field_data, JustDial and flat Zapier JSON', () => {
    const meta = draftFromWebhook({ leadgen_id: '991', campaign_name: 'Diwali', field_data: [{ name: 'full_name', values: ['Asha Rao'] }, { name: 'phone_number', values: ['+919812345678'] }, { name: 'email', values: ['asha@x.in'] }] })
    expect(meta).toMatchObject({ source: 'meta_lead_ads', contactName: 'Asha Rao', phone: '+919812345678', externalId: '991', tags: ['diwali'] })
    const jd = draftFromWebhook({ leadid: 'JD-77', prefix: 'Mr', name: 'Sunil', mobile: '9898989898', email: '', category: 'Interior designers', city: 'Bhopal', area: 'MP Nagar' })
    expect(jd).toMatchObject({ source: 'justdial', contactName: 'Mr Sunil', phone: '+919898989898', externalId: 'JD-77' })
    expect(jd?.notes).toContain('Interior designers')
    const zap = draftFromWebhook({ data: { 'Full Name': 'Kiran', 'Email Address': 'kiran@y.com', tags: 'hot, expo' } })
    expect(zap).toMatchObject({ source: 'webhook', contactName: 'Kiran', email: 'kiran@y.com', tags: ['hot', 'expo'] })
    expect(draftFromWebhook({ hello: 'world' })).toBeNull()
  })
})

describe('IndiaMART adapter (beta)', () => {
  it('formats IST times and the pull URL', () => {
    expect(indiamartTime(NOW)).toBe('08-10-202612:00:00')
    const url = indiamartUrl('KEY123', { from: new Date('2026-10-08T05:30:00Z'), to: NOW })
    expect(url).toBe('https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=KEY123&start_time=08-10-202611%3A00%3A00&end_time=08-10-202612%3A00%3A00')
  })

  it('pulls from the last pull with an overlap, never more than 7 days back, and at most every 5 minutes', () => {
    expect(pullWindow(null, NOW).from.toISOString()).toBe('2026-10-07T06:30:00.000Z')
    expect(pullWindow(new Date('2026-10-08T06:00:00Z'), NOW).from.toISOString()).toBe('2026-10-08T05:50:00.000Z')
    expect(NOW.getTime() - pullWindow(new Date('2026-09-01T00:00:00Z'), NOW).from.getTime()).toBeLessThan(7 * 86_400_000)
    expect(mayPull(new Date(NOW.getTime() - 4 * 60_000), NOW)).toBe(false)
    expect(mayPull(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe(true)
    expect(mayPull(null, NOW)).toBe(true)
  })

  it('maps the documented fields and drops repeats within one answer', () => {
    const row = { UNIQUE_QUERY_ID: '2795181001', QUERY_TYPE: 'W', QUERY_TIME: '2026-10-08 11:20:00', SENDER_NAME: 'Mahesh', SENDER_MOBILE: '+91-9811122233', SENDER_EMAIL: 'mahesh@abc.in', SENDER_COMPANY: 'ABC Traders', SENDER_CITY: 'Indore', SENDER_STATE: 'MP', QUERY_PRODUCT_NAME: 'Steel racks', QUERY_MESSAGE: 'Need 20 racks' }
    const result = mapIndiamartResponse({ CODE: 200, STATUS: 'SUCCESS', TOTAL_RECORDS: 2, RESPONSE: [row, row, { UNIQUE_QUERY_ID: '2', SENDER_NAME: 'No contact' }] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]).toMatchObject({ source: 'indiamart', externalId: '2795181001', companyName: 'ABC Traders', contactName: 'Mahesh', phone: '+919811122233', email: 'mahesh@abc.in' })
    expect(result.drafts[0].notes).toContain('Steel racks')
    expect(result.drafts[0].tags).toContain('indiamart')
  })

  it('treats "no leads" as an empty success and a FAILURE as an error', () => {
    expect(mapIndiamartResponse({ CODE: 204, STATUS: 'FAILURE', MESSAGE: 'There are no leads in the given time duration.' })).toEqual({ ok: true, drafts: [] })
    expect(mapIndiamartResponse({ CODE: 429, STATUS: 'FAILURE', MESSAGE: 'It is advised to hit this API once in every 5 minutes' })).toEqual({ ok: false, error: 'It is advised to hit this API once in every 5 minutes' })
    expect(mapIndiamartResponse(null)).toMatchObject({ ok: false })
  })
})

describe('assignment', () => {
  const active = new Set(['a', 'b', 'c'])
  it('gives every lead to the chosen owner, or the workspace owner when they left', () => {
    expect(pickAssignee({ mode: 'owner', ownerId: 'b', pool: [], cursor: 7, active, fallback: 'a' })).toBe('b')
    expect(pickAssignee({ mode: 'owner', ownerId: 'gone', pool: [], cursor: 0, active, fallback: 'a' })).toBe('a')
    expect(pickAssignee({ mode: 'owner', ownerId: null, pool: [], cursor: 0, active, fallback: 'a' })).toBe('a')
  })

  it('takes turns over the active members of the pool', () => {
    const pool = ['a', 'gone', 'b', 'c']
    expect([0, 1, 2, 3, 4].map((cursor) => pickAssignee({ mode: 'round_robin', ownerId: null, pool, cursor, active, fallback: 'a' }))).toEqual(['a', 'b', 'c', 'a', 'b'])
    expect(pickAssignee({ mode: 'round_robin', ownerId: 'c', pool: ['gone'], cursor: 3, active, fallback: 'a' })).toBe('c')
  })
})

describe('IndiaMART pull tally', () => {
  it('advances the window when every enquiry was saved or already known', () => {
    expect(tallyPull([{ status: 'created' }, { status: 'duplicate' }, { status: 'created' }])).toEqual({ created: 2, duplicates: 1, refused: 0, advance: true, error: '' })
  })

  it('keeps the window and reports an error when an enquiry was refused, so it is not lost', () => {
    const tally = tallyPull([{ status: 'created' }, { status: 'refused', reason: 'This workspace has no one who can own leads.' }])
    expect(tally).toMatchObject({ created: 1, duplicates: 0, refused: 1, advance: false })
    expect(tally.error).toContain('1 enquiry was not saved')
    expect(tally.error).toContain('no one who can own leads')
  })
})

describe('IndiaMART push to the lead webhook', () => {
  it('unwraps the RESPONSE enquiry and keeps its UNIQUE_QUERY_ID', () => {
    const body = { CODE: 200, STATUS: 'SUCCESS', RESPONSE: { UNIQUE_QUERY_ID: '2795181009', QUERY_TYPE: 'W', SENDER_NAME: 'Mahesh', SENDER_MOBILE: '+91-9811122233', SENDER_COMPANY: 'ABC Traders', QUERY_MESSAGE: 'Need racks' } }
    expect(draftFromIndiamartPush(body)).toMatchObject({ source: 'indiamart', externalId: '2795181009', companyName: 'ABC Traders', phone: '+919811122233' })
  })

  it('leaves other webhook bodies to the generic mapping', () => {
    expect(draftFromIndiamartPush({ name: 'Kiran', email: 'kiran@y.com' })).toBeNull()
    expect(draftFromIndiamartPush({ RESPONSE: [{ UNIQUE_QUERY_ID: '1' }] })).toBeNull()
    expect(draftFromIndiamartPush(null)).toBeNull()
  })
})
