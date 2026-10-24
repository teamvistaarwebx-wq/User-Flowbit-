import 'server-only'
import { appUrl } from '@/lib/env'
import { emailLayout, escapeHtml, type EmailButton } from '@/lib/mail'
import { groupByKey } from './events'

/**
 * Branded alert and digest emails. Every email links back to the item and
 * carries the person's notification settings link and, as non-essential
 * mail, an unsubscribe link.
 */

export const PERSONAL_SETTINGS_HREF = '/app/settings/profile/notifications'

const CTA_LABEL: Readonly<Record<string, string>> = {
  task_assigned: 'Open task',
  mentions: 'Open',
  task_blocked: 'Open task',
  task_due: 'Open task',
  task_updates: 'Open task',
  comments: 'Open',
  approvals: 'Review',
  decisions: 'View',
  meetings: 'Open meeting',
  followups: 'Open follow-up',
}

export type AlertContent = Readonly<{ title: string; body?: string; href?: string; group: string; paragraphs?: readonly string[]; buttons?: readonly EmailButton[] }>

export type MailContext = Readonly<{ orgName: string; recipientName?: string; unsubscribeUrl?: string }>

const absolute = (href: string) => (href.startsWith('http') ? href : appUrl(href))

/** One alert as an email: the alert's title as subject and heading, its body, and a button back to the item. */
export function alertEmail(alert: AlertContent, ctx: MailContext): { subject: string; html: string; text: string } {
  const group = groupByKey(alert.group)
  const paragraphs = [...(alert.body ? [alert.body] : []), ...(alert.paragraphs ?? [])]
  const layout = emailLayout({
    title: alert.title,
    paragraphs,
    cta: alert.href ? { label: alert.buttons?.length ? 'Open in Flowbit' : (CTA_LABEL[group.key] ?? 'Open in Flowbit'), href: alert.href } : undefined,
    buttons: alert.buttons,
    workspace: ctx.orgName,
    preheader: alert.body ?? `${group.label} in ${ctx.orgName}`,
    footer: `You get this email for "${group.label}" in ${ctx.orgName}. Change what you get, or pause alerts, in your notification settings.`,
    settingsHref: PERSONAL_SETTINGS_HREF,
    unsubscribeUrl: ctx.unsubscribeUrl,
  })
  return { subject: alert.title, ...layout }
}

export type DigestItem = Readonly<{ title: string; body?: string; href?: string; group: string; at: Date }>

const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** Several held alerts in one email, grouped by event group in the order they happened. */
export function digestEmail(items: readonly DigestItem[], ctx: MailContext): { subject: string; html: string; text: string } {
  const groups = [...new Set(items.map((i) => i.group))]
  const sections = groups.map((key) => ({ label: groupByKey(key).label, items: items.filter((i) => i.group === key) }))
  const row = (i: DigestItem) => {
    const title = i.href ? `<a href="${escapeHtml(absolute(i.href))}" style="color:#F4F1F8;text-decoration:none">${escapeHtml(i.title)}</a>` : escapeHtml(i.title)
    const body = i.body ? `<div style="color:#9A93A6;font-size:13px;line-height:19px">${escapeHtml(i.body)}</div>` : ''
    return `<li style="margin:0 0 10px;color:#F4F1F8;font-size:14px;line-height:21px">${title} <span style="color:#7E768C;font-size:12px">${TIME.format(i.at)}</span>${body}</li>`
  }
  const extraHtml = sections
    .map((s) => `<h2 style="margin:20px 0 8px;color:#EAC1DC;font-size:13px;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(s.label)}</h2><ul style="margin:0;padding:0 0 0 18px">${s.items.map(row).join('')}</ul>`)
    .join('')
  const extraText = sections.flatMap((s) => [s.label.toUpperCase(), ...s.items.map((i) => `- ${i.title}${i.href ? ` (${absolute(i.href)})` : ''}`), ''])
  const count = items.length
  const title = `${count} update${count === 1 ? '' : 's'} in ${ctx.orgName}`
  const layout = emailLayout({
    title,
    paragraphs: ['Here is what happened while your alerts were batched.'],
    extraHtml,
    extraText,
    cta: { label: 'Open Flowbit', href: '/app/notifications' },
    workspace: ctx.orgName,
    preheader: items.slice(0, 2).map((i) => i.title).join(' · '),
    footer: `A digest of your alerts in ${ctx.orgName}. Choose hourly, end-of-day or one email per alert in your notification settings.`,
    settingsHref: PERSONAL_SETTINGS_HREF,
    unsubscribeUrl: ctx.unsubscribeUrl,
  })
  return { subject: title, ...layout }
}
