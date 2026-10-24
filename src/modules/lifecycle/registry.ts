import type { Model } from 'mongoose'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AuditLog } from '@/models/AuditLog'
import { Client } from '@/models/Client'
import { Counter } from '@/models/Counter'
import { Invite } from '@/models/Invite'
import { Member } from '@/models/Member'
import { Notification } from '@/models/Notification'
import { Outbox } from '@/models/Outbox'
import { Role } from '@/models/Role'
import { StoredFile } from '@/models/StoredFile'
import { UsageEvent } from '@/models/console/UsageEvent'
import { ConsoleAccount } from '@/models/console/ConsoleAccount'
import { StaffAlert } from '@/models/console/StaffAlert'
import { FlowbitCreditNote } from '@/models/billing/FlowbitCreditNote'
import { OfflinePayment } from '@/models/billing/OfflinePayment'
import { SupportAccess } from '@/models/console/SupportAccess'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { FolioBillingPlan } from '@/models/folio/BillingPlan'
import { FolioBillingProfile } from '@/models/folio/BillingProfile'
import { CreditNote } from '@/models/folio/CreditNote'
import { DocEvent } from '@/models/folio/DocEvent'
import { DocLink } from '@/models/folio/DocLink'
import { FolioEntity } from '@/models/folio/Entity'
import { FolioExpense } from '@/models/folio/Expense'
import { BankStatement } from '@/models/folio/BankStatement'
import { BankTxn } from '@/models/folio/BankTxn'
import { PortalContact } from '@/models/portal/PortalContact'
import { MeetingTranscript } from '@/models/work/MeetingTranscript'
import { MeetingAiUsage } from '@/models/work/MeetingAiUsage'
import { PortalCode } from '@/models/portal/PortalCode'
import { PortalSession } from '@/models/portal/PortalSession'
import { FolioExpenseCategory } from '@/models/folio/ExpenseCategory'
import { FolioSettings } from '@/models/folio/FolioSettings'
import { EInvoice } from '@/models/folio/EInvoice'
import { EInvoiceSettings } from '@/models/folio/EInvoiceSettings'
import { FolioFollowup } from '@/models/folio/Followup'
import { Invoice } from '@/models/folio/Invoice'
import { FolioMessage } from '@/models/folio/MessageLog'
import { Quote } from '@/models/folio/Quote'
import { FolioReceipt } from '@/models/folio/Receipt'
import { FolioRetainer } from '@/models/folio/Retainer'
import { FolioServiceItem } from '@/models/folio/ServiceItem'
import { Brief } from '@/models/messaging/Brief'
import { ConsentLog } from '@/models/messaging/ConsentLog'
import { Message } from '@/models/messaging/Message'
import { NotificationPrefs } from '@/models/messaging/NotificationPrefs'
import { NotificationSettings } from '@/models/messaging/NotificationSettings'
import { Suppression } from '@/models/messaging/Suppression'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { AttendancePeriod } from '@/models/muster/AttendancePeriod'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { CompOff } from '@/models/muster/CompOff'
import { Department } from '@/models/muster/Department'
import { Designation } from '@/models/muster/Designation'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { EmployeeRemark } from '@/models/muster/EmployeeRemark'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveBalance } from '@/models/muster/LeaveBalance'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { LeaveType } from '@/models/muster/LeaveType'
import { Letter } from '@/models/muster/Letter'
import { LetterTemplate } from '@/models/muster/LetterTemplate'
import { Nominee } from '@/models/muster/Nominee'
import { OtpChallenge } from '@/models/muster/OtpChallenge'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import { TaxYearSettings } from '@/models/muster/TaxYearSettings'
import { TdsOverride } from '@/models/muster/TdsOverride'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { MusterPolicy, PolicyDocument } from '@/models/muster/Policy'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { StatutoryVersion } from '@/models/muster/StatutoryVersion'
import { Activity } from '@/models/orbit/Activity'
import { PaymentEvent } from '@/models/payments/PaymentEvent'
import { PaymentGateway } from '@/models/payments/PaymentGateway'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { OrbitSettings } from '@/models/orbit/OrbitSettings'
import { LeadCapture } from '@/models/orbit/LeadCapture'
import { ComplianceSettings } from '@/models/compliance/ComplianceSettings'
import { StageEvent } from '@/models/orbit/StageEvent'
import { BillingEvent } from '@/models/subscription/BillingEvent'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { ArcRun } from '@/models/work/ArcRun'
import { AiUsage } from '@/models/work/AiUsage'
import { GoogleConnection } from '@/models/integrations/GoogleConnection'
import { McpIdempotency } from '@/models/mcp/McpIdempotency'
import { WebhookDelivery } from '@/models/integrations/WebhookDelivery'
import { WebhookEndpoint } from '@/models/integrations/WebhookEndpoint'
import { SlackInstall } from '@/models/integrations/SlackInstall'
import { CustomDomain } from '@/models/integrations/CustomDomain'
import { McpPlan } from '@/models/mcp/McpPlan'
import { McpSettings } from '@/models/mcp/McpSettings'
import { OAuthCode } from '@/models/mcp/OAuthCode'
import { OAuthGrant } from '@/models/mcp/OAuthGrant'
import { OAuthRefreshToken } from '@/models/mcp/OAuthRefreshToken'
import { InboundReplay } from '@/models/integrations/InboundReplay'
import { Sequence } from '@/models/orbit/Sequence'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { SequenceSendCount } from '@/models/orbit/SequenceSendCount'
import { Folder } from '@/models/work/Folder'
import { Meeting } from '@/models/work/Meeting'
import { Milestone } from '@/models/work/Milestone'
import { Post } from '@/models/work/Post'
import { PostReply } from '@/models/work/PostReply'
import { Project } from '@/models/work/Project'
import { SavedView } from '@/models/work/SavedView'
import { Space } from '@/models/work/Space'
import { Task } from '@/models/work/Task'
import { TaskActivity } from '@/models/work/TaskActivity'
import { TaskComment } from '@/models/work/TaskComment'
import { Team } from '@/models/work/Team'
import { TimeEntry } from '@/models/work/TimeEntry'
import { Timesheet } from '@/models/work/Timesheet'
import { Whiteboard } from '@/models/work/Whiteboard'
import { Wallet } from '@/models/wallet/Wallet'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import { WaConnection } from '@/models/whatsapp/WaConnection'
import { WaThread } from '@/models/whatsapp/WaThread'
import { WaThreadMessage } from '@/models/whatsapp/WaThreadMessage'
import { WaBotSession } from '@/models/whatsapp/WaBotSession'
import { ActionToken } from '@/models/messaging/ActionToken'
import { PayslipLink } from '@/models/muster/PayslipLink'

