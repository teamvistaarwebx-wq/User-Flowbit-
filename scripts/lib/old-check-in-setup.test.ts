import { describe, expect, it } from 'vitest'
import { officesFromOld, remoteWorkEmails } from './old-check-in-setup'

describe('work mode from the old Work app', () => {
  const users = [
    { _id: 'u1', email: 'Asha@Vistaar.in ' },
    { _id: 'u2', email: 'ravi@vistaar.in' },
    { _id: 'u3', email: 'neha@vistaar.in' },
  ]

  it('marks remote people by work email and leaves office or blank unset', () => {
    const { remote, report } = remoteWorkEmails(
      [
        { userId: 'u1', workMode: 'remote' },
        { userId: 'u2', workMode: 'office' },
        { userId: 'u3', workMode: '' },
      ],
      users,
    )
    expect([...remote]).toEqual(['asha@vistaar.in'])
    expect(report).toEqual([])
  })

  it('accepts other spellings, and reports what it cannot use', () => {
    const { remote, report } = remoteWorkEmails(
      [
        { userId: 'u2', workMode: 'Remote' },
        { userId: 'u3', workMode: 'hybrid' },
        { userId: 'gone', workMode: 'remote' },
      ],
      users,
    )
    expect([...remote]).toEqual(['ravi@vistaar.in'])
    expect(report).toEqual(['Employee 2: work mode "hybrid" is not office or remote, so it stays office.', 'Employee 3 is remote but has no Work login email to match, so it stays office.'])
  })
})

describe('office locations from the old Work app', () => {
  const bhopal = { _id: '65f0c0ffee0000000000aa01', name: 'Bhopal head office', address: 'Zone 2, MP Nagar, Bhopal', latitude: 23.2336, longitude: 77.4343, radius: { mobile: 100, desktop: 2500, default: 100 }, isActive: true }

  it('keeps the id, name, address, pin, both circles and active', () => {
    const { offices, report } = officesFromOld([bhopal])
    expect(offices).toEqual([{ id: '65f0c0ffee0000000000aa01', name: 'Bhopal head office', address: 'Zone 2, MP Nagar, Bhopal', lat: 23.2336, lng: 77.4343, radiusM: 100, laptopRadiusM: 2500, active: true }])
    expect(report).toEqual([])
  })

  it('reads the oldest single-number radius and keeps a paused office paused', () => {
    const { offices } = officesFromOld([{ ...bhopal, radius: 200, isActive: false }, { ...bhopal, _id: 'b2', radius: { default: 150 } }])
    expect(offices[0]).toMatchObject({ radiusM: 200, laptopRadiusM: 2500, active: false })
    expect(offices[1]).toMatchObject({ id: 'b2', radiusM: 150, laptopRadiusM: 2500, active: true })
  })

  it("moves radii outside Flowbit's 25 m to 5 km to the nearest limit, and says so", () => {
    const { offices, report } = officesFromOld([{ ...bhopal, radius: { mobile: 10, desktop: 10_000 } }, { ...bhopal, _id: 'b3', name: 'Pune', radius: { mobile: 600, desktop: 300 } }])
    expect(offices[0]).toMatchObject({ radiusM: 25, laptopRadiusM: 5000 })
    expect(offices[1]).toMatchObject({ radiusM: 600, laptopRadiusM: 600 })
    expect(report).toEqual([
      'Bhopal head office: phone circle 10 m → 25 m (Flowbit allows 25 m to 5.0 km).',
      'Bhopal head office: laptop circle 10.0 km → 5.0 km (Flowbit allows up to 5.0 km).',
      'Pune: laptop circle 300 m → 600 m (never smaller than the phone circle).',
    ])
  })

  it('skips offices without a name or a real pin, and says so', () => {
    const { offices, report } = officesFromOld([{ ...bhopal, name: ' ' }, { ...bhopal, name: 'Nowhere', latitude: 0, longitude: 0 }, { ...bhopal, name: 'Broken', latitude: 'x' }])
    expect(offices).toEqual([])
    expect(report).toEqual(['Office 1: no name, skipped.', 'Nowhere: no valid map pin, skipped. Add it again in HR settings → Offices.', 'Broken: no valid map pin, skipped. Add it again in HR settings → Offices.'])
  })

  it('keeps at most 20 offices and says so', () => {
    const many = Array.from({ length: 22 }, (_, i) => ({ ...bhopal, _id: `o${i}`, name: `Office ${i}` }))
    const { offices, report } = officesFromOld(many)
    expect(offices).toHaveLength(20)
    expect(report).toContain('22 offices: Flowbit keeps the first 20; add the others by hand or remove some old ones.')
  })
})
