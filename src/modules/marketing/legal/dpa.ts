import { DELETE_AFTER_BLOCKED_DAYS, DELETION_NOTICE_DAYS, LOG_RETENTION_MONTHS, OWNER_DELETE_NOTICE_DAYS, OWNER_DELETE_PURGE_DAYS } from '@/lib/lifecycle'
import { READ_ONLY_DAYS } from '@/lib/plans'
import { DATA_LOCATION, providerLine, SUB_PROCESSORS } from './providers'
import type { LegalContext, LegalContent } from './types'

/*
 * DRAFT for the owner's lawyer to review (docs/archive/V2-RESEARCH.md §3, console spec §9).
 * Written for the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025
 * (substantive duties from 13 May 2027). Confirm hosting regions and the sub-processor list.
 */
export function dpaContent({ legalName, supportEmail }: LegalContext): LegalContent {
  return {
    title: 'Data processing terms',
    updated: '11 Oct 2026',
    intro: `These terms form part of the Terms of service between ${legalName} ("Flowbit", "we") and the organisation that owns a Flowbit workspace ("you"). They cover the personal data you put into your workspace, such as employee records, payroll, clients, leads and the people you send messages to.`,
    sections: [
      { id: 'roles', heading: 'Roles', paragraphs: ['For personal data in your workspace, you are the data fiduciary: you decide why and how it is used. Flowbit is your data processor and handles that data only to provide Flowbit to you.'] },
      { id: 'instructions', heading: 'Your instructions', paragraphs: ['We process workspace data only on your documented instructions: these terms, your settings, and the actions your members take in Flowbit. We do not use it for our own purposes, for advertising, or to train AI models.'] },
      { id: 'lawful-basis', heading: 'Your responsibilities', list: [
        'Have a lawful basis to add each person’s data and to message them (for example employment, an invoice they asked for, or their consent).',
        'Give the people whose data you add any notice the law requires.',
        'Get consent before sending greetings or promotional messages, and honour opt-outs.',
        'Keep your members’ access and roles appropriate.',
      ] },
      { id: 'staff-access', heading: 'Our staff', paragraphs: ['Our staff open a workspace only to provide support or a setup service you asked for, after the workspace owner approves it, for a limited time and with the access recorded in your audit log. Flowbit staff never see salary, bank or PAN details: they stay masked for every staff role, admins included, during support visits and setup imports alike. Everyone who can access workspace data is bound by confidentiality.'] },
      { id: 'security', heading: 'Security', paragraphs: ['We keep workspace data separate, encrypt it in transit and protect secrets such as messaging tokens at rest, check every request against the workspace, limit sensitive fields to roles with permission, and log sensitive changes.'] },
      { id: 'sub-processors', heading: 'Sub-processors', paragraphs: ['We use these providers, each only for its purpose. We will tell workspace owners by email at least 15 days before adding a new one, and you may object.'], list: SUB_PROCESSORS.map(providerLine) },
      { id: 'breach', heading: 'Personal data breaches', paragraphs: ['If we become aware of a breach affecting your workspace data, we will tell the workspace owner without undue delay, and aim to do so within 24 hours, with what we know and what we are doing. This lets you inform the Data Protection Board and the people affected within the times the law sets.'] },
      { id: 'assistance', heading: 'Helping you respond', paragraphs: ['Flowbit gives you tools to export, correct and delete records and contacts. Where a request needs more, we will help you answer people exercising their rights and with any assessment the law requires.'] },
      { id: 'retention', heading: 'Retention and deletion', paragraphs: [
        `When a subscription or free period ends without payment, the workspace stays read-only for ${READ_ONLY_DAYS} days so you can export, then it is blocked. Unless you pay, we delete workspace data ${DELETE_AFTER_BLOCKED_DAYS} days after it is blocked, with notice to the owner ${DELETION_NOTICE_DAYS.join(', ').replace(/, (\d+)$/, ' and $1')} days before.`,
        `When the owner deletes the workspace, we keep its data for ${OWNER_DELETE_PURGE_DAYS} days in case they change their mind, remind them ${OWNER_DELETE_NOTICE_DAYS} days before, then delete it.`,
        `We keep message and processing logs for ${LOG_RETENTION_MONTHS} months (at least the year the law asks for), then delete them. Security audit records of a deleted workspace are kept with personal details removed. We also keep what the law requires us to keep, such as our own invoices to you.`,
      ] },
      { id: 'location', heading: 'Where data is stored', paragraphs: [`${DATA_LOCATION} Any restriction the Government of India notifies applies.`] },
      { id: 'contact', heading: 'Contact', paragraphs: [`Write to our Grievance Officer at ${supportEmail} for anything about these terms.`] },
    ],
  }
}
