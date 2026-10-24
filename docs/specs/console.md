# Flowbit Console & growth model — spec (draft v2, 7 Oct 2026)

Status: **approved by the owner (7 Oct)**. Items marked "(built 8 Oct)" in §12 are built; the rest is not yet.
Decisions come from the chat on 5–7 Oct 2026. v2 folds in three checks run on 7 Oct (code, India
rules/vendors, scenario review). Open items are in §13.

## 1. Why

The suite (Work, Muster, Orbit, Folio) is built for the *customer*. The *seller's* side is missing:
our team has no way to bring customers in, set them up, watch whether they stick, bill them, or chase payment.
The model is **habit first, money later**, but with a time limit: free for a while, then pay.

**Dropped:** the founding-customer program and every lifetime deal. Launch BRIEF §2 forbids lifetime deals.

## 2. Pricing rules

| Rule | Value |
|---|---|
| Free plan | Up to **5 seats**, full suite, **free for 6 months** from signup |
| Seat | **Billable = the higher of** active logins and active Muster employees. Employee self-service (attendance, leave) counts as an employee, not a login. |
| Team bigger than 5 | **15-day trial** with all features and all people. Then pay, or trim to 5 and drop to Free (within the same 6-month window). |
| After the 6 free months | Must pay (§4.3) |
| Discount | **50% off the first year, on yearly plans only**. Monthly plans pay the list price. |
| One Free workspace per | GSTIN, else PAN, else verified owner email/phone |

List prices are in `lib/plans.ts` `PLAN_PRICES`. Finance (`flowbit-launch/finance/`) recommends ₹999/workspace +
₹199/person from Jan 2027, but no decision has been made. Whatever the price, the campaign's "₹149" claim must still hold true;
re-check BRIEF before 12 Oct.

**Finance check needed:** at most 6 months of Free for 5 seats replaces the old "read-only → blocked" model.
Add the Free cost (≈₹10–22 per active seat per month in variable infra) to `assumptions.json`.

## 3. Customer lifecycle

```
Signup (email OTP) ─► Lead in Vistaar's Orbit
   │
   ├─ ≤5 seats ─► Free (6 months) ─► Paid  (yearly: 50% off yr 1)
   │                              └► unpaid → §4.3
   └─ >5 seats ─► Trial 15 days ──► Paid
                                  └► trim to 5 → Free (rest of the 6 months)
Setup: self-serve importer for all; free setup by our team only for yearly customers (max 5/week)
```

## 4. Account types & states

### 4.1 Types (new field `subscription.accountType`)

| Type | Billing | Reminders | Notes |
|---|---|---|---|
| **Internal** | Never | None | Vistaar's own workspace. Only the founder can open it from the Console. |
| **Test / Demo** | Never | None | Seeded, tutorial and QA workspaces. |
| **Free** | Never, for 6 months | Free-ending reminders | Limits in §2. |
| **Trial** | 15 days | Trial-ending reminders | Sales may extend it once by 15 days; anything more needs Admin. |
| **Paid** | Monthly or yearly | Renewal, due and overdue | |
| **Comped / Partner** | Free or custom price | Optional | Needs an end date and a reason. Admin only. |

Internal and Test/Demo are left out of every Console metric. `scripts/seed.ts` marks the `vistaar` demo workspace as Test/Demo.
The existing `status` (trialing/active/past_due/canceled/expired) stays and describes payment state.

### 4.2 Limits on Free

- 5 seats, counted as in §2. Adding a 6th person asks them to upgrade or start a trial.
- Products: all four products, within 5 seats. Folio keeps its own firm limits.
- WhatsApp messages, extra firms and similar add-ons are not included.

### 4.3 Expiry without payment (Free month 6 ends, trial ends, paid lapses)

Proposal (open item §13.1):
1. **30 days read-only.** Export always works, without a watermark. Employees can still download old payslips.
2. **Then blocked.** Only Billing and Export open.
3. Data is **deleted after 90 more days**. Notices go out 30, 7 and 1 day before, and the owner can export until the end.

Issued GST invoices stay retrievable for 6 years, even after deletion: they live in our books, not in the workspace.

## 5. Signup changes

