import { isProvisionalExpired, isValidUtr, normalizeUtr, provisionalUntil, verifyRefusal, type OfflineMode, type OfflineStatus } from './rules'

/**
 * Offline payments (bank transfer / UPI against a due bill), pure
 * orchestration with storage injected (console spec 11):
 *   record  → UTR checked and unique, 7 days of provisional access;
 *   verify  → a different staff member matches it to the bank statement,
 *             then the money is applied to the bill (tax invoice, unlock);
 *   reject  → provisional access ends;
 *   expire  → 7 days without verification end provisional access.
 */

export type OfflineInput = Readonly<{
  billId: string
  utr: string
  amountPaise: number
  paidOn: string
  mode: OfflineMode
  tdsDeclared: boolean
  screenshotFileId?: string | null
  /** Staff id when Accounts records it; null when the customer submits it. */
  recordedByStaffId: string | null
  recordedByName: string
}>

export type OfflineRow = Readonly<{ id: string; billId: string; status: OfflineStatus; recordedByStaffId: string | null; provisionalUntil: Date; amountPaise: number; utr: string; paidOn: string; mode: string }>

export type RecordDeps = Readonly<{
  utrTaken: (utr: string) => Promise<boolean>
  /** The bill is due and belongs to the workspace. */
  billIsDue: (billId: string) => Promise<boolean>
  create: (row: OfflineInput & { utr: string; provisionalUntil: Date }) => Promise<string>
  grantProvisional: (paymentId: string, until: Date) => Promise<void>
  /** Marks the bill as paid net of TDS (certificate awaited), so settlement expects the net amount. */
  declareTds: (billId: string) => Promise<void>
  /** The workspace already submitted an offline payment for this bill (it got its 7 days then). */
  customerSubmittedBefore: (billId: string) => Promise<boolean>
}>

export type RecordResult = Readonly<{ ok: true; id: string; provisionalUntil: Date; provisional: boolean } | { ok: false; error: string; field?: 'utr' | 'amount' | 'billId' }>

export async function recordOffline(deps: RecordDeps, input: OfflineInput, now: Date): Promise<RecordResult> {
  if (!isValidUtr(input.utr)) return { ok: false, error: 'Enter the bank reference (UTR) from the transfer: 6–22 letters or digits.', field: 'utr' }
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) return { ok: false, error: 'Enter the amount that was paid.', field: 'amount' }
  const utr = normalizeUtr(input.utr)
  if (await deps.utrTaken(utr)) return { ok: false, error: 'This UTR was already recorded. Each bank transfer can be recorded once.', field: 'utr' }
  if (!(await deps.billIsDue(input.billId))) return { ok: false, error: 'That bill is not due any more.', field: 'billId' }
  const until = provisionalUntil(now)
  // A customer gets provisional access once per bill, so made-up UTRs cannot keep a lapsed workspace open (V2-REVIEW M-H1).
  // Payments recorded by Accounts always grant it.
  const provisional = input.recordedByStaffId != null || !(await deps.customerSubmittedBefore(input.billId))
  const id = await deps.create({ ...input, utr, provisionalUntil: until })
  if (provisional) await deps.grantProvisional(id, until)
  // The declaration holds on every submission, also the ones that get no provisional access.
  if (input.tdsDeclared) await deps.declareTds(input.billId)
  return { ok: true, id, provisionalUntil: until, provisional }
}

export type VerifyDeps = Readonly<{
  load: (id: string) => Promise<OfflineRow | null>
  /** Marks it verified and applies the money to the bill; returns what happened to the bill. */
  apply: (row: OfflineRow, verifierStaffId: string) => Promise<'paid' | 'part' | 'duplicate' | 'flagged'>
  /** False when the row was verified or rejected meanwhile (nothing changed). */
  reject: (row: OfflineRow, staffId: string, reason: string) => Promise<boolean | void>
  endProvisional: (row: OfflineRow) => Promise<void>
}>

export async function verifyOffline(deps: VerifyDeps, id: string, verifierStaffId: string): Promise<{ ok: true; outcome: 'paid' | 'part' | 'duplicate' | 'flagged' } | { ok: false; error: string }> {
  const row = await deps.load(id)
  if (!row) return { ok: false, error: 'That payment was not found.' }
  const refusal = verifyRefusal({ status: row.status, recordedByStaffId: row.recordedByStaffId, verifierStaffId })
  if (refusal) return { ok: false, error: refusal }
  return { ok: true, outcome: await deps.apply(row, verifierStaffId) }
}

export async function rejectOffline(deps: VerifyDeps, id: string, staffId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await deps.load(id)
  if (!row) return { ok: false, error: 'That payment was not found.' }
  const refusal = verifyRefusal({ status: row.status, recordedByStaffId: row.recordedByStaffId, verifierStaffId: staffId })
  if (refusal) return { ok: false, error: refusal }
  if ((await deps.reject(row, staffId, reason)) === false) return { ok: false, error: 'That payment was verified or rejected just now. Reload the page.' }
  await deps.endProvisional(row)
  return { ok: true }
}

/** The pending payments whose 7 days ran out (the billing cron expires them). */
export const expiredProvisional = <T extends { status: OfflineStatus; provisionalUntil: Date }>(rows: readonly T[], now: Date): T[] => rows.filter((r) => isProvisionalExpired(r, now))

export type ApplyOutcome = 'paid' | 'part' | 'duplicate' | 'flagged'

/**
 * Applies a verified offline payment to its bill, and flags the payment for
 * Accounts instead of failing silently when that cannot finish, e.g. the
 * bill was paid online between claiming and settling (V2-REVIEW M-L1).
 */
export async function applyOrFlag(apply: () => Promise<ApplyOutcome>, flag: (reason: string) => Promise<void>): Promise<{ outcome: ApplyOutcome; note?: string }> {
  try {
    return { outcome: await apply() }
  } catch (error) {
    const note = `Verified, but it could not be applied to the bill: ${error instanceof Error ? error.message : String(error)} Check the bill, then refund or credit the money.`
    await flag(note)
    return { outcome: 'flagged', note }
  }
}
