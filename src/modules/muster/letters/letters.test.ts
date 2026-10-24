import { describe, expect, test } from 'vitest'
import { BODIES } from './bodies'
import { LETTERS, LETTERS_BY_CODE, isLetterApplicable, suggestedLetters } from './catalogue'
import { buildVariables, defaultLetterEmail, describeDuration, inputProblems, inputVariables, missingPlaceholders, placeholderReference, placeholdersIn, renderTemplate, statesPay } from './render'

describe('renderTemplate', () => {
  test('substitutes what it is given', () => {
    expect(renderTemplate('This certifies that {{employee.name}} worked as {{employee.designation}}.', { 'employee.name': 'Kabir Sethi', 'employee.designation': 'Production Assistant' })).toBe(
      'This certifies that Kabir Sethi worked as Production Assistant.',
    )
  })

  test('leaves an unknown placeholder visible so the gap is obvious', () => {
    expect(renderTemplate('Signed by {{signatory.nmae}}', {})).toBe('Signed by {{signatory.nmae}}')
  })

  test('drops a paragraph whose only content was empty', () => {
    expect(renderTemplate('Opening line.\n\n{{comments.hr}}\n\nClosing line.', { 'comments.hr': '' })).toBe('Opening line.\n\nClosing line.')
  })

  test('drops the heading that introduced an empty paragraph', () => {
    expect(renderTemplate('Intro.\n\nPerformance:\n\n{{comments.performance}}\n\nRegards.', { 'comments.performance': '   ' })).toBe('Intro.\n\nRegards.')
  })

  test('keeps the heading when there is something to say', () => {
    expect(renderTemplate('Intro.\n\nPerformance:\n\n{{comments.performance}}', { 'comments.performance': 'Reliable throughout.' })).toBe('Intro.\n\nPerformance:\n\nReliable throughout.')
  })
})

describe('placeholders', () => {
  test('lists each placeholder once, in order', () => {
    expect(placeholdersIn('{{a.one}} then {{b.two}} then {{a.one}}')).toEqual(['a.one', 'b.two'])
  })
  test('reports the ones with nothing to fill them', () => {
    expect(missingPlaceholders('{{a}} {{b}}', { a: 'filled', b: '' })).toEqual(['b'])
  })
  test('hides the salary group from readers without payroll access', () => {
    expect(placeholderReference(false).some((g) => g.group === 'Salary')).toBe(false)
    expect(placeholderReference(true).some((g) => g.group === 'Salary')).toBe(true)
  })
})

describe('catalogue', () => {
  test('ships twenty letters, each with wording', () => {
    expect(LETTERS).toHaveLength(20)
    for (const letter of LETTERS) expect(BODIES[letter.code], letter.code).toBeDefined()
  })

  test('suggests closing documents to a working intern, never to others', () => {
    const forIntern = suggestedLetters('active', 'intern').map((l) => l.code)
    expect(forIntern).toContain('internship_certificate')
    expect(suggestedLetters('active', 'full_time').some((l) => l.internsOnly)).toBe(false)
    expect(isLetterApplicable(LETTERS_BY_CODE.get('internship_offer')!, 'active', 'full_time')).toBe(false)
  })

  test('marks letters that state pay', () => {
    expect(statesPay(LETTERS_BY_CODE.get('salary_revision'), BODIES.salary_revision)).toBe(true)
    expect(statesPay(LETTERS_BY_CODE.get('employee_offer'), BODIES.employee_offer)).toBe(true)
    expect(statesPay(LETTERS_BY_CODE.get('experience'), BODIES.experience)).toBe(false)
  })
})