1. **Email OTP** at signup (verifies the email). Phone gets verified later, on WhatsApp.
   SMS needs DLT registration (days to weeks), so SMS is out for launch.
2. **Duplicate check:** a GSTIN, PAN or verified email that already owns a Free workspace cannot start another.
   Rate-limit `createWorkspaceAction`. Today any user can create unlimited workspaces, each with a fresh trial.
3. **Seat question at signup:** "How many people?" If more than 5, the workspace starts as a Trial; otherwise as Free.
4. **Lead to Orbit:** each signup creates or updates a Lead in **Vistaar's own Orbit workspace**
   (name, company, phone, email, team size, products, source/UTM, account type). `DemoRequest` leads go there too.
   Needs a system Member as owner and valid `sector`/`source` values (`models/orbit/Lead.ts:33-55`).
5. **Onboarding emails** on Day 0, 1, 3 and 7. A step that is already done is skipped.

## 6. One entitlements function (do this first)

Plan, access and limit checks are scattered over about 50 places:
- `lib/ctx.ts`, `lib/actions.ts` and about 30 API routes repeating `access === 'blocked'`
- the cron filters and the banners
- `capacity()` and `assertCapacity`

Replace them with one `entitlements(org, now)` that returns access level, account type, products, features,
seat limit, seats used and reasons. Every gate, banner, cron job and Console screen reads from it.

**Fix first:** `isTrial()` (`lib/plans.ts:185`) is true whenever `plan === 'trial'`, *even after expiry*.
`entitled`, `seatLimit`, `capacity()` and others treat an expired trial as unlimited; today the read-only state hides it.
Also align `orgState`/`seatLimitOf` in `modules/platform/metrics.ts` with `plans.ts`.

## 7. The Console

Same codebase and database, separate host (`console.<domain>`), separate staff login.
The session cookie is **host-only** (today `fb_session` is shared with `/platform`).
The current `modules/platform` actions move in.

### 7.1 Staff & roles

| Role | Can |
|---|---|
| **Admin** | Everything: staff, account types, Comped, discounts beyond the standard, disable/delete, opening the Internal workspace (founder only). |
| **Sales** | View accounts, extend a trial once, run import/setup, send quotes and payment links. |
| **Accounts** | Invoices, payment links, verify offline payments, credit notes and refunds. |

- **2FA is required for staff** (none exists today).
- Replace the single `User.isPlatformAdmin` boolean with staff records that carry roles.
- Every audit row names the individual staff member. Today every row says "Flowbit support" (`lib/platform.ts:56`).

### 7.2 Pages

1. **Home:** signups this week, Free vs Trial vs Paid, how many are in setup, habit-formed count,
   conversions, Free workspaces ending in the next 30 days, overdue amount.
2. **Accounts list:** filters for type, status, health, salesperson and days left.
3. **Account detail:** contact, type and plan, seats used vs limit, timeline (signup, imports, plan changes,
   payments, messages), health, and the actions.
4. **Setup:** the import tool and the handover checklist (§9).
5. **Billing:** invoices, payment links, offline payments waiting for verification.
6. **Messages:** delivery log and the WhatsApp inbox (§10).
7. **Staff and Settings:** roles; prices, limits and templates editable without a code change.

### 7.3 Health score

Product usage events (login, attendance, invoice sent, task moved, lead touched, limit hit, upgrade clicked)
go into a new `UsageEvent` collection. **Recording starts in P1** so the data exists from day one.
The score is computed nightly:

| Signal | Habit-formed when |
|---|---|
| Active people | 3+ active on 5 of the last 7 days |
| Muster | Attendance on 10+ of the last 14 days |
| Folio | 5+ invoices sent |
| Work | 20+ tasks created or moved |
| Orbit | 10+ leads touched |

The score is Green, Amber or Red. The "Call today" list holds Red accounts with more than 5 seats and Free accounts in their last 30 days.

## 8. Console ↔ product connection

| Console → product | Product → Console |
|---|---|
| Type, plan or limit change applies instantly through `entitlements()` | `UsageEvent`s feed the health score |
| Announcements show as an in-app banner | A hit limit or an "Upgrade" click alerts Sales |
| Support access (consented) | "Pay now" and "Help" show up on the account |
| A verified payment unlocks the workspace at once | WhatsApp replies arrive in the Console inbox |

