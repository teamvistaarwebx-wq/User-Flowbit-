import { describe, expect, it } from 'vitest'
import { excerpt, parseTopics, rewriteHtml, searchTopics, toPlainText } from './parse'

const html = `<section class="chapter c-work" id="work">
  <article class="topic" id="work-tasks"><h3>Tasks &amp; lists</h3><p>Create a task with <span class="ui">New task</span>.</p><img src="shots/work-tasks.jpg"></article>
  <article class="topic" id="work-time"><h3>Time</h3><p>See <a href="#muster-payroll">Payroll</a> and <a href="#work-tasks">Tasks</a>.</p></article>
</section>`

describe('manual parsing', () => {
  it('reads topics with their titles and plain text', () => {
    expect(parseTopics(html)).toEqual([
      { id: 'work-tasks', title: 'Tasks & lists', text: 'Create a task with New task .' },
      { id: 'work-time', title: 'Time', text: 'See Payroll and Tasks .' },
    ])
    expect(toPlainText('<b>a</b>&lt;b&gt; &nbsp;c')).toBe('a <b> c')
  })

  it('points screenshots at /manual-img and cross-chapter links at their page', () => {
    const out = rewriteHtml(html, 'work', new Map([['muster-payroll', 'payroll'], ['work-tasks', 'work']]))
    expect(out).toContain('src="/manual-img/work-tasks.jpg"')
    expect(out).toContain('href="/manual/payroll#muster-payroll"')
    expect(out).toContain('href="#work-tasks"')
  })

  it('offers a 720 px copy of each screenshot to phones (R2 16.4)', () => {
    // Arrange, Act
    const out = rewriteHtml(html, 'work', new Map())

    // Assert
    expect(out).toContain('srcset="/manual-img/720/work-tasks.jpg 720w, /manual-img/work-tasks.jpg 1440w"')
    expect(out).toContain('sizes="(max-width: 768px) 100vw, 900px"')
  })

  it('finds topics containing every word, title matches first', () => {
    const items = [{ title: 'Leave', text: 'apply for leave and see payslip notes' }, { title: 'Payslips', text: 'download your payslip' }, { title: 'Other', text: 'nothing' }]
    expect(searchTopics(items, 'payslip').map((i) => i.title)).toEqual(['Payslips', 'Leave'])
    expect(searchTopics(items, 'payslip leave').map((i) => i.title)).toEqual(['Leave'])
    expect(searchTopics(items, 'a')).toEqual([])
    expect(excerpt('x'.repeat(300) + ' payslip ready', 'payslip')).toMatch(/^….*payslip ready$/)
  })
})
