import { describe, expect, it } from 'vitest'
import { sequenceSchema } from './schemas'

const email = { kind: 'email', subject: 'Hi {{first_name}}', body: 'Hello from {{owner}}' }

describe('sequence builder schema', () => {
  it('accepts up to five steps with a send window', () => {
    const out = sequenceSchema.safeParse({ name: 'Cold', steps: [email, { kind: 'wait', waitDays: '2' }, { kind: 'call' }], startHour: '10', endHour: '18' })
    expect(out.success).toBe(true)
    expect(out.data?.dailyCap).toBe(150)
    expect(sequenceSchema.safeParse({ name: 'Too long', steps: Array(6).fill(email) }).success).toBe(false)
  })

  it('needs a subject and body on emails, and only known variables', () => {
    const missing = sequenceSchema.safeParse({ name: 'x', steps: [{ kind: 'email' }] })
    expect(missing.error?.issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['steps.0.subject', 'steps.0.body']))
    const unknown = sequenceSchema.safeParse({ name: 'x', steps: [{ ...email, body: 'Hi {{city}}' }] })
    expect(unknown.error?.issues[0].message).toContain('{{city}}')
  })

  it('refuses a window that ends before it starts, and a sequence of waits only', () => {
    expect(sequenceSchema.safeParse({ name: 'x', steps: [email], startHour: 18, endHour: 10 }).success).toBe(false)
    expect(sequenceSchema.safeParse({ name: 'x', steps: [{ kind: 'wait', waitDays: 1 }] }).success).toBe(false)
  })
})