New pages in the customer app: **Billing** (due bills, Pay now, invoices), **Notification settings**
(WhatsApp on/off), the **Setup guide** card, and **Help** (links to the 32 FAQ videos).

**Support access:** only after the owner approves; read-only by default; time-limited.
It shows as a banner and in the customer's audit log, and the owner gets an email.
Salary, bank and PAN details are masked for Sales and Accounts.

## 9. Setup & import

- **Self-serve importer** in every workspace. **Free setup by our team only for yearly customers, at most 5 a week** (enforced from 8 Oct, step 9b; the number is in Console → Settings).
- **What can be imported:** team, Muster employees (+ salary structure, leave balances), Work projects and tasks,
  Orbit leads/contacts/companies, Folio clients and items.
- **Flow:** template → upload → preview with row errors → confirm → one **batch** that can be undone within 7 days → import history.
- **What exists:** the Muster employee/attendance importers and the Orbit lead importer. They need a member `ctx` and have no
  batch or undo, so they need a staff-run path plus an `ImportBatch` model. The Work and Folio importers are new.
- **Consent + DPA:** before staff touch data, the owner accepts a data processing agreement and approves 7 days
  of import-only access.
- **Handover checklist:** data, roles, PM invited, kickoff, training, live. The client sees it as the Setup guide card.

## 10. Communication hub (one build with `docs/specs/notifications-v2.md`)

> **As built (11 Oct 2026):** the WhatsApp provider is **Interakt**, bring your own account (BYO), not Flowbit's own Meta Cloud API. WhatsApp is **hidden** behind the `FEATURE_WHATSAPP` flag (off by default) and the Console → Settings → Features switch. The Flowbit-managed mode needs an Interakt partner deal and shows "Coming soon".

