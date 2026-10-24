import { describe, expect, it } from 'vitest'
import { projectNotes, notesRoleCanOpen } from './seed'

describe('seeded project notifications', () => {
  const projects = [
    { _id: 'p1', name: 'Revamp', leadId: 'm1', memberIds: ['m1', 'm2'] },
    { _id: 'p2', name: 'Retainer', leadId: 'm3', memberIds: ['m3'] },
    { _id: 'p3', name: 'Led only', leadId: 'm2', memberIds: null },
  ]

  it('tells only the lead and members they were added (no bell link to a 404)', () => {
    expect(projectNotes(projects, 'm2').map((n) => n.href)).toEqual(['/app/work/projects/p1', '/app/work/projects/p3'])
    expect(projectNotes(projects, 'm3').map((n) => n.title)).toEqual(['You were added to Retainer'])
  })

  it('gives an outsider no project notification', () => {
    expect(projectNotes(projects, 'm9')).toEqual([])
  })
})

describe('seeded payroll notifications', () => {
  const notes = [
    { title: 'September payroll released', href: '/app/hr/payroll/c1', kind: 'success', event: 'payroll.released' },
    { title: 'New expense claim submitted', href: '/app/hr/claims', kind: 'approval', event: 'claim.submitted' },
  ]

  it('gives a role without payroll access no bell link to a payroll month (HR executive, D3)', () => {
    expect(notesRoleCanOpen('hr_exec', notes).map((n) => n.href)).toEqual(['/app/hr/claims'])
  })

  it('keeps the payroll link for roles that can open payroll', () => {
    expect(notesRoleCanOpen('hr_admin', notes)).toHaveLength(2)
    expect(notesRoleCanOpen('finance', notes)).toHaveLength(2)
  })
})
