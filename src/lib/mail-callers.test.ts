import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * V2-REVIEW R2: hand-sent mail (documents, statements, payslips, letters)
 * shows a failure to the user, who sends again. The v2 queue would also retry
 * it, so the customer got the email twice. These callers must opt out.
 */
const HAND_SENT = ['src/modules/folio/mail.ts', 'src/modules/folio/collections/statement-actions.ts', 'src/modules/muster/payroll/payslips.ts', 'src/modules/muster/letters/actions.ts', 'src/modules/folio/collections/reminders.ts']

function sendMailCalls(source: string): string[] {
  const calls: string[] = []
  let from = source.indexOf('sendMail({')
  while (from >= 0) {
    let depth = 0
    let end = from + 'sendMail('.length
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++
      if (source[end] === '}' && --depth === 0) break
    }
    calls.push(source.slice(from, end + 1))
    from = source.indexOf('sendMail({', end)
  }
  return calls
}

describe('hand-sent mail is not retried by the queue', () => {
  it.each(HAND_SENT)('%s passes retry: false', (file) => {
    const calls = sendMailCalls(readFileSync(join(process.cwd(), file), 'utf8'))
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call).toMatch(/retry: false/)
  })
})