/**
 * Every collection that holds a workspace's data (`orgId`), and what the
 * lifecycle does with it (console spec 4.3): the workspace export reads the
 * `exported` ones, the deletion job applies `purge`. registry.test.ts fails
 * when a model file is added under src/models without an entry here (or in
 * GLOBAL_MODELS), so new data can never be missed by export or deletion.
 *
 * purge:
 *  - delete     hard-deleted with the workspace
 *  - log        kept 1 year after deletion with personal data removed; older rows deleted
 *  - anonymise  kept (Flowbit's own records) with personal data removed
 *  - keep       kept as is (Flowbit's GST invoices: the law requires 6 years)
 */

export type PurgeAction = 'delete' | 'log' | 'anonymise' | 'keep'
export type ExportModule = 'workspace' | 'work' | 'muster' | 'orbit' | 'folio' | 'messages' | 'billing'
/** Field changes that strip personal data from a kept row. */
export type Anonymise = { set: Readonly<Record<string, unknown>>; unset: readonly string[] }

export type TenantCollection = {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>
  module: ExportModule
  purge: PurgeAction
  /** Part of the workspace export. Off for counters, one-time codes and Flowbit's own telemetry. */
  exported: boolean
  anonymise?: Anonymise
  /** Fields left out of the export (bulky copies of what the workspace already has, V2-REVIEW T3). */
  exportOmit?: readonly string[]
}

const REMOVED = '[removed]'

