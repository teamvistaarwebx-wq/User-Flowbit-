/**
 * An RFC 2822 message for the Gmail API (`users.messages.send` with `raw`).
 * Gmail fills in From with the connected account. Pure.
 */

export type MimeInput = Readonly<{ to: string; subject: string; html: string; text: string; headers: Readonly<Record<string, string>>; boundary?: string }>

/** Header values never carry a line break (header injection). */
const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()

/** RFC 2047 encoded word when the subject is not plain ASCII. */
const encodeSubject = (subject: string) => (/^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`)

export function buildMime(input: MimeInput): string {
  const boundary = input.boundary ?? `fb-${Math.random().toString(36).slice(2)}`
  const head = [
    `To: ${clean(input.to)}`,
    `Subject: ${encodeSubject(clean(input.subject))}`,
    'MIME-Version: 1.0',
    ...Object.entries(input.headers).map(([k, v]) => `${clean(k)}: ${clean(v)}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const part = (type: string, content: string) => [`--${boundary}`, `Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(content, 'utf8').toString('base64')].join('\r\n')
  return [...head, '', part('text/plain', input.text), part('text/html', input.html), `--${boundary}--`, ''].join('\r\n')
}
