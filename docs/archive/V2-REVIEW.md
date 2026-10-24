# V2 review (8 Oct 2026)

This is the review-and-fix pass over the eight v2 commits (`b972907..035cbeb`, 607 files, about 31k lines). It covered tenancy, authorisation, public routes and webhooks, money, destructive paths, secrets, crons and regressions to v1. The fixes are in commits `859e124`, `7dee0ae`, `c8d95cb` and `cb12fce`.

File and line references point at the reviewed code (`035cbeb`), before the fixes.

**Summary (updated 8 Oct, after step 9b):**
- **CRITICAL:** none found.
- **HIGH:** 3 found, all 3 fixed.
- **MEDIUM:** 13 found. 12 fixed, 1 left (M-M1, the owner's call).
- **LOW:** 18 found. 12 fixed, 2 fixed in part, 4 left.

All checks passed after the review fixes: `tsc` reported 0 errors, ESLint 0 errors, and the build passed. Vitest went from 1,370 tests in 143 files to 1,395 tests in 146 files.

Step 9b (commits `1a965bd` to `b406b5f`) fixed the rows that were left: T3, the rest of P2 and M-M3, C6, C9, P4, M-L1, M-L4 and M-L5. Their status below says **fixed (9b)**.

## Findings

Status key: **fixed** = fixed in this pass; **part** = fixed in part, the rest is explained in the row; **left** = not changed, with the reason.

### HIGH

| ID | Finding | Where | Status | Test |
|---|---|---|---|---|
| C1 | Sales and Accounts could read a workspace's own audit rows in the Console Audit tab without support access. Those rows include salary amounts ("Salary structure saved … ₹Y a month") and payroll totals, which breaks spec §8. | `app/console/(staff)/accounts/[id]/tabs.tsx:104-108`, `page.tsx:59` | **fixed.** By default only the "Flowbit team actions" list is shown. The workspace list appears only to an Admin who holds an active read grant of their own (`showsWorkspaceAudit`). | `lib/console/support-access.test.ts` "C1" |
| M-H1 | A customer could keep a lapsed workspace open indefinitely. Each offline-payment submission with any well-formed, unused UTR granted another 7 days of provisional full access, and a rejected UTR was freed for reuse. | `modules/billing/offline-core.ts:38-47`, `offline.ts:55-57` | **fixed.** A customer gets provisional access once per bill. Later submissions are still recorded for Accounts to verify, but they don't extend access. Payments that Accounts records still grant access. | `modules/billing/billing.test.ts` "M-H1" |
| M-H2 | A wallet-recharge tax invoice could be credited and refunded through Razorpay while the wallet credit stayed in place. That is a cash-out path, which the step 8 terms forbid. | `modules/billing/credit-notes.ts:32-42`, `rules.ts:97` | **fixed.** `creditNoteRefusal` refuses `kind: 'wallet_recharge'`. | `billing.test.ts` "M-H2" |

### MEDIUM

| ID | Finding | Where | Status | Test |
|---|---|---|---|---|
| P1 | The WhatsApp B webhook is signed with the workspace's own secret, so its admin can forge a "failed" tick for a delivered message and get the wallet charge and free allowance back. | `modules/whatsapp/workspace-webhook.ts:45-48` | **fixed.** A failed tick refunds only before delivery (`refundsOnFailure`: queued, sending or sent). | `messaging/consent.test.ts` "P1" |
| P2 | Inbound WhatsApp was not idempotent. A redelivered webhook stored the message twice, counted it as unread twice and, for STOP, sent a second paid confirmation. This affected both the Console inbox and the workspace inbox. | `workspace-webhook.ts:112`, `whatsapp/inbox.ts:59` | **fixed (9b).** The review pass skipped ids already stored (sequential redelivery). Now each handler first claims the provider id in `WaInboundClaim` (unique on scope + id, kept 30 days), so a delivery arriving at the same moment fails to claim and nothing is stored, counted or answered twice. A run that fails gives the claim back for the provider's retry. A new collection, so no data check is needed. | `whatsapp.test.ts`, `whatsapp-b.test.ts` "P2"; DB smoke (10 parallel claims → 1) |
| P3 | The workspace Razorpay `PaymentEvent` idempotency key was global (`provider, paymentId`). Workspace A could sign a forged event with its own secret and block workspace B's real one. | `models/payments/PaymentEvent.ts:29`, `modules/payments/webhook.ts:47,71` | **fixed.** The unique index is now `{provider, orgId, paymentId}`, and every lookup includes `orgId`. **Owner:** drop the old index (see the checklist). | `payments/payments.test.ts` "P3" |
| C2 | Only the founder may open the Internal workspace, but this was enforced only on the support view and the support request. The account page, the import page and actions, and every account action were open to any staff member. Any Admin could also set a workspace's type to Internal. | `accounts/[id]/page.tsx:49`, `import/page.tsx`, `console/import-actions.ts:25`, `account-actions.ts:31,157` | **fixed.** `internalLocked()` now guards the account page, the import page, the import actions and `loadOrg` (every account action). Only the founder can set Internal. | `support-access.test.ts` "C2" |
| C3 | A support grant covered the whole org, not the staff member the owner approved. Any staff member could use another staff member's grant to open the support view or run imports. | `accounts/[id]/support/page.tsx:37`, `import-actions.ts:28`, `import/page.tsx:31`, `page.tsx:83` | **fixed.** Every grant lookup filters on `staffId`, or uses `grantsFor`. | `support-access.test.ts` "C3" |
| M-M1 | The TDS tolerance is 2% of the total including GST rather than 2% of the taxable value, so a customer can short-pay slightly more than the TDS. A customer can also tick "TDS declared" on their own, and the flag isn't cleared when the payment is rejected. | `modules/billing/rules.ts:33-37`, `offline.ts:57` | **left (owner decision, unchanged in 9b).** The brief names the 98% rule and the spec decided it. See "Decisions waiting on you" for the suggested alternative. | — |
| M-M2 | A due bill could be issued while autopay is on. The customer pays the bill and the mandate also debits the same period. | `modules/billing/bills.ts:37-46` | **fixed.** `createDueBill` refuses while `renewsAutomatically(sub)` is true ("Cancel autopay first"). | `billing.test.ts` "M-M2" |
| M-M3 | Overpayment on a bill was absorbed silently. After a part payment by UTR, the Razorpay link still asks for the full amount. | `modules/billing/settle.ts:75-112` | **fixed (9b).** Settling more than the total raises a `payment_flagged` alert (review pass). Now a part payment also re-creates the bill's Razorpay link for the balance (reference `<bill>-2`, `-3`, …) and cancels the old one after the new one exists; the reminders, the public bill page, Settings → Billing and Console → Billing all show the balance (`billBalancePaise`). | `billing.test.ts` "M-M3", `leftovers.test.ts` "M-M3" |
| T1 | Delayed automation runs (up to 14 days, or held for quiet hours) still went out after the workspace was disabled, blocked or made read-only. They emailed or WhatsApped clients and debited the wallet. | `modules/automations/execute.ts:188-202` | **fixed.** `executeRun` skips the run with a note when `inactiveWorkspaceNote(org)` returns one. | `automations/automations.test.ts` "T1" |
| T2 | Undoing an import ignored locked attendance months and payroll. Undo could rewrite attendance in a locked, paid month, or delete employees that payroll already uses. | `modules/imports/run.ts:73-83` | **fixed.** `undoLockRefusal` refuses dates in locked months and employees referenced by a `PayrollEntry`. | `imports/imports.test.ts` "T2" |
| T3 | The workspace export loads every collection fully into memory, three times over (rows, JSON and CSV). Large or long-lived workspaces can run out of memory or hit the 300-second limit. | `modules/lifecycle/export-source.ts:15`, `export.ts:101` | **fixed (9b).** Rows and files come through cursors (batches of 500), and each collection is written in parts of at most 5,000 rows or about 8 MB (`Task.part-001.json` + CSV each); only one part is held at a time and each ZIP entry is compressed and sent before the next is read. Message `html` and `text` are left out (projection and export filter). Very large exports can still take long: the 300-second budget is the limit now, not memory. | `export-stream.test.ts` (25,000 rows, never more than one part + one row held) |
| E1 | The "one Free workspace per user, GSTIN or PAN" rule could be bypassed. One route was to sign up as a trial and trim back to Free. The other was for a Free workspace to start its trial, create a second Free workspace, then return the first to Free. | `modules/lifecycle/plan-switch.ts:30`, `lib/signup-guard.ts:44` | **fixed.** `returnToFree` (used by both the button and the cron) refuses with the new `duplicate` reason when another Free workspace matches. | `lifecycle/plan-switch.test.ts` |
| R2 | `sendMail` returns `ok: false` on a transient failure while the queue keeps retrying the message. Hand-sent mail (invoices, quotes, statements, payslips, letters) showed "failed", so the user resent it and the customer got it twice. | `folio/mail.ts:65`, `folio/collections/statement-actions.ts:36`, `muster/payroll/payslips.ts:103`, `muster/letters/actions.ts:176` | **fixed.** These callers pass `retry: false`, like Folio reminders already did, so a failure is final and the user's resend is the retry. This is the v1 behaviour. | `lib/mail-callers.test.ts` |

### LOW

| ID | Finding | Where | Status | Test |
|---|---|---|---|---|
| C4 | Two parallel requests could both use the same recovery code. | `modules/console/auth-actions.ts:75-77` | **fixed.** The code is removed with an atomic conditional `$pull`, and the action fails when nothing was pulled. | `lib/console/totp.test.ts` "C4" |
| C5 | Sign-in response time showed which emails belong to staff, because bcrypt was skipped when there was no hash. The product sign-in had the same issue. | `auth-actions.ts:40-42`, `lib/auth/password.ts:15` | **fixed.** `verifyPassword` runs a dummy compare when there is no hash. | `lib/auth/password.test.ts` |
| C6 | `migrate-staff.ts` carries over each admin's product password, and two-factor is enrolled by whoever signs in first. Anyone who has that product password can enrol their own authenticator. | `scripts/migrate-staff.ts:55` | **fixed (9b).** Founder-only by default (`--founder=` required; `--all` adds the others). No product password is ever carried over: the founder's setup link is printed for the person running it; others get theirs from Console → Staff → **Send setup links**. | `staff-migration.test.ts` |
| C7 | Staff imports skipped the workspace's product switch. | `console/import-actions.ts:34-49` | **fixed.** `importProductRefusal` now applies to staff preview and confirm. | `imports.test.ts` "C7" |
| C8 | Undo deletes created rows even after the workspace has built on them. | `imports/batch-store.ts:26` | **part.** T2 covers payroll and locked months. Other dependants, such as tasks on imported projects, are still removed. | `imports.test.ts` "T2" |
| C9 | Two concurrent Sales requests can both extend a trial "once". | `console/account-actions.ts:65-71` | **fixed (9b).** The extension is claimed first with a conditional `$inc` (filter: no extension yet; an upsert that hits the unique `orgId` counts as taken), then the trial moves; a failed move gives the claim back. | `setup-cap.test.ts` "C9"; DB smoke (6 parallel → 1) |
| P4 | When `emitPaid` throws and Razorpay retries, a second "Paid online" DocEvent is created. | `payments/process-paid.ts:39-43` | **fixed (9b).** The DocEvent carries `paymentId` and is an upsert on it, with a partial unique index `{orgId, paymentId}`. | `leftovers.test.ts` "P4"; DB smoke |
| P5 | The WhatsApp webhook secret travels in the query string (`?token=`), so it can end up in access logs. | `whatsapp/webhook-event.ts:27` | **left.** It's a documented choice, because Interakt doesn't sign requests. Keep request logging for `/api/webhooks/*` redacted. | — |
| M-L1 | If a bill is paid online between claiming and settling, a verified offline payment ends with no outcome and no alert. | `billing/offline.ts:106-111` | **fixed (9b).** `applyOrFlag` catches the failure: the row gets `outcome: 'flagged'` and a `flagNote`, and Accounts get a `payment_flagged` alert to refund or credit it. | `leftovers.test.ts` "M-L1" |
| M-L2 | A reject could overwrite a payment that a concurrent verify had just settled. | `billing/offline.ts:115-116` | **fixed.** Reject is conditional on `pending` or `expired`. If it loses the race, nothing changes. | `billing.test.ts` "M-L2" |
| M-L3 | An offline payment's tax invoice took the date the customer typed, which could fall in a closed FY or in the future. | `billing/settle.ts:76` | **fixed.** It is dated the day it is verified (`taxInvoiceInstant`). The typed date stays as the payment date. | `billing.test.ts` "M-L3" |
| M-L4 | The credit-note counter restarts after a GSTIN change, but the number is always printed `FBC/`, so it collides with existing numbers. | `billing/series.ts:55-58` | **fixed (9b).** The printed prefix follows the invoice prefix of the GSTIN series (`FB` → `FBC`, `FP` → `FPC`, 3 letters `ABC` → `CAB`), and the first GSTIN series under the default prefix continues the pre-GSTIN credit counter, so no number prints twice. | `leftovers.test.ts` "M-L4" |
| M-L5 | A double submit can create two due bills at once. | `billing/bills.ts:46` | **fixed (9b).** Partial unique index `one_due_bill_per_org` (`{orgId}` where `status: 'due'`); the losing submit gets "already has a due bill". **Owner:** run the data check in the checklist before `setup:prod`. | `leftovers.test.ts` "M-L5"; DB smoke |
| T-L1 | More than 2,000 briefs that aren't due today can starve later-in-the-day briefs. | `briefs/job.ts:30` | **left.** This isn't reachable at launch scale. | — |
| R3 | `recoverStale` re-queued every interrupted send, including single-shot mail (OTP, reset or invite links, which are masked once stored) and `retry: false` mail. | `messaging/jobs.ts:30-36` | **part.** Interrupted `retry: false` messages are now marked failed, not re-queued. Retryable mail that the provider had already accepted can still go out twice. A Resend `Idempotency-Key` would close that. | — (DB-only path, no unit seam) |
| T-L4 | Daily recipe seeding has no deadline, and the day marker is set before the loop. | `automations/job.ts:67-68` | **left.** It's fine at launch scale. | — |
| E2 | Free workspaces are stored as trialing, so they got the trial's brand colours, a Suite perk. | `lib/brand-theme.ts:86` | **fixed.** | `lib/brand-theme.test.ts` "E2" |
| E3 | At the 2-firm limit, a Free workspace is told to buy an extra firm, which Free cannot do. | `subscription/firms.ts:33` | **left.** It's copy only, and the wording is the owner's call. | — |

### Checked and fine

- **Cron routes:** all ten use `cronHandler`, with a timing-safe `CRON_SECRET` check (503 when unset) and a 15-minute lease. All 17 `vercel.json` paths match a route.
- **Purge:** dry run unless `LIFECYCLE_DELETE_ENABLED` is exactly `true`. Every filter is guarded with `orgId`. Internal, Test, unexpired Comped, disabled and deleted orgs are excluded.
- **Export:** owner only, scoped to the org, with secrets stripped. `WaConnection` and `PaymentGateway` are excluded.
- **Platform Razorpay, Resend and Interakt webhooks:**
  - The signature is checked on the raw body, length-safe, before parsing.
  - A missing secret means the request is rejected.
  - Each event is stored once by its event id.
  - Bill settlement is guarded by a transaction on `status: 'due'`.
- **`/d/[token]` and `/bill/[token]`:**
  - Tokens are a 144-bit key plus a labelled HMAC, checked before any database access.
  - Lookup is by exact key.
  - Revoked or expired links return "not available".
  - Bank details are masked, and there is no lookup by ObjectId.
  - Quote accept and decline use compare-and-set and are rate-limited.
- **Unsubscribe:** an HMAC-signed token. GET only redirects; the one-click unsubscribe is a POST, per RFC 8058.
- **Console sessions:**
  - The cookie (`__Host-fb_console`, Strict) is separate from the customer session.
  - Two-factor is required for a full session.
  - TOTP replay is blocked by a conditional `lastStep`.
  - Recovery codes are stored hashed.
  - Setup tokens are single-use with a 48-hour expiry.
  - Every Console action goes through `consoleAction(perm)`, and every page through `requireStaff(perm)`.
- **Maker-checker on offline verify and reject:** the person who recorded a payment cannot verify it.
- **Wallet:**
  - Debits are a guarded `findOneAndUpdate` in one transaction with a unique ledger key, so the balance cannot go negative.
  - Recharge, refund, free-allowance and expiry are each idempotent per key.
  - All amounts are integer paise.
  - GST split: IGST vs CGST/SGST by state, and the parts sum to the tax.
- **Secrets:** the Interakt, Razorpay and TOTP secrets are `select: false` or sealed with `secret-box` (AES-256-GCM). Pages see only the last four characters.
- **`entitlements()` adoption:**
  - It covers ctx, actions, capacity checks, crons and banners.
  - Free limits are enforced on the server on every create path.
  - Signup verification codes are stored as HMACs, compared timing-safely, single-use and rate-limited.


## Owner checklist (current after step 9b, 8 Oct)

Everything to do before and right after the first production deploy of v2, in order. Variables are set in Vercel → Settings → Environment Variables; each is also in `.env.example` and `docs/DEPLOY-VERCEL.md`.

### 1. Environment variables

**Required:**
- `APP_SECRET`: set it once and never change it (it signs every link).
- `APP_ENCRYPTION_KEY`: `openssl rand -base64 32`. Never change it once set. Without it there is no Console two-factor, and workspaces cannot save Razorpay, WhatsApp or IndiaMART keys.
- `CRON_SECRET`: without it every cron returns 503.
- `MONGODB_URI` and `MONGODB_DB`.
- `STORAGE_DRIVER=s3` and the `S3_*` variables.
- `APP_URL` (the product host, https).

**Mail:** `RESEND_API_KEY`, `MAIL_FROM` (your verified domain), `RESEND_WEBHOOK_SECRET` (without it delivery ticks and bounces are refused), `SUPPORT_EMAIL`.

**Flowbit's own billing:**
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE`, `FLOWBIT_SAC`. Invoices carry a DRAFT watermark until the GSTIN is set.
- `FLOWBIT_INVOICE_PREFIX` (default `FB`; a new GSTIN needs a new prefix, and credit notes follow it: `FB` → `FBC`).
- `FLOWBIT_WALLET_SAC`, once the CA answers Q1.

**WhatsApp A (Flowbit's own number):** `INTERAKT_API_KEY`, `INTERAKT_OTP_API_KEY`, `INTERAKT_WEBHOOK_SECRET` (`openssl rand -hex 32`).

**Console and growth:**
- `CONSOLE_HOST` (default `console.useflowbit.com`).
- `FLOWBIT_HOUSE_ORG_SLUG`: Vistaar's own workspace, which receives every signup and demo request as an Orbit lead (now with the signup's UTM source, medium and campaign).
- `PLATFORM_ADMIN_EMAILS`: read only by `migrate-staff --all`.

**Optional:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `INDIAMART_API_URL` (leave unset).

**Leave unset at first (dry runs):**
- `LIFECYCLE_DELETE_ENABLED`: workspace deletion. The export is now streamed (T3), so deletion may be enabled after you have watched the dry-run log lines for a few days.
- `RETENTION_PRUNE_ENABLED`: deletes message and processing logs older than 395 days. Watch the `[retention] would delete …` lines first.

### 2. External setup

- **Razorpay (Flowbit's account):** webhook `https://<APP_URL>/api/subscription/razorpay/webhook` with `subscription.*`, `payment.failed`, `order.paid` and `payment_link.paid`. Turn on UPI AutoPay / e-mandate. Get the AutoPay fee in writing.
- **Interakt:** two accounts (messages, OTP), Growth plan. Webhook `https://<APP_URL>/api/webhooks/interakt?token=<INTERAKT_WEBHOOK_SECRET>` with ticks and inbound messages. Get the templates in `docs/WHATSAPP-TEMPLATES.md` approved. Apply for the White Label / partner deal (V2-PLAN §7) for Flowbit-managed WhatsApp B.
- **Resend:** verify the sending domain (SPF, DKIM, DMARC); webhook `https://<APP_URL>/api/webhooks/resend` with sent, delivered, opened, bounced and complained.
- **DNS:** add `console.useflowbit.com` to the Vercel project and create the CNAME it shows.
- **Vercel plan:** Pro is required (5- and 15-minute crons, 300-second functions).
- **Meta:** business verification of Sanskaar Webx Services LLP and the two new numbers.
- **Request logs:** keep request logging for `/api/webhooks/*` redacted (P5: the Interakt secret travels as `?token=`).

### 3. Scripts and migrations, in this order, against production

1. **Data check for the one-due-bill index (M-L5).** In `mongosh`:
   `db.subscriptioninvoices.aggregate([{ $match: { status: 'due' } }, { $group: { _id: '$orgId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])`
   It should return nothing. If it lists a workspace, cancel the extra due bills in Console → Billing first, or `setup:prod` cannot build the index.
2. `npm run setup:prod`: builds every index, including the new ones of step 9b (one due bill per workspace, `DocEvent.paymentId`, `WaInboundClaim`, and the date indexes the retention job uses). Run it again after any later deploy that adds an index.
3. Drop the old global PaymentEvent index (P3): `db.paymentevents.dropIndex('provider_1_paymentId_1')`. Skip it if it reports that the index does not exist.
4. `npx tsx scripts/migrate-account-types.ts`: dry run first, then `--apply`.
5. `npx tsx scripts/migrate-staff.ts --founder=<your email>`: dry run first, then add `--apply`. It creates only you, without carrying a product password (C6), and prints your one-time setup link. Add `--all` only if other old platform admins should become Admins; they get no password and no link from the script.
6. Open the setup link, choose a Console password, sign in at `console.useflowbit.com`, enrol two-factor and store the recovery codes.
7. If you used `--all`: Console → Staff → **Send setup links**.
8. **Console → Settings: check every value now, because the product reads them:**
   - Prices (rupees ex-GST per unit per month): new checkouts, plan changes and new bills use them. Issued invoices and existing subscribers keep the prices they bought at; renewals keep them too.
   - Limits: Free seats, Free months, trial days (new signups and trials), the Sales trial extension and the free setups per week (yearly customers only).
   - Templates: the first line of the trial-ending, Free-ending, payment-due and welcome emails.
   - Help links, the WhatsApp rate card and the wallet settings (rates, free messages per plan; a single workspace can get its own number in Console → account → WhatsApp wallet → Free messages).
   - The marketing site (pricing page, calculator, FAQ) still shows the code's prices and 15 days: if you change prices or trial days here, ask for the site copy to be updated too.
9. Console → Reports: check the numbers look right with real data (Internal and Test workspaces are left out).

### 4. Decisions and reviews waiting on you

- **M-M1, the TDS rule (unchanged, your call).** Today a bill counts as paid when at least 98% of the **total including GST** has arrived and TDS is declared, so a customer can short-pay slightly more than the 2% TDS (2% of the taxable value), and a customer can tick "TDS declared" themselves.
  **Suggested alternative:** settle when `received ≥ total − 2% of the taxable value` (exactly what the payment link already asks for), record TDS as `min(shortfall, 2% of taxable)`, accept a customer's own TDS declaration only when a GSTIN is on file, and clear the flag when that payment is rejected. Say the word and it is a small change in `modules/billing/rules.ts` (`settlementOf`) and `offline.ts`.
- **E3:** the copy shown at the 2-firm limit on Free ("buy an extra firm") is yours to word.
- **Hindi wording** for automation recipes (`modules/automations/recipes-hi.ts`) is a first draft marked `review`: read it before telling customers about it.
- **Lawyer:** `docs/BREACH-RUNBOOK.md` (timelines, CERT-In), the DPA page, and the erasure rules (what is kept by law).
- **CA:** Q1 (wallet SAC) and the open questions in `docs/CA-QUESTIONS.md`.