const AUDIT_ANON: Anonymise = { set: { actorName: 'Deleted workspace member', summary: REMOVED }, unset: ['actorId', 'actorMemberId', 'meta', 'ip', 'userAgent'] }
const MESSAGE_ANON: Anonymise = {
  set: { to: [REMOVED], subject: REMOVED },
  unset: ['cc', 'userId', 'memberId', 'contactId', 'html', 'text', 'title', 'body', 'href', 'params', 'attachments', 'headers', 'error', 'entityId', 'fallback'],
}
const BILLING_EVENT_ANON: Anonymise = { set: {}, unset: ['payload'] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const c = (model: Model<any>, module: ExportModule, purge: PurgeAction = 'delete', exported = true, anonymise?: Anonymise, exportOmit?: readonly string[]): TenantCollection => ({ name: model.modelName, model, module, purge, exported, anonymise, ...(exportOmit ? { exportOmit } : {}) })

export const TENANT_COLLECTIONS: readonly TenantCollection[] = [
  // Workspace core
  c(Member, 'workspace'),
  c(Role, 'workspace'),
  c(Invite, 'workspace'),
  c(Client, 'workspace'),
  c(StoredFile, 'workspace'),
  c(Notification, 'workspace'),
  c(Counter, 'workspace', 'delete', false),
  c(UsageEvent, 'workspace', 'delete', false),
  c(AuditLog, 'workspace', 'log', true, AUDIT_ANON),
  c(ImportBatch, 'workspace'),
  c(SupportAccess, 'workspace'),
  // Sealed Google refresh tokens: never exported, deleted with the workspace.
  c(GoogleConnection, 'workspace', 'delete', false),
  // AI apps (MCP): hashed tokens and codes, plans and idempotency keys. Never exported.
  c(OAuthGrant, 'workspace', 'delete', false),
  c(OAuthCode, 'workspace', 'delete', false),
  c(OAuthRefreshToken, 'workspace', 'delete', false),
  c(McpPlan, 'workspace', 'delete', false),
  c(McpIdempotency, 'workspace', 'delete', false),
  c(InboundReplay, 'workspace', 'delete', false),
  c(McpSettings, 'workspace'),
  // Outbound webhooks: sealed secrets are never exported; the delivery log is kept 30 days.
  c(WebhookEndpoint, 'workspace', 'delete', false),
  c(WebhookDelivery, 'workspace', 'delete', false),
  // The Slack install: a sealed bot token, never exported.
  c(SlackInstall, 'workspace', 'delete', false),
  c(CustomDomain, 'workspace', 'delete', false),
  c(ComplianceSettings, 'workspace'),
  // Client portal: contacts are exported; codes and sessions (hashes) never are.
  c(PortalContact, 'workspace'),
  c(PortalCode, 'workspace', 'delete', false),
  c(PortalSession, 'workspace', 'delete', false),
  // Flowbit's Console notes about the workspace: never exported, deleted with it.
  c(ConsoleAccount, 'workspace', 'delete', false),
  c(StaffAlert, 'workspace', 'delete', false),
  // Messages
  // Rendered bodies are left out of the export: they can be megabytes each, and the log keeps subject, status and timeline.
  c(Message, 'messages', 'log', true, MESSAGE_ANON, ['html', 'text']),
  c(Outbox, 'messages', 'delete', false),
  c(Brief, 'messages'),
  c(ConsentLog, 'messages'),
  c(NotificationPrefs, 'messages'),
  c(NotificationSettings, 'messages'),
  c(Suppression, 'messages'),
  c(Automation, 'messages'),
  // WhatsApp B: sealed keys never exported; the inbox is the workspace's data.
  c(WaConnection, 'messages', 'delete', false),
  c(WaThread, 'messages'),
  c(WaThreadMessage, 'messages'),
  c(AutomationRun, 'messages'),
  // One-time links and bot conversations: short-lived keys, never exported.
  c(ActionToken, 'messages', 'delete', false),
  c(WaBotSession, 'messages', 'delete', false),
  c(PayslipLink, 'muster', 'delete', false),
  // Work
  c(Space, 'work'),
  c(Folder, 'work'),
  c(Project, 'work'),
  c(Milestone, 'work'),
  c(Task, 'work'),
  c(TaskActivity, 'work'),
  c(TaskComment, 'work'),
  c(Team, 'work'),
  c(Meeting, 'work'),
  c(Post, 'work'),
  c(PostReply, 'work'),
  c(SavedView, 'work'),
  c(TimeEntry, 'work'),
  c(Timesheet, 'work'),
  c(Whiteboard, 'work'),
  c(ArcRun, 'work'),
  // Token counts for the AI cap: Flowbit's telemetry, not exported.
  c(AiUsage, 'work', 'delete', false),
  // Muster
  c(Department, 'muster'),
  c(Designation, 'muster'),
  c(Employee, 'muster'),
  c(EmployeeDocument, 'muster'),
  c(EmployeeRemark, 'muster'),
  c(Nominee, 'muster'),
  c(BankChangeRequest, 'muster'),
  c(AttendanceDay, 'muster'),
  c(AttendanceCorrection, 'muster'),
  c(AttendancePeriod, 'muster'),
  c(Holiday, 'muster'),
  c(LeaveType, 'muster'),
  c(LeaveBalance, 'muster'),
  c(LeaveRequest, 'muster'),
  c(CompOff, 'muster'),
  c(Claim, 'muster'),
  c(ClaimCategory, 'muster'),
  c(ClaimForm, 'muster'),
  c(Letter, 'muster'),
  c(LetterTemplate, 'muster'),
  c(MusterPolicy, 'muster'),
  c(PolicyDocument, 'muster'),
  c(SalaryComponent, 'muster'),
  c(SalaryStructure, 'muster'),
  c(StatutoryVersion, 'muster'),
  c(PayrollCycle, 'muster'),
  c(PayrollEntry, 'muster'),
  c(PayrollAdjustment, 'muster'),
  c(TdsOverride, 'muster'),
  c(TaxDeclaration, 'muster'),
  c(TaxYearSettings, 'muster'),
  c(Payslip, 'muster'),
  c(OtpChallenge, 'muster', 'delete', false),
  // Orbit
  c(Lead, 'orbit'),
  c(Deal, 'orbit'),
  c(Activity, 'orbit'),
  c(StageEvent, 'orbit'),
  c(LeadCapture, 'orbit', 'delete', false),
  c(OrbitSettings, 'orbit'),
  c(Sequence, 'orbit'),
  c(SequenceEnrollment, 'orbit'),
  c(SequenceSendCount, 'orbit', 'delete', false),
  // Folio
  c(FolioEntity, 'folio'),
  c(FolioSettings, 'folio'),
  c(FolioServiceItem, 'folio'),
  c(FolioBillingProfile, 'folio'),
  c(FolioBillingPlan, 'folio'),
  c(FolioRetainer, 'folio'),
  c(Quote, 'folio'),
  c(Invoice, 'folio'),
  c(EInvoice, 'folio'),
  c(EInvoiceSettings, 'folio', 'delete', false),
  c(CreditNote, 'folio'),
  c(FolioReceipt, 'folio'),
  c(FolioExpense, 'folio'),
  c(BankStatement, 'folio'),
  c(BankTxn, 'folio'),
  // Meetings AI: transcripts are exported (they are the workspace's minutes); usage rows are counters.
  c(MeetingTranscript, 'work'),
  c(MeetingAiUsage, 'work', 'delete', false),
  c(FolioExpenseCategory, 'folio'),
  c(FolioFollowup, 'folio'),
  c(FolioMessage, 'folio'),
  c(DocLink, 'folio'),
  c(DocEvent, 'folio'),
  c(PaymentLink, 'folio'),
  c(PaymentEvent, 'folio'),
  // Sealed gateway keys: never exported, deleted with the workspace.
  c(PaymentGateway, 'folio', 'delete', false),
  // Flowbit's own billing records
  c(SubscriptionInvoice, 'billing', 'keep'),
  // GST credit notes are tax records like the invoices they reduce.
  c(FlowbitCreditNote, 'billing', 'keep'),
  c(OfflinePayment, 'billing'),
  // The WhatsApp wallet: its recharges stay on the kept GST invoices.
  c(Wallet, 'billing'),
  c(WalletLedger, 'billing'),
  c(BillingEvent, 'billing', 'anonymise', false, BILLING_EVENT_ANON),
]

/**
 * Models with no workspace data of their own: accounts and sign-in records
 * (a User may belong to other workspaces), leases, rate limits, marketing
 * demo requests, Console staff, their sessions, audit and settings, and the
 * Org itself (which becomes a tombstone).
 */
export const GLOBAL_MODELS: readonly string[] = ['Org', 'User', 'Session', 'PasswordReset', 'EmailVerification', 'RateLimit', 'CronLock', 'DemoRequest', 'Staff', 'StaffSession', 'StaffAudit', 'ConsoleSettings', 'WaConversation', 'WaChatMessage', 'PhoneVerification', 'WaInboundClaim', 'OAuthClient']
