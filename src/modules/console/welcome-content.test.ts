import { describe, expect, it } from 'vitest'
import { welcomeContent } from './welcome-content'

describe('Day 0 welcome email', () => {
  it('tells a Free workspace its seat limit and end date', () => {
    const mail = welcomeContent({ name: 'Asha Rao', workspace: 'Acme', accountType: 'free', endsAt: new Date('2027-04-08T06:00:00Z') })
    expect(mail.subject).toBe('Welcome to Flowbit, Asha')
    expect(mail.paragraphs[0]).toBe('Acme is on the Free plan: every Flowbit product for up to 5 people, free until 8 April 2027.')
    expect(mail.cta.href).toBe('/app')
  })

  it('tells a trial workspace its 15 days', () => {
    const mail = welcomeContent({ name: '', workspace: 'Big Co', accountType: 'trial', endsAt: new Date('2026-10-23T06:00:00Z') })
    expect(mail.title).toBe('Welcome to Flowbit, there')
    expect(mail.paragraphs[0]).toBe('Big Co has a 15-day trial of every Flowbit product for your whole team, until 23 October 2026.')
  })
})
