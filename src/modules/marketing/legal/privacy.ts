import { LOG_RETENTION_MONTHS, OWNER_DELETE_PURGE_DAYS } from '@/lib/lifecycle'
import { COOKIES, DATA_LOCATION, providerLine, SUB_PROCESSORS } from './providers'
import type { LegalContext, LegalContent } from './types'

/*
 * DRAFT for the owner's lawyer to review before launch (platform spec 13).
 * Written with the Digital Personal Data Protection Act, 2023 in mind; confirm
 * the grievance officer, retention periods and the processor list.
 */
export function privacyContent({ legalName, supportEmail }: LegalContext): LegalContent {
  return {
    title: 'Privacy policy',
    updated: '11 Oct 2026',
    intro: `This policy explains what personal data ${legalName} ("Flowbit") handles, why, and the choices you have. It covers our website useflowbit.com and the Flowbit app. Flowbit is a brand of ${legalName}.`,
    sections: [
      { id: 'roles', heading: 'Who decides what', paragraphs: ['For data your organisation puts into its workspace (employee records, attendance, payroll, clients, invoices), your organisation decides why and how it is used, and Flowbit processes it on its behalf under our Data processing terms. For account details, billing and website enquiries, Flowbit decides and is responsible as the data fiduciary under the Digital Personal Data Protection Act, 2023.'] },
      { id: 'collect', heading: 'What we collect', list: [
        'Account details: name, email, password (stored only as a one-way hash), profile photo and preferences such as sounds.',
        'Workspace content your team adds, which may include employee details such as PAN, UAN, bank account and salary when Muster is used.',
        'Billing details: legal name, GSTIN, billing address and payment status. Card and UPI details are handled by Razorpay, not stored by us.',
        'Demo requests from our website: name, work email, company, team size, phone if given, and your message.',
        'Technical data: IP address, browser user agent and sign-in times, used for security, rate limiting and the audit log.',
      ] },
      { id: 'use', heading: 'How we use it', list: ['To run the service you signed up for and keep each workspace separate.', 'To send emails the product needs: invites, password resets, payslips, invoices and billing notices.', 'To send WhatsApp messages about your Flowbit account (sign-in codes, bills and renewal reminders) when you have given us your number and opted in. Reply STOP to stop them.', 'To keep the service secure, including the audit log of sensitive changes.', 'To reply to demo requests and support emails.'], paragraphs: ['We do not sell personal data and we do not use workspace content for advertising.'] },
      { id: 'cookies', heading: 'Cookies', paragraphs: ['Flowbit sets only its own cookies, all httpOnly. We do not use advertising cookies or third-party tracking. Your sound preference is remembered in your browser.'], list: COOKIES.map((c) => `${c.purpose}: ${c.names}.`) },
      { id: 'processors', heading: 'Service providers', paragraphs: ['We use these providers to run Flowbit, each only for its purpose. The same list is in our Data processing terms.'], list: SUB_PROCESSORS.map(providerLine) },
      { id: 'location', heading: 'Where data is stored', paragraphs: [DATA_LOCATION] },
      { id: 'retention', heading: 'How long we keep it', paragraphs: [`Workspace data is kept while the workspace exists, including during the read-only period after a trial or subscription ends. Issued invoices, HR letters and released payroll are kept as records and voided rather than deleted. When a workspace owner deletes a workspace, we keep its data for ${OWNER_DELETE_PURGE_DAYS} days in case they change their mind, then remove it, except what the law requires us to keep, such as our own invoices. Message and processing logs are kept ${LOG_RETENTION_MONTHS} months, then deleted.`] },
      { id: 'security', heading: 'Security', paragraphs: ['Every record belongs to one workspace and every request is checked against it. Passwords are hashed, sessions are stored as hashes, sensitive fields are visible only to roles with explicit permission, and sensitive changes are written to an audit log.'] },
      { id: 'rights', heading: 'Your rights', paragraphs: ['You can ask to see, correct or erase your personal data, or withdraw consent where we rely on it. If your data sits in an employer’s workspace, ask that organisation first; we will help them respond.', 'You can also nominate someone to exercise these rights for you if you are unable to.', `Write to our Grievance Officer at ${supportEmail}. We will reply within the time the law requires. If you are not satisfied, you may complain to the Data Protection Board of India.`] },
      { id: 'changes', heading: 'Changes', paragraphs: ['If we change this policy in a meaningful way we will update the date above and tell workspace owners by email.'] },
    ],
  }
}