> **Reconciled 7 Oct (`docs/archive/V2-PLAN.md` §2):** this section covers WhatsApp **A**, Flowbit's own number.
> The customer's own number (WhatsApp **B**) is a **paid, pay-as-you-use wallet** add-on through a BSP partner
> (notifications-v2 §0b). It is not included in Free and is targeted for Jan 2027, not "2027 later".
> Note: BSPs report that Meta began charging in-window utility messages from 1 Oct 2026 (unverified on Meta's page),
> so keep rates as Console data.

`notifications-v2.md` (7 Oct) already specifies a `Message` model replacing the Outbox, plus retries, Resend and Meta webhooks, and a
shared WhatsApp inbox. The Console uses that same hub, and Folio's `MessageLog` and wa.me queue fold into it.

- Event → template → channel (email, WhatsApp, in-app), with opt-in/opt-out, quiet hours, a delivery log,
  retry or fall back to email, and cost tracking.
- **WhatsApp from Flowbit's own number** (Meta Cloud API direct):
  - It is a new number that is not on the WhatsApp app.
  - The **OTP and the other messages use separate numbers**, so a low quality rating on nudges can never block login.
  - Messages go **only to owners/admins** who opted in, never to customers' employees.
  - STOP is honoured the same day.
  - The inbox gets an auto-reply pointing to email until someone is assigned to it.
- **Templates:** utility for bills, PDF invoices, Razorpay payment-link buttons and reminders; authentication for OTP.
  Promotions go by email, never WhatsApp.
- **Facts checked 7 Oct 2026:**
  - Per-message pricing.
  - India rates: marketing ≈ ₹0.86, utility/authentication ≈ ₹0.115, + GST.
  - Utility messages inside an open 24-hour window are free.
  - 250 recipients a day before business verification, 2,000+ after.
  - Verification takes hours to about 10 working days, with GST/PAN/LLP documents.
- **Display name "Flowbit"** needs the website to say "Flowbit is a brand of Sanskaar Webx Services LLP".

## 11. Billing & payment

- **Supplier:** Sanskaar Webx Services LLP, with "Flowbit" as the trade name (add it to the GST registration).
  - Replace the hard-coded "Flowbit Technologies" (`env.ts:75` default and UI copy in `plan-summary.tsx`,
    `subscription-sections.tsx`, `pricing-section.tsx`, `site-footer.tsx`).
  - The invoice series must be **keyed to the supplier GSTIN**. Today it is `fb-invoice:${fy}` with a fixed `FB/` prefix (`invoices.ts:50`).
- **Due invoices before payment:** add `due` to the status enum (today `paid`/`cancelled` only), with a due date and a Razorpay payment link.
  The GST tax invoice is issued on payment.
- **Autopay:** Razorpay Subscriptions with UPI Autopay / e-mandate.
  - RBI 2026 framework: no extra authentication up to ₹15,000 per debit, plus a pre-debit notice 24 hours before.
  - Yearly plans above ₹15k need the customer to approve each debit.
  - Razorpay's UPI Autopay fee is "on request"; get it in writing.
- **Offline payment:**
  - UTR + amount + screenshot.
  - **Never activate on a screenshot alone:** activation is provisional for 7 days, then matched against the bank statement.
  - Reject duplicate UTRs. The person who records a payment cannot verify it.
- **TDS:**
  - Business customers deduct 2% (technical services, s.393(1) of the Income-tax Act 2025, ex-194J).
  - Activate the plan when the amount received is at least 98% and TDS is declared.
  - Track TDS certificates and reconcile with 26AS. Reuse the patterns in Folio's `Receipt`/`settlement`.
- **Refund and downgrade rules:** a monthly downgrade applies from the next cycle; yearly plans get no refund; failed autopay gets 7 days of grace.
- **Credit notes:** reuse the patterns in Folio `credit-notes`.
- **Reminders (email, then WhatsApp):** 15, 7, 3 and 1 days before expiry or renewal; on the due date; then 1, 3 and 7 days after.
  Today `subscription/reminders.ts` sends only at 3 and 1 days, and only for `plan === 'trial'`.
- **Pvt Ltd switch:**
  - It means a new GSTIN, a new series and a new Razorpay account.
  - **Mandates do not carry over**, so customers must re-authorise them.
  - Add an "assignment to affiliate" clause to the Terms now.
- **No GSTIN:** a billing state is required for place of supply, and the GSTIN checksum is validated.
- E-invoicing (IRN) is not needed until turnover passes ₹5 crore.

## 12. Timeline

| By | Ships |
|---|---|
| **17 Oct** | `entitlements()` + `isTrial` fix (built 8 Oct); account types (Test/Demo and Internal kept out of metrics) (built 8 Oct); email OTP + duplicate check + workspace rate limit (built 8 Oct); seat question → Free or Trial (built 8 Oct); signup → Orbit lead (built 8 Oct); Day 0 email (built 8 Oct); `UsageEvent` recording (built 8 Oct); brand/legal-name fix in UI copy |
| **1 Nov** | Free limits enforced (built 8 Oct); Free/trial expiry flow (§4.3) (built 8 Oct); Day 1/3/7 emails (built 8 Oct); export on read-only (built 8 Oct) |
| **Mid Nov** | Console host + staff roles + 2FA + per-staff audit, accounts list/detail, health score, importers + undo + consent/DPA, handover checklist (built 8 Oct) |
| **Mid Dec** | Due invoices (built 8 Oct), payment links (built 8 Oct), autopay (built 8 Oct), offline verify (built 8 Oct), TDS (built 8 Oct), reminders (built 8 Oct), credit notes (built 8 Oct); WhatsApp hub (built 8 Oct; live after Meta verification and template approval) |
| **2027** | Customer-own-number WhatsApp add-on (Tech Provider), CA partners, referral, reports (built 8 Oct, step 9b: Console → Reports) |

**Start now, outside the code:**
- Decide the domain (Meta verification, Razorpay KYC, email SPF/DKIM/DMARC and the Console host all wait on it).
- Publish Terms, Privacy, Refund and DPA pages.
- Begin Meta Business verification with the LLP documents.
- Get a new number for WhatsApp.

## 13. Open items (owner)

1. **Expiry flow in §4.3** (30 days read-only, then blocked, deletion after 90 days): is this OK?
2. **The domain.**
3. **List price from Jan 2027**, and how the campaign's "₹149" stays true.
4. **DPDP:** obligations start 13 May 2027 (they may move to 13 Nov 2026; unconfirmed). Do the DPA and the breach process before the first import.
