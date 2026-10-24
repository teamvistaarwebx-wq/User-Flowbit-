import 'server-only'
import { appUrl } from '@/lib/env'
import { emailLayout, escapeHtml } from '@/lib/mail'
import { briefHeadline, type BuiltSection } from './schedule'

/** A brief as a branded email: one block per section, every line linking to its item. */

export const BRIEFS_HREF = '/app/settings/profile/briefs'

const absolute = (href: string) => (href.startsWith('http') ? href : appUrl(href))

function sectionHtml(section: BuiltSection): string {
  const heading = `<h2 style="margin:22px 0 8px;color:#EAC1DC;font-size:13px;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(section.title)}</h2>`
  if (!section.lines.length) return `${heading}<p style="margin:0;color:#7E768C;font-size:13px">Nothing here today.</p>`
  const rows = section.lines
    .map((l) => {
      const text = l.href ? `<a href="${escapeHtml(absolute(l.href))}" style="color:#F4F1F8;text-decoration:none">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)
      const meta = l.meta ? ` <span style="color:#9A93A6;font-size:12px">· ${escapeHtml(l.meta)}</span>` : ''
      return `<li style="margin:0 0 8px;color:#F4F1F8;font-size:14px;line-height:21px">${text}${meta}</li>`
    })
    .join('')
  return `${heading}<ul style="margin:0;padding:0 0 0 18px">${rows}</ul>`
}

function sectionText(section: BuiltSection): string[] {
  const lines = section.lines.length ? section.lines.map((l) => `- ${l.text}${l.meta ? ` (${l.meta})` : ''}${l.href ? ` ${absolute(l.href)}` : ''}`) : ['- Nothing here today.']
  return [section.title.toUpperCase(), ...lines, '']
}

export type BriefMail = Readonly<{ name: string; dateLabel: string; orgName: string; firstName: string; greeting: string; sections: readonly BuiltSection[]; unsubscribeUrl?: string; preview?: boolean }>

export function briefEmail(input: BriefMail): { subject: string; html: string; text: string; headline: string } {
  const headline = briefHeadline(input.sections)
  const subject = `${input.preview ? 'Preview: ' : ''}${input.name} · ${input.dateLabel}`
  const layout = emailLayout({
    title: `${input.name}, ${input.dateLabel}`,
    paragraphs: [`${input.greeting}, ${input.firstName}. ${headline}`],
    extraHtml: input.sections.map(sectionHtml).join(''),
    extraText: input.sections.flatMap(sectionText),
    cta: { label: 'Open Flowbit', href: '/app' },
    workspace: input.orgName,
    preheader: headline,
    footer: input.preview ? 'This is a preview you asked for. Your scheduled brief is unchanged.' : `Your brief from ${input.orgName}. Change its time, sections or channels in Profile → Briefs.`,
    settingsHref: BRIEFS_HREF,
    unsubscribeUrl: input.unsubscribeUrl,
  })
  return { subject, headline, ...layout }
}