describe('variables', () => {
  const source = {
    employee: { fullName: 'Aditi Singh', code: 'VW-0007', workEmail: 'aditi@vistaar.test', designation: 'Designer', department: 'Design', manager: 'Arjun Nair', joinDate: '2025-04-01', exitDate: '2026-09-30', employmentType: 'full_time', employmentTypeLabel: 'Full time', statusLabel: 'Exited', workLocation: 'Indore' },
    company: { name: 'Vistaar WebX', address: 'Indore' },
    letter: { reference: 'VW/HR/2026/0001', issueDate: '2026-10-01', signatoryName: 'Neha Verma', signatoryDesignation: 'HR Manager' },
    salary: null,
    inputs: { workUndertaken: 'Brand identity work', revisedCtc: '600000', effectiveDate: '2026-10-01' },
    today: '2026-10-01',
  }

  test('formats dates and pay inputs, and leaves salary out without payroll access', () => {
    const vars = buildVariables(source, LETTERS_BY_CODE.get('salary_revision'))
    expect(vars['employee.dateOfJoining']).toBe('1 Apr 2025')
    expect(vars['input.effectiveDate']).toBe('1 Oct 2026')
    expect(vars['input.revisedCtc']).toBe('6,00,000.00')
    expect(vars['salary.ctcAnnual']).toBeUndefined()
    expect(vars['employee.duration']).toBe('1 year 5 months')
  })

  test('describes short spans in days', () => {
    expect(describeDuration('2026-09-01', '2026-09-20')).toBe('19 days')
  })

  test('checks required, date and number inputs', () => {
    const problems = inputProblems(LETTERS_BY_CODE.get('salary_revision')!, { effectiveDate: '2026-13-45', revisedCtc: '1e5' })
    expect(problems['inputs.effectiveDate']).toBe('Use a real date')
    expect(problems['inputs.revisedCtc']).toMatch(/plain digits/)
    expect(inputProblems(LETTERS_BY_CODE.get('experience')!, {})['inputs.workUndertaken']).toMatch(/required/)
  })
})

describe('inputVariables', () => {
  const experience = LETTERS_BY_CODE.get('experience')

  test('keeps the placeholder of an empty required field, and drops an empty optional one', () => {
    const vars = inputVariables({ workUndertaken: '', hrComments: '' }, experience)
    expect(vars['work.undertaken']).toBeUndefined()
    expect(vars['input.workUndertaken']).toBeUndefined()
    expect(vars['comments.hr']).toBe('')
    const body = renderTemplate('Work:\n\n{{work.undertaken}}\n\nNotes:\n\n{{comments.hr}}', vars)
    expect(body).toBe('Work:\n\n{{work.undertaken}}')
  })

  test('fills them once typed, so re-rendering does not duplicate or lose text', () => {
    const template = 'Dear {{employee.name}},\n\n{{work.undertaken}}'
    const once = renderTemplate(template, { 'employee.name': 'Aditi', ...inputVariables({ workUndertaken: 'Brand identity' }, experience) })
    const again = renderTemplate(template, { 'employee.name': 'Aditi', ...inputVariables({ workUndertaken: 'Brand identity and website' }, experience) })
    expect(once).toBe('Dear Aditi,\n\nBrand identity')
    expect(again).toBe('Dear Aditi,\n\nBrand identity and website')
  })
})

describe('letter email', () => {
  test('drafts a subject and body naming the letter and its reference', () => {
    const mail = defaultLetterEmail({ templateName: 'Experience Letter', category: 'exit', reference: 'VW/HR/2026/0004', issueDate: '2026-10-01', employeeName: 'Aditi Singh', orgName: 'Vistaar WebX', signatoryName: 'Neha Verma', signatoryDesignation: 'HR Manager' })
    expect(mail.subject).toBe('Experience Letter from Vistaar WebX (VW/HR/2026/0004)')
    expect(mail.body).toContain('Dear Aditi,')
    expect(mail.body).toContain('dated 1 Oct 2026')
    expect(mail.body.endsWith('Neha Verma\nHR Manager, Vistaar WebX')).toBe(true)
    expect(mail.body).toContain('My letters')
  })

  test('does not point people without a login to My letters', () => {
    const mail = defaultLetterEmail({ templateName: 'Experience Letter', category: 'exit', reference: 'VW/HR/2026/0004', issueDate: '2026-10-01', employeeName: 'Manish Yadav', orgName: 'Vistaar WebX', signatoryName: 'Neha Verma', signatoryDesignation: 'HR Manager', hasLogin: false })
    expect(mail.body).not.toContain('My letters')
  })
})
