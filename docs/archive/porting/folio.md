# Folio: porting inventory (from Vistaar BillingOS)

Written by the Folio reader agent from a full read of `~/Downloads/Personal work/vistaar-billingos` (every model, every `lib/` file, every page, action, route handler, PDF, test and script). Builders: use this document instead of the reference code. Where it differs from the reference, the change is deliberate and the reason is given. `docs/SPEC.md` still wins on anything it states.

Paths in the left column of tables are relative to the reference repo root (`/Users/sanskaarsingh/Downloads/Personal work/vistaar-billingos`). Paths on the right are relative to `flowbit/src`.

---

## 0. The ten decisions that shape Folio

1. **Money is integer paise; field names end in `Paise`.** That matches SPEC (`totalPaise`, `balancePaise`). Rupees exist only at form input and at render.
2. **One pricing function.** `computeInvoice` (port of `lib/invoice/totals.ts`) prices invoices, quotes, credit notes and seed data. The builder calls it for the live preview, and the server calls it again on every save. The server never trusts posted totals.
3. **Tax treatment is decided on the server** from the entity's state and the place of supply, then frozen onto the document at issue. A form never decides whether tax applies.
4. **Issued means immutable.** Mongoose hooks freeze the figures. The reference guarded only `save` and `findOneAndUpdate`, so Folio must also guard `updateOne` and `updateMany`, because `ctx.db` favours `updateOne`.
5. **Money arrives against a client, not an invoice.** A receipt is recorded first and allocated as a separate act. Unallocated money is advance credit.
6. **Gapless numbering per entity, per document kind and per financial year (April to March).** A number is spent only at issue, inside the same transaction that flips the status. A voided invoice keeps its number.
7. **Invoice statuses are exactly SPEC's five:** `draft | issued | part_paid | paid | void`. The reference's `cancelled` becomes `void`. The reference's `written_off` status becomes a write-off amount (`writtenOffPaise > 0`). The status stays whatever cash, TDS and credits make it, `balancePaise` drops to 0, and the UI shows a "Written off" badge. This keeps SPEC's enum intact while keeping written-off invoices in the GST figures.
8. **TDS settles invoices through allocation.** Each allocation row carries `amountPaise` (cash) and `tdsPaise` (withheld), and both reduce the balance. The reference cleared TDS with a credit note, which wrongly reduces GST taxable value. Do not port that.
9. **Opening balance is an invoice row** with `billingType: 'opening'` (no tax, number `OB-<shortId>`, excluded from numbering, GST and revenue reports, and PDFs). Receipts can then be allocated to it, and aging, ledger and balances agree with no further special cases.
10. **Snapshots at issue.** An issued invoice stores `billTo` (client legal name, address, GSTIN, state) and `from` (entity identity and bank). The reference read client details live, so editing a client rewrote old invoice PDFs.

---

## 1. What BillingOS is (one paragraph) and the file map

BillingOS bills from several businesses ("entities"). A GST-registered entity issues **Tax Invoices** (GSTIN, HSN/SAC, CGST+SGST or IGST). A non-GST entity issues **Sale Invoices** (no tax, no GSTIN, footer "Not a tax invoice"). Clients are billed one-off, by monthly retainer (drafts generated per period), or by project milestones. Drafts carry no number. Finance issues them, which spends the next number in the entity/FY series and locks the figures. Receipts are recorded against the client, then allocated (oldest first by default). An allocated receipt moves an invoice to `part_paid` or `paid`; whatever is left over sits as advance credit. Cheques can bounce, which undoes their allocations. Bad debts can be written off. The ledger is derived on read and never stored. Aging uses buckets of not due, 1–30, 31–60, 61–90 and 90+ days. A collections queue combines human follow-ups with system reminders (a −3/0/7/15/30-day cadence, tone escalating with age; WhatsApp through `wa.me` links). Reports cover GST summary, sales register, collections, aging and revenue by client, with CSV exports. PDFs cover the invoice and the client statement.

### Reference → Folio file map

| Reference file | What it is | Folio target | Owner |
|---|---|---|---|
| `types/domain.ts` | string unions | `modules/folio/types.ts` (rename statuses per §0.7) | folio-a |
| `models/_money.ts` | `paise()`, `percent()`, `isoDate()` schema helpers | `models/folio/_fields.ts` (same three helpers) | folio-a |
| `models/Entity.ts` | billing entity | `models/folio/Entity.ts` (`FolioEntity`) | folio-a |
| `models/Client.ts` | client master with billing fields | core `Client` + `models/folio/BillingProfile.ts` | folio-a |
| `models/Invoice.ts` | invoice + hooks | `models/folio/Invoice.ts` (`Invoice`, SPEC fields) | folio-a |
| `models/CreditNote.ts` | credit note (no UI in reference) | `models/folio/CreditNote.ts` | folio-a |
| *(none)* | quotes / proforma (absent in reference) | `models/folio/Quote.ts` | folio-a |
| `models/Retainer.ts` | recurring agreement | `models/folio/Retainer.ts` (`FolioRetainer`) | folio-a |
| `models/Project.ts` | fixed-value project with milestones | `models/folio/BillingPlan.ts` (`FolioBillingPlan`) | folio-a |
| `models/ServiceItem.ts` | service catalogue | `models/folio/ServiceItem.ts` (`FolioServiceItem`) | folio-a |
| `models/Settings.ts` | single settings doc | `models/folio/FolioSettings.ts` (one per org) | folio-a |
| `models/Counter.ts` + `lib/invoice/counter.ts` | atomic series | core `lib/sequence.ts` `nextSeq` (needs `session`), else `modules/folio/counter.ts` | folio-a |
| `models/GstState.ts` + `scripts/gst-states.ts` | state code table in DB | constant `modules/folio/engine/states.ts` (no collection) | folio-a |
| `models/Receipt.ts` | receipt with embedded allocations | `models/folio/Receipt.ts` (`FolioReceipt`) | folio-b |
| `models/Followup.ts` | human chase task | `models/folio/Followup.ts` (`FolioFollowup`) | folio-b |
| `models/ReminderLog.ts` | what the system sent | `models/folio/MessageLog.ts` (`FolioMessage`, adds `kind`) | folio-b |
| `models/User.ts`, `AuditLog.ts`, `lib/auth*`, `app/login`, `app/(app)/users` | users, roles, audit | **not ported**: core auth, `Member`, `Role`, `lib/audit.ts` | — |
| `lib/money.ts` | paise math, INR format, amount in words | core `lib/money.ts` + `modules/folio/engine/money.ts` (whatever core lacks) | folio-a |
| `lib/dates.ts` | UTC-safe ISO date math | core `lib/dates.ts` + `modules/folio/engine/calendar.ts` | folio-a |
| `lib/invoice/gst.ts` | GSTIN/PAN validation, supply type | `modules/folio/engine/gst.ts` | folio-a |
| `lib/invoice/totals.ts` | pricing engine | `modules/folio/engine/totals.ts` | folio-a |
| `lib/invoice/numbering.ts` | FY, number format, billing calendar | `modules/folio/engine/numbering.ts` | folio-a |
| `lib/invoice/service.ts` | draft/issue/cancel/delete/write-off | `modules/folio/invoices/service.ts` | folio-a |
| `lib/invoice/generate.ts` | retainer and milestone drafts | `modules/folio/recurring/generate.ts` | folio-a |
| `lib/receipts/settle.ts` | settlement recalculation | `modules/folio/settlement.ts` | folio-a (folio-b imports) |
| `lib/receipts/service.ts` | record/allocate/unallocate/bounce | `modules/folio/receipts/service.ts` | folio-b |
| `lib/ledger/aging.ts` | buckets, DSO, priority | `modules/folio/engine/aging.ts` | folio-b |
| `lib/data/balances.ts` | per-client balances, outstanding list | `modules/folio/queries/balances.ts` | folio-b |
| `lib/data/ledger.ts` | statement, monthly ledger, trend | `modules/folio/queries/ledger.ts` | folio-b |
| `lib/data/dashboard.ts` | dashboard snapshot | `modules/folio/queries/dashboard.ts` | folio-b |
| `lib/data/reports.ts` | report queries | `modules/folio/queries/reports.ts` | folio-b |
| `lib/data/followups.ts` | follow-up list, chase history | `modules/folio/collections/queries.ts` | folio-b |
| `lib/data/invoices.ts`, `receipts.ts`, `clients.ts`, `entities.ts`, `engagements.ts`, `reference.ts` | list/detail queries | `modules/folio/<area>/queries.ts` | per area |
| `lib/reminders/schedule.ts` | which reminders are due | `modules/folio/collections/schedule.ts` | folio-b |
| `lib/reminders/compose.ts` | reminder text, wa.me link | `modules/folio/collections/compose.ts` | folio-b |
| `lib/reminders/run.ts` + `app/api/cron/reminders` + `scripts/send-reminders.ts` | automatic run | `modules/folio/collections/run.ts` + `app/api/folio/cron/route.ts` | folio-b |
| `lib/reports/csv.ts` | RFC 4180 CSV with BOM | `modules/folio/engine/csv.ts` | folio-b |
| `lib/email/send.ts` | Resend or log | core `lib/mail.ts` `sendMail` | — |
| `lib/pdf/brand.tsx`, `invoice.tsx` | letterhead, invoice PDF | `components/folio/pdf/*` on top of core `lib/pdf/base.tsx` | folio-a |
| `lib/pdf/statement.tsx` | statement PDF | `components/folio/pdf/StatementPdf.tsx` | folio-b |
| `lib/settings.ts` | settings read with defaults | `modules/folio/settings/queries.ts` `getFolioSettings(ctx)` | folio-a |
| `scripts/seed.ts` | sample data | `modules/folio/seed.ts` + `modules/folio/receipts/seed.ts` | a + b |
| `scripts/verify-guards.ts` | 16 live-DB integrity checks | not ported as a script; the rules are listed in §5 as hooks, and the pure parts are unit tests (§11) | — |

---

## 2. Agent split and file ownership

SPEC names one `folio` agent. If the orchestrator runs two, use this split; if it runs one, that agent owns everything below. Both agents build from this document, so imports by path resolve at typecheck time even when written in parallel.

**folio-a: engine and documents**
- `models/folio/{_fields,Entity,BillingProfile,Invoice,Quote,CreditNote,Retainer,BillingPlan,ServiceItem,FolioSettings}.ts`
- `modules/folio/engine/{money,calendar,gst,states,totals,numbering,settlement-math}.ts` and their `*.test.ts`
- `modules/folio/{types,counter,txn,context,settlement,mail}.ts`
- `modules/folio/invoices/*`, `modules/folio/quotes/*`, `modules/folio/credit-notes/*`, `modules/folio/recurring/*`, `modules/folio/settings/*`, `modules/folio/billing-profile/*`
- `components/folio/{InvoiceBuilder,LineEditor,TotalsPanel,StatusBadge,BillingProfileCard,...}.tsx`, `components/folio/pdf/{parts,InvoicePdf,QuotePdf,CreditNotePdf}.tsx`
- Routes: `/app/folio/invoices*`, `/app/folio/quotes*`, `/app/folio/credit-notes*`, `/app/folio/recurring*`, `/app/folio/settings`, `/api/folio/{invoices,quotes,credit-notes}/[id]/pdf`
- `modules/folio/seed.ts` (calls folio-b's `seedMoneyIn`)

**folio-b: money in and insight**
- `models/folio/{Receipt,Followup,MessageLog}.ts`
- `modules/folio/engine/{aging,csv}.ts` and their tests
- `modules/folio/receipts/*` (including `seed.ts` exporting `seedMoneyIn(ctx, refs)`), `modules/folio/queries/{balances,ledger,dashboard,reports}.ts`, `modules/folio/collections/{schedule,compose,run,actions,queries}.ts` (+ tests for schedule and compose)
- `components/folio/{AllocationTable,AgingBar,ReminderDialog,FollowupActions,ClientInvoicesTab,ClientLedgerTab}.tsx`, `components/folio/pdf/StatementPdf.tsx`
- Routes: `/app/folio` (dashboard), `/app/folio/receipts`, `/app/folio/receipts/new`, `/app/folio/receipts/[id]`, `/app/folio/ledger`, `/app/folio/ledger/[clientId]`, `/app/folio/collections`, `/app/folio/reports`, `/api/folio/ledger/[clientId]/{pdf,csv}`, `/api/folio/reports/[report]`, `/api/folio/cron`

Cross-agent contracts are fixed here: model names and fields (§5), `recalcInvoiceSettlement(ctx, invoiceId, session)` and `outstandingFor(ctx, invoiceId, session, excludeReceiptId?)` exported from `modules/folio/settlement.ts` (folio-a), and `listOutstanding(ctx, clientId?)` from `modules/folio/queries/balances.ts` (folio-b).

---

## 3. Core integration (what Folio uses from the foundation, and the local fallbacks)

| Need | Core (SPEC §4) | Folio rule |
|---|---|---|
| Tenancy | `requireMember()`, `ctx.db(Model)` (injects `orgId`), `tenant` plugin | Every Folio model applies the tenant plugin. All reads and writes go through `ctx.db`. **`$lookup`/`$unionWith` sub-pipelines are not covered by the wrapper's prepended `$match`; add `{ $match: { orgId } }` inside every sub-pipeline by hand.** Load every referenced id (client, entity, invoice, receipt, service item, retainer, plan, quote, bank account) through `ctx.db` before writing, so a forged id from another org is refused. Do not use `populate()` (it bypasses the org filter); use `$lookup` with an org match or a second `ctx.db` query. |
| Actions | `action(schema, fn, { perm, product: 'folio' })`, `ActionResult`, `<ActionForm>`, `useAction` | All mutations. Field errors keyed `lines.0.rate`, `allocations.2.amount` etc. |
| Transactions | replica set available | `modules/folio/txn.ts`: `withTxn(fn)` = `mongoose.connection.startSession()` + `session.withTransaction(fn)` + `endSession` (use a core helper if `lib/db` exports one). The callback can be retried, so **no `sendMail`/`audit`/`notify`/`revalidatePath` inside it**; do those after commit. If `ctx.db` methods do not forward `{ session }`, use the Model directly inside the transaction with an explicit `orgId` in every filter and document. |
| Numbering | `nextSeq(orgId, key)` | Must run inside the issue transaction. If `nextSeq` accepts `{ session }`, use key `folio:<kind>:<entityId>:<fyLabel>`. Otherwise build `modules/folio/counter.ts` on the core `Counter` model (or a local `FolioCounter { orgId, key, seq }` with a unique `{orgId,key}`) using `findOneAndUpdate({orgId,key}, {$inc:{seq:1}}, {upsert:true, new:true, session})`. Report the need. |
| Money | `rupeesToPaise`, `paiseToRupees`, `formatINR`, `formatINRCompact` | Port into `engine/money.ts` only what core lacks: `percentOf`, `roundToRupee`, `sumPaise`, `amountInWords`, `formatINRForPrint`. |
| Dates | `todayIST()`, `formatDate` ("20 Jul 2026"), `fiscalYear(date)` → `'2026-27'` | `engine/calendar.ts` ports the UTC-safe helpers core may lack: `isIsoDate`, `parseIsoDate`, `toIsoDate`, `makeIsoDate`, `daysInMonth`, `addDays`. Never `new Date('YYYY-MM-DD')` with local getters. |
| Validation | `lib/validation.ts`: `objectId`, `isoDate`, `paise`, `email`, `phone`, `gstin`, `pan`, `ifsc` | Use these. GSTIN regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`; PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`; IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`. |
| Audit, notify, mail, files | `audit()`, `notify()`, `sendMail()` (always also stores Outbox), `saveFile()`, `fileUrl()` | Audit every create/issue/void/write-off/allocation/bounce/credit note/settings change. Mail with PDF attachments. Entity logo and signature are `StoredFile`s. |
| PDF | `lib/pdf/base.tsx` `PdfDocument` (org letterhead, Work Sans, page numbers, "computer-generated" footer) | The Folio letterhead is the **entity**, not the org. If `PdfDocument` cannot take an identity override, build `components/folio/pdf/parts.tsx` with the same font registration. Print money as `Rs. 1,23,456.00` (`formatINRForPrint`) unless the registered Work Sans file is verified to contain U+20B9; the reference switched to "Rs." because the rupee glyph rendered wrong. |
| Clients | core `Client` model; Orbit owns the Clients pages | Folio adds `FolioBillingProfile` per client (§5.2) and ships the components Orbit embeds in the client tabs (§9). Mapping: reference `legalName` → `Client.name`; reference `displayName` → `Client.displayName ?? Client.name`; reference `billing*` → `Client.billingAddress`; GSTIN/PAN on core `Client.gstin/pan`. |
| State codes | core `Client.state` is a 2-letter code (e.g. `MP`) | Folio works in GST numeric codes (`23`). Convert with `engine/states.ts` (§6.2). |
| Sound/toast | `Button` plays `click`; `lib/toast` plays `success`/`error` | Nothing extra. Use `pop` for dialogs (primitives do it). |

---

## 4. Permissions

The catalog (foundation) is the source of truth for keys. If it defines different Folio keys, map them by the right-hand column. Proposed keys and role grants follow SPEC's role table: owner and admin get everything, finance gets all Folio permissions, sales gets quotes, everyone else gets none.

| Proposed key | Grants | Reference permission(s) | owner/admin | finance | sales |
|---|---|---|---|---|---|
| `folio.read` | dashboard, invoices, receipts, credit notes, recurring, ledger (read) | `invoices.read`, `receipts.read`, `retainers.read`, `ledger.read`, `clients.read` | ✓ | ✓ | – |
| `folio.invoices.write` | create/edit/delete drafts, duplicate, generate retainer/milestone drafts, edit client billing profile (not opening balance), email invoices | `invoices.write` | ✓ | ✓ | – |
| `folio.invoices.issue` | issue, void, write off, undo write-off, set opening balance, delete any draft | `invoices.issue`, `invoices.cancel` | ✓ | ✓ | – |
| `folio.receipts.write` | record, allocate, release, bounce, cancel receipts | `receipts.record`, `receipts.allocate` | ✓ | ✓ | – |
| `folio.credit_notes.write` | raise and cancel credit notes | `credit_notes.write` | ✓ | ✓ | – |
| `folio.quotes.write` | create/edit/send/accept/decline quotes and proformas (implies read of quotes); convert to an invoice draft additionally needs `folio.invoices.write` | *(new)* | ✓ | ✓ | ✓ |
| `folio.recurring.write` | create/edit/pause/end retainers and billing plans | `retainers.write`, `projects.write` | ✓ | ✓ | – |
| `folio.collections.write` | follow-ups, send reminders (email, WhatsApp) | `followups.write`, `reminders.send` | ✓ | ✓ | – |
| `folio.reports.read` | reports + CSV | `reports.read` | ✓ | ✓ | – |
| `folio.settings.manage` | entities, bank accounts (read and write), series, tax rates, terms, service items, reminder cadence | `settings.write` | ✓ | ✓ | – |

Rules carried over from the reference:
- **Prepare vs issue split:** whoever can write drafts but not issue them cannot spend a number. Hide buttons the user lacks, and always `ctx.assert` on the server.
- **Bank account numbers** are read only by the Settings page (`folio.settings.manage`) and by the PDF and mail renderers. Never send them in any other page payload; list pages show `maskAccount` (`XXXXXXXX5432`). Port `maskAccount` from `lib/utils.ts`: strip spaces; length ≤ 4 shows as-is; otherwise `'X'.repeat(min(len-4, 8)) + last4`.
- `clients.read_sensitive` existed in the reference but was never checked. In Folio, show PAN, credit limit and opening balance on the billing profile only to `folio.read`.

---

## 5. Data models (Mongo / Mongoose)

All models use the `tenant` plugin (`orgId: ObjectId ref Org, required, indexed` + timestamps). Day-level fields are `'YYYY-MM-DD'` strings validated `/^\d{4}-\d{2}-\d{2}$/`. Money fields are integers validated `Number.isInteger` (the reference `paise()` helper; null/undefined pass for "no limit" fields). Percent fields are `Number, min 0, max 100`. "Member" means a core `Member` `_id`; "person" fields (`createdBy`, `issuedBy`, `assignedTo` …) store Member ids.

`models/folio/_fields.ts` exports `paise({required?, default?})`, `percent(default)`, `isoDate({required?})`, exactly as `models/_money.ts`.

### 5.1 `FolioEntity` (`models/folio/Entity.ts`): the business that bills

| Field | Type | Notes |
|---|---|---|
| `code` | String, required, trim, uppercase | 2–10 chars `[A-Z0-9]`; unique per org |
| `legalName` | String, required | name the GSTIN belongs to |
| `tradeName` | String? | brand; footer line "Trade — a brand of Legal" when different |
| `kind` | `'gst' \| 'non_gst'`, required | **immutable once any invoice is issued from it** |
| `gstin` | String? uppercase | required iff `kind==='gst'`; forbidden for `non_gst`; first two chars must equal `address.stateCode` |
| `pan` | String? uppercase | if GSTIN present, should equal GSTIN chars 3–12 (warn) |
| `cinLlpin` | String? | printed under address when set |
| `address` | `{ line1, line2?, city, stateCode (GST 2-digit), pincode (6 digits), country default 'India' }` | `stateCode` required (drives CGST/SGST vs IGST) |
| `email`, `phone`, `website` | String? | printed on letterhead; `email` is the reminder reply-to |
| `logoFileId` | ObjectId? ref StoredFile | PDF letterhead |
| `signatoryName`, `signatoryTitle` | String? | PDF signature block, default "Authorised Signatory" |
| `signatureFileId` | ObjectId? ref StoredFile | optional signature image |
| `bankAccounts` | `[{ _id, label, accountName, accountNumber, ifsc, bankName, branch?, upiId?, isDefault: Boolean }]` | at most one `isDefault`; accountNumber 9–18 digits |
| `series` | `{ invoicePrefix: String (req), creditNotePrefix, receiptPrefix, quotePrefix, proformaPrefix, padding: Number default 4 (3–6) }` | defaults: `<CODE>`, `<CODE>-CN`, `<CODE>-RC`, `<CODE>-QT`, `<CODE>-PI`; prefix chars `[A-Z0-9-]`, 1–12; keep prefixes unique within the org |
| `defaults` | `{ paymentTermsDays: Number 15 (0–365), terms: String?, notes: String?, gstRatePercent: Number 18 }` | prefill the builder |
| `isActive` | Boolean true | inactive entities are hidden from builders |
| `isDefault` | Boolean false | exactly one default per org; GST entity first by default |

Derived, not stored: `documentType = kind === 'gst' ? 'tax_invoice' : 'sale_invoice'`. The reference stored both and enforced coherence. Deriving it removes that rule entirely.
Indexes: unique `{orgId, code}`.
Hook (pre-validate): GST ⇒ valid GSTIN whose state matches `address.stateCode`; non-GST ⇒ no GSTIN. Error copy: "A GST-registered entity must have a GSTIN." / "A non-GST entity cannot hold a GSTIN."

### 5.2 `FolioBillingProfile` (`models/folio/BillingProfile.ts`): per-client billing terms

Folio cannot add fields to core `Client`, so billing-only fields live here, one per client. Create it lazily: the first read returns defaults when it is missing.

| Field | Type | Notes |
|---|---|---|
| `clientId` | ObjectId ref Client, required | unique per org |
| `placeOfSupplyStateCode` | String? (GST 2-digit) | overrides the derived state (§6.2) |
| `defaultEntityId` | ObjectId? ref FolioEntity | builder preselects it (the reference never did) |
| `paymentTermsDays` | Number? 0–365 | falls back to entity default |
| `creditLimitPaise` | Number? (null = no limit) | warn on client page/builder when outstanding > limit |
| `defaultGstRatePercent` | Number? | falls back to entity default |
| `tds` | `{ applicable: Boolean false, section: String? (e.g. '194J'), percent: Number 0 }` | `applicable` ⇒ `percent > 0` ("Enter the TDS rate, or turn TDS off.") |
| `isExportClient` | Boolean false | defaults the builder's supply mode to Export |
| `recipients` | `[{ _id, name, email?, phone?, whatsapp?, receivesInvoices: Boolean true, receivesReminders: Boolean true, isPrimary: Boolean }]` | if empty, fall back to the core `Client.contacts` primary contact, then `Client.email`/`phone`; at most one `isPrimary` |
| `remindersPaused` | Boolean false | automatic run skips this client |
| `openingBalancePaise` | Number 0 | mirrored by the opening-balance invoice (§6.11) |
| `openingBalanceOn` | isoDate? | required when opening balance ≠ 0 |
| `notes` | String? | internal |

"GST registered" is derived from the client having a valid GSTIN (`Client.gstin`). The reference kept a separate `isGstRegistered` flag plus a "registered ⇒ GSTIN" rule; deriving it removes the rule.

### 5.3 `Invoice` (`models/folio/Invoice.ts`): SPEC cross-product model

Required SPEC fields come first; everything else is Folio's.

| Field | Type | Notes |
|---|---|---|
| `number` | String \| null | null while draft; `<prefix>/<fy>/<seq>`; opening rows `OB-<shortId>` |
| `fyLabel` | String \| null | `'2026-27'`, set at issue |
| `seq` | Number \| null | numeric sequence, for sorting and the "documents issued" report |
| `clientId` | ObjectId ref Client, required | frozen after issue |
| `entityId` | ObjectId ref FolioEntity, required | frozen |
| `documentType` | `'tax_invoice' \| 'sale_invoice'`, required | from entity at save; frozen |
| `status` | `'draft' \| 'issued' \| 'part_paid' \| 'paid' \| 'void'`, default draft | only settlement and void change it after issue |
| `issueDate` | isoDate, **always set** (draft gets the proposed date) | SPEC marks it optional; Folio always fills it. Frozen. |
| `dueDate` | isoDate, required | `issueDate + paymentTermsDays`; frozen |
| `paymentTermsDays` | Number 0–365 | |
| `currency` | `'INR'` | constant |
| `billingType` | `'one_time' \| 'retainer' \| 'milestone' \| 'advance' \| 'opening'` | `opening` = opening balance row |
| `retainerId` | ObjectId? ref FolioRetainer | |
| `retainerBillingDate` | isoDate? | the billing date this retainer invoice covers (idempotency key) |
| `planId`, `milestoneId` | ObjectId? | billing plan phase |
| `quoteId` | ObjectId? ref Quote | converted from |
| `dealId` | ObjectId? ref Deal (Orbit) | when raised from a won deal |
| `periodStart`, `periodEnd` | isoDate? | service period printed on PDF; `periodEnd ≥ periodStart` |
| `supplyType` | `'intra_state' \| 'inter_state' \| 'export' \| 'sez' \| 'exempt'` | resolved server-side; frozen |
| `placeOfSupplyStateCode` | String? | frozen |
| `clientGstin`, `entityGstin` | String? | entityGstin null on sale invoices; frozen |
| `reverseCharge` | Boolean false | tax invoice only; frozen |
| `billTo` | `{ name, addressLines: [String], city, stateCode, stateName, pincode, country, gstin? }` | snapshotted from Client at **every draft save and at issue**; frozen |
| `from` | `{ legalName, tradeName?, gstin?, pan?, cinLlpin?, addressLines, city, stateCode, stateName, pincode, email?, phone?, logoFileId?, signatoryName?, signatoryTitle?, signatureFileId? }` | snapshotted at issue; frozen |
| `bankAccountId` | ObjectId? | chosen on the builder (default bank of entity) |
| `bank` | `{ accountName, accountNumber, ifsc, bankName, branch?, upiId? }?` | snapshotted at issue; never sent to list payloads |
| `subtotalPaise` | Number | Σ line gross |
| `discountType` | `'percent' \| 'amount' \| null` | invoice-level discount |
| `discountValue` | Number ≥ 0 | percent number, or **paise** when `amount` |
| `discountPaise` | Number | line discounts + invoice discount |
| `taxablePaise`, `cgstPaise`, `sgstPaise`, `igstPaise` | Number | |
| `roundOffPaise` | Number (may be negative; integer) | |
| `totalPaise` | Number | SPEC |
| `tdsPercent`, `tdsPaise` | Number | expected TDS (printed beside total, never inside it) |
| `paidPaise` | Number 0 | Σ recorded allocations `amountPaise` |
| `tdsReceivedPaise` | Number 0 | Σ recorded allocations `tdsPaise` |
| `creditedPaise` | Number 0 | Σ issued credit notes |
| `writtenOffPaise` | Number 0 | balance at write-off time |
| `balancePaise` | Number | SPEC. `max(0, total − paid − tdsReceived − credited − writtenOff)`; 0 for draft and void |
| `purchaseOrderRef`, `subject`, `notes`, `terms`, `internalNotes` | String? | `internalNotes` never printed |
| `issuedAt`, `issuedBy` | Date?, Member? | |
| `voidedAt`, `voidedBy`, `voidReason` | | |
| `writtenOffAt`, `writtenOffBy`, `writeOffReason` | | |
| `lastEmailedAt` | Date? | |
| `createdBy` | Member | |
| `lines` | `[InvoiceLine]` (embedded, `_id: true`) | |

`InvoiceLine`: `{ _id, position: Number (1-based), serviceItemId?: ObjectId, description: String (req), hsnSac?: String, quantity: Number > 0 (3 decimals), unit: String default 'nos', ratePaise: Number (req, ≥0), discountPercent: Number 0, discountPaise: Number (line share incl. apportioned invoice discount), taxablePaise, gstRatePercent, cgstPaise, sgstPaise, igstPaise, lineTotalPaise }`.

Indexes:
- **unique `{orgId, entityId, number}` with `partialFilterExpression: { number: { $type: 'string' } }`.** The reference used `{ unique: true, sparse: true }` on a compound index with `number` defaulting to `null`, which indexes drafts as `(entityId, null)`. A second draft from the same entity then collides (E11000). The seed never creates drafts, so the bug went unnoticed.
- `{orgId, clientId, issueDate: -1}`, `{orgId, status, dueDate}`, `{orgId, entityId, fyLabel, seq}`, `{orgId, retainerId, retainerBillingDate}`, `{orgId, quoteId}`, `{orgId, milestoneId}`.

Hooks (port of `models/Invoice.ts`, extended):
1. **pre('validate') coherence**, with errors as in the reference:
   - draft ⇒ no number ("A draft invoice cannot hold a number."); non-draft ⇒ number ("An issued invoice must have a number.")
   - `dueDate ≥ issueDate` ("The due date cannot fall before the invoice date.")
   - sale invoice ⇒ no CGST/SGST/IGST > 0, no `entityGstin`, no `reverseCharge` ("A sale invoice cannot carry tax, a GSTIN or reverse charge.")
   - IGST > 0 ⇒ CGST = SGST = 0 ("An invoice cannot charge IGST and CGST/SGST together.")
   - `cgstPaise === sgstPaise` ("CGST and SGST must be exactly equal.")
2. **post('init')** stores `doc.$locals.loadedStatus = doc.status`.
3. **pre('save') guard**: if not new and `loadedStatus` exists and ≠ `'draft'`, then any modified field in `FROZEN` throws "Invoice {number} is issued and its figures are locked. Raise a credit note instead."
4. **pre('findOneAndUpdate'), pre('updateOne'), pre('updateMany') guard**: collect top-level field names from the update (operators' keys split on `.`, plus bare keys). If any is in `FROZEN`, load the target(s) with the same filter (`select status number`). If any target's status ≠ draft, throw. (The reference guarded only `save` and `findOneAndUpdate`.)

`FROZEN = number, fyLabel, entityId, clientId, documentType, issueDate, dueDate, supplyType, placeOfSupplyStateCode, clientGstin, entityGstin, reverseCharge, billTo, from, subtotalPaise, discountPaise, taxablePaise, cgstPaise, sgstPaise, igstPaise, roundOffPaise, totalPaise, tdsPercent, tdsPaise, lines`.
Writable after issue: `status`, `paidPaise`, `tdsReceivedPaise`, `creditedPaise`, `writtenOffPaise`, `balancePaise`, void fields, write-off fields, `internalNotes`, `lastEmailedAt`. The settlement writer therefore uses a normal `updateOne`. The reference's raw-collection write (`Invoice.collection.updateOne`) is unnecessary; do not port it.

### 5.4 `Quote` (`models/folio/Quote.ts`): new, absent in reference

| Field | Type | Notes |
|---|---|---|
| `kind` | `'quote' \| 'proforma'` | PDF title "Quotation" / "Proforma Invoice" |
| `number` | String, required | assigned at creation from `quotePrefix`/`proformaPrefix`, per entity per FY (not statutory; gaps are fine) |
| `entityId`, `clientId` | ObjectId, required | |
| `dealId` | ObjectId? (Orbit Deal) | |
| `status` | `'draft' \| 'sent' \| 'accepted' \| 'declined' \| 'converted'` | "Expired" is derived: `status ∈ {draft,sent}` and `validUntil < today` |
| `quoteDate`, `validUntil` | isoDate | `validUntil ≥ quoteDate`; default validity from settings (15 days) |
| `supplyType`, `placeOfSupplyStateCode`, `documentType` | as Invoice | resolved the same way, recomputed on every save |
| pricing fields | same as Invoice (`subtotalPaise … totalPaise`, `discountType/Value/Paise`, `lines`) | priced by `computeInvoice` |
| `subject`, `notes`, `terms` | String? | |
| `sentAt`, `acceptedAt`, `declinedAt`, `declineReason` | | |
| `convertedInvoiceId` | ObjectId? | |
| `createdBy` | Member | |

Indexes: unique `{orgId, entityId, number}`, `{orgId, clientId, quoteDate: -1}`, `{orgId, status}`. No immutability hooks: a quote stays editable until `converted`.

### 5.5 `CreditNote` (`models/folio/CreditNote.ts`)

The reference had a model only (no service, no UI, no issue path). Folio simplifies: a credit note is issued on creation (no draft state) and is always against one invoice.

| Field | Type | Notes |
|---|---|---|
| `number`, `fyLabel`, `seq` | String/Number, required | `creditNotePrefix` series per entity per FY of `noteDate` |
| `entityId`, `clientId`, `invoiceId` | ObjectId, required | copied from the invoice |
| `documentType` | from invoice | sale-invoice credit notes carry no tax |
| `status` | `'issued' \| 'cancelled'` | |
| `noteDate` | isoDate | `issueDate(invoice) ≤ noteDate ≤ today` |
| `reason` | `'post_sale_discount' \| 'deficiency' \| 'correction' \| 'cancellation' \| 'other'` | |
| `reasonText` | String, required (≥ 5 chars) | printed |
| `supplyType`, `placeOfSupplyStateCode`, `clientGstin`, `entityGstin` | copied from invoice | |
| `lines` | `[{ invoiceLineId, description, hsnSac, taxablePaise, gstRatePercent, cgstPaise, sgstPaise, igstPaise, lineTotalPaise }]` | |
| `taxablePaise`, `cgstPaise`, `sgstPaise`, `igstPaise`, `roundOffPaise`, `totalPaise` | | |
| `issuedAt`, `issuedBy`, `cancelledAt`, `cancelledBy`, `cancelReason` | | |

Hook (pre-validate): `cgst === sgst`; no IGST with CGST/SGST; sale invoice ⇒ no tax; `totalPaise > 0`. Figures are frozen except the cancel fields (same guard pattern as Invoice). Indexes: unique `{orgId, entityId, number}`, `{orgId, invoiceId}`, `{orgId, clientId, noteDate: -1}`.

### 5.6 `FolioReceipt` (`models/folio/Receipt.ts`)

| Field | Type | Notes |
|---|---|---|
| `number`, `fyLabel`, `seq` | | `receiptPrefix` series per entity per FY of `receivedOn`. The reference used a hard-coded `RCP` for every entity, giving duplicate-looking numbers across entities. |
| `entityId`, `clientId` | ObjectId, required | entity = whose bank received it |
| `receivedOn` | isoDate, required | ≤ today |
| `amountPaise` | Number, required, > 0 | cash received |
| `mode` | `'bank_transfer' \| 'upi' \| 'cheque' \| 'cash' \| 'card' \| 'gateway' \| 'adjustment' \| 'other'` | default `bank_transfer` |
| `reference` | String? | UTR, cheque number or gateway id |
| `bankAccountId` | ObjectId? | must be one of the entity's bank accounts |
| `instrumentDate` | isoDate? | cheque date |
| `status` | `'recorded' \| 'bounced' \| 'cancelled'` | only `recorded` counts anywhere |
| `bouncedOn`, `bounceReason` | | |
| `cancelledAt`, `cancelledBy`, `cancelReason` | | the reference had the status with no path to it |
| `notes` | String? | |
| `allocations` | `[{ _id, invoiceId, amountPaise: Number ≥ 0, tdsPaise: Number ≥ 0 default 0, allocatedOn: isoDate, allocatedBy: Member }]` | embedded |
| `recordedBy` | Member | |

Virtuals: `allocatedPaise = Σ allocations.amountPaise`, `unallocatedPaise = amountPaise − allocatedPaise`.
Hook (pre-validate, from the reference):
- `amountPaise > 0` ("A receipt must be for more than zero.")
- `Σ allocations.amountPaise ≤ amountPaise` ("This receipt has only ₹X left to allocate.")
- no invoice twice ("An invoice can only appear once in a receipt's allocations.")
- each allocation `amountPaise + tdsPaise > 0`.

Indexes: unique `{orgId, entityId, number}`, `{orgId, clientId, receivedOn: -1}`, `{orgId, status}`, `{orgId, 'allocations.invoiceId': 1}`.

### 5.7 `FolioRetainer` (`models/folio/Retainer.ts`)

| Field | Type | Notes |
|---|---|---|
| `clientId`, `entityId` | ObjectId, required | |
| `name` | String 2–120 | |
| `description` | String? | becomes the line description |
| `hsnSac` | String? | |
| `amountPaise` | Number > 0 | per period (not per month) |
| `gstRatePercent` | Number default 18 | forced 0 for non-GST entity |
| `frequency` | `'monthly' \| 'quarterly' \| 'half_yearly' \| 'annual'` | |
| `startDate` | isoDate, required | |
| `endDate` | isoDate? | ≥ startDate ("A retainer cannot end before it starts.") |
| `billingDay` | Number 1–31 default 1 | clamped to month length |
| `billInAdvance` | Boolean true | decides the service period |
| `status` | `'active' \| 'paused' \| 'ended'` | |
| `autoGenerate` | Boolean true | the daily cron creates drafts for it |
| `paymentTermsDays` | Number? | falls back to profile, then entity |
| `notes` | String? | |
| `createdBy` | Member | |

There is no `nextInvoiceOn`. The reference stored it and advanced it one period per run, so catch-up needed repeated clicks and a voided or deleted period was never billed again. Folio computes due billing dates statelessly (§6.9). Index `{orgId, clientId}`, `{orgId, status}`.

### 5.8 `FolioBillingPlan` (`models/folio/BillingPlan.ts`): reference "Project"

Named "billing plan" so it does not clash with Work's `Project`; optionally linked to one.

| Field | Type | Notes |
|---|---|---|
| `clientId`, `entityId` | ObjectId, required | |
| `workProjectId` | ObjectId? ref Project (Work) | optional link |
| `code` | String | `PLN-0001` via `nextSeq(orgId,'folio:plan')`; unique per org |
| `name`, `description`, `hsnSac` | | |
| `totalValuePaise` | Number > 0 | agreed value **before tax** |
| `gstRatePercent` | Number 18 | |
| `startDate`, `targetEndDate` | isoDate? | |
| `status` | `'draft' \| 'active' \| 'on_hold' \| 'completed' \| 'cancelled'` | |
| `milestones` | `[{ _id, position, name, description?, percentOfTotal: Number \| null (0–100], amountPaise: Number \| null, dueOn?: isoDate, status: 'pending' \| 'invoiced' \| 'paid' \| 'cancelled', invoiceId?: ObjectId, completedOn?: isoDate }]` | |
| `notes`, `createdBy` | | |

Hook (from reference): positions unique ("Two phases cannot share a position."); each milestone has exactly one of `percentOfTotal` / `amountPaise` ("Phase "X" needs either a share of the project value or a flat amount — not both, and not neither."). Folio adds: Σ percent ≤ 100 and Σ resolved amounts ≤ total value (refuse); warn when Σ ≠ total.

### 5.9 `FolioServiceItem` (`models/folio/ServiceItem.ts`)

`{ code: String (unique per org), name, description?, hsnSac?, unit: String default 'nos', defaultRatePaise: Number, defaultGstRatePercent: Number 18, isActive: Boolean true }`. Archived, never deleted. Index `{orgId, isActive, name}`.

### 5.10 `FolioFollowup` (`models/folio/Followup.ts`)

`{ clientId (req), invoiceId?, dueOn: isoDate (req), channel: 'email'|'whatsapp'|'call'|'meeting'|'note' (default call), subject?, notes?, status: 'open'|'done'|'snoozed'|'cancelled', assignedTo: Member?, outcome?, promisedOn?: isoDate, completedAt?: Date, completedBy?: Member, snoozedUntil?: isoDate, createdBy }`.
Hook: `done` ⇒ `completedAt`; `snoozed` ⇒ `snoozedUntil`. Indexes `{orgId, status, dueOn}`, `{orgId, clientId, dueOn: -1}`, `{orgId, invoiceId}`, `{orgId, assignedTo, status, dueOn}`.

### 5.11 `FolioMessage` (`models/folio/MessageLog.ts`): reference ReminderLog plus `kind`

`{ kind: 'reminder'|'invoice'|'quote'|'statement', clientId (req), invoiceId?, quoteId?, channel: 'email'|'whatsapp', status: 'queued'|'sent'|'logged'|'failed'|'skipped', offsetDays?: Number (null = sent by hand), toAddress, subject?, body?, outboxId?, error?, sentAt?: Date, sentBy?: Member }`.
**Partial unique index (makes the automatic run idempotent):** `{orgId, invoiceId, channel, offsetDays}` unique with `partialFilterExpression: { kind: 'reminder', invoiceId: {$type:'objectId'}, offsetDays: {$type:'number'}, status: {$in: ['sent','logged','queued','skipped']} }`. Other indexes: `{orgId, invoiceId, createdAt: -1}`, `{orgId, clientId, createdAt: -1}`.
Status meaning: `sent` = provider accepted; `logged` = no provider key, stored in Outbox only (never pretend it reached the client); `queued` = WhatsApp composed for a human to send; `failed` = provider error (not unique-indexed, so it retries next run); `skipped` = an older missed offset suppressed by catch-up (§6.14).

### 5.12 `FolioSettings` (`models/folio/FolioSettings.ts`): one per org

`{ orgId unique, reminders: { enabled: true, offsetDays: [-3, 0, 7, 15, 30], channels: ['email'] }, invoicing: { roundOffTotal: true, taxRates: [0, 5, 12, 18, 28], showTdsOnInvoice: true, defaultValidityDays: 15 } }`.
Created on first read through an upsert with `setDefaultsOnInsert` (the reference pattern in `lib/settings.ts`). The reference defined FY start month, default GST rate, send-window hour, `stopWhenPaid` and `showTdsOnInvoice`, but read none of them, and the builder hard-coded round-off on. Folio keeps only what it reads: FY is always April–March, and stopping when paid is implicit (only `balance > 0` is chased).

---

## 6. Domain logic: rules and formulas in plain words

### 6.1 Money (`engine/money.ts`, from `lib/money.ts`)
- `toPaise(rupees) = Math.round(rupees × 100)`; throws on non-finite. `toRupees(p) = Math.round(p) / 100`.
- `percentOf(base, pct) = Math.round(base × pct / 100)`; throws on non-finite pct.
- `roundToRupee(p) = Math.round(p / 100) × 100`. JavaScript rounds .5 toward +∞, so ₹0.50 rounds up, and the round-off range is −₹0.49 to +₹0.50.
- `sumPaise(list)` = plain sum.
- `formatINRForPrint(p) = 'Rs. ' + en-IN with 2 decimals` (e.g. `Rs. 1,23,456.00`).
- `amountInWords(p)` uses the Indian scale (Crore, Lakh, Thousand, Hundred), then "Rupees", then "and N Paise" if any, then "Only"; negative values get a "Minus " prefix. Example: 5,076,900 paise → "Fifty Thousand Seven Hundred Sixty Nine Rupees Only". Port it verbatim, including `integerToWords` and `twoDigitsToWords`.
- `formatINRCompact`: ≥1 Cr → `₹x.xxCr`, ≥1 L → `₹x.xxL`, ≥1 K → `₹x.xK`, else `₹x`. Use core's if it exists.

### 6.2 States and place of supply (`engine/states.ts`, `engine/gst.ts`)

State table (GST code, name, accepted letter codes, UTGST label). Use it to convert core `Client.state` and `billingAddress.state` (letters or full name, case-insensitive) to a GST code, and to show names on PDFs as "Madhya Pradesh (23)".

| Code | Name | Letters | UTGST | | Code | Name | Letters | UTGST |
|---|---|---|---|---|---|---|---|---|
| 01 | Jammu and Kashmir | JK | | | 20 | Jharkhand | JH | |
| 02 | Himachal Pradesh | HP | | | 21 | Odisha | OD, OR | |
| 03 | Punjab | PB | | | 22 | Chhattisgarh | CG, CT | |
| 04 | Chandigarh | CH | ✓ | | 23 | Madhya Pradesh | MP | |
| 05 | Uttarakhand | UK, UT | | | 24 | Gujarat | GJ | |
| 06 | Haryana | HR | | | 26 | Dadra and Nagar Haveli and Daman and Diu | DH, DN, DD | ✓ |
| 07 | Delhi | DL | | | 27 | Maharashtra | MH | |
| 08 | Rajasthan | RJ | | | 29 | Karnataka | KA | |
| 09 | Uttar Pradesh | UP | | | 30 | Goa | GA | |
| 10 | Bihar | BR | | | 31 | Lakshadweep | LD | ✓ |
| 11 | Sikkim | SK | | | 32 | Kerala | KL | |
| 12 | Arunachal Pradesh | AR | | | 33 | Tamil Nadu | TN | |
| 13 | Nagaland | NL | | | 34 | Puducherry | PY | |
| 14 | Manipur | MN | | | 35 | Andaman and Nicobar Islands | AN | ✓ |
| 15 | Mizoram | MZ | | | 36 | Telangana | TG, TS | |
| 16 | Tripura | TR | | | 37 | Andhra Pradesh | AP | |
| 17 | Meghalaya | ML | | | 38 | Ladakh | LA | ✓ |
| 18 | Assam | AS | | | 97 | Other Territory | OT | ✓ |
| 19 | West Bengal | WB | | | | | | |

UTGST is a label only. For an intra-state supply whose place of supply has ✓, print "UTGST" where it would say "SGST". Amounts are identical, so store it as `sgstPaise`. The reference ignored this.

Exports from `gst.ts` (verbatim port): `isValidGstin`, `isValidPan`, `stateCodeOfGstin` (first 2 chars, null if invalid), `panOfGstin` (chars 3–12), `gstinMatchesState`, `resolveSupplyType`, `isTaxable`, `SUPPLY_TYPE_LABELS` (`Intra-state (CGST + SGST)`, `Inter-state (IGST)`, `Export (zero-rated)`, `SEZ supply (zero-rated)`, `Not taxable`). Add `clientStateCode(client, profile)`.

**Client's GST state code, in priority order:**
1. `profile.placeOfSupplyStateCode`
2. first two digits of a valid `Client.gstin`
3. `Client.state` letters converted through the table
4. `Client.billingAddress.state` (letters or name) converted through the table
5. otherwise `null`

**Place of supply for a document:** the explicit override on the document, else the client's code above.

**`resolveSupplyType({ documentType, entityStateCode, placeOfSupplyStateCode, isExport, isSez })`:**
1. sale invoice → `exempt`
2. `isExport` → `export`
3. `isSez` → `sez`
4. either state missing → `inter_state` (IGST is the recoverable mistake: the client can still claim it, whereas a wrong CGST/SGST split cannot be fixed)
5. same state → `intra_state`
6. otherwise → `inter_state`

`isTaxable` = intra or inter only. Export and SEZ are zero-rated: lines keep their taxable value and carry no tax.

**Supply mode on the builder (tax invoices only):** `auto | export | sez`. It defaults to `export` when the client's billing country is not India or `profile.isExportClient` is set. The reference engine supported export/SEZ, but its form never set them.

**Client GSTIN check (on the billing profile and Orbit's client form):** a GSTIN that is valid but whose first two digits differ from the billing state is an error: "This GSTIN is registered in state 27, but the billing address is in state 23." Orbit owns the client form; Folio exports `gstinMatchesState` for it.

### 6.3 The pricing engine (`engine/totals.ts`, verbatim port of `lib/invoice/totals.ts`)

Input: `{ lines: [{ description, quantity, rate (paise), discountPercent?, gstRatePercent }], supplyType, discountType?, discountValue? (percent number, or paise when 'amount'), roundOffTotal? (default true), tdsPercent? }`.
Output: `{ lines: [{ grossValue, discountAmount, taxableValue, gstRatePercent, cgstAmount, sgstAmount, igstAmount, lineTotal }], subtotal, discountAmount, taxableValue, cgstAmount, sgstAmount, igstAmount, taxAmount, roundOff, total, tdsAmount, expectedReceipt }` (map onto the `*Paise` model fields in the service). Also export `balanceDue(total, paid, credited) = max(0, total − paid − credited)`.

The order is fixed by the tax rules; changing it changes the tax:
1. **Line gross** = `round(rate × round(quantity × 1000) / 1000)`. Quantity carries 3 decimals, so 7.5 h × ₹2,000 = ₹15,000.
2. **Line discount** = `percentOf(gross, min(discountPercent, 100))` when > 0. afterLine = gross − line discount.
3. **Invoice discount**, taken on Σ afterLine:
   - percent: `percentOf(base, min(value, 100))`
   - amount: `min(round(value), base)`, so the bill can never go negative
   - none, or value ≤ 0: 0
4. **Apportion** the invoice discount across lines pro rata to afterLine. Each share is `floor(total × weight / Σweights)`; the rounding remainder goes to the line with the largest weight (the first such line on ties), so the shares add back exactly.
5. **Line taxable** = afterLine − share.
6. **Line tax:**
   - rate = taxable supply ? line rate : 0; `tax = percentOf(lineTaxable, rate)`
   - intra-state: `half = round(tax/2)`, CGST = half, SGST = tax − half; then **level** both to `min(cgst, sgst)` and reduce `lineTotal` by the difference. When the line tax is an odd number of paise, the charged tax is one paisa below rate × taxable. Keep this: CGST must equal SGST, and the hook refuses otherwise.
   - inter-state: IGST = tax
   - stored `gstRatePercent` = the effective rate (0 on exempt/export/SEZ)
7. Line total = taxable + CGST + SGST + IGST. Invoice sums are taken over the lines.
8. **Round off once:** `beforeRounding = taxable + tax`; `total = roundOffTotal === false ? beforeRounding : roundToRupee(beforeRounding)`; `roundOff = total − beforeRounding`. Folio passes `FolioSettings.invoicing.roundOffTotal`.
9. **Expected TDS** = `percentOf(taxable, tdsPercent)`. It is computed on the value of the service, never on the tax. Expected receipt = total − TDS.

Worked examples (these are the reference tests; keep them):
- ₹1,00,000 @ 18%, intra-state → CGST 9,000 + SGST 9,000, total 1,18,000. Inter-state → IGST 18,000, total 1,18,000.
- Same line on an exempt supply (sale invoice) → tax 0, total 1,00,000, line rate stored 0.
- Line discount 10% on ₹1,00,000, inter-state → taxable 90,000, IGST 16,200, total 1,06,200.
- Lines ₹60,000 @ 18% + ₹40,000 @ 5% with a flat ₹10,000 discount, inter-state → taxable 54,000 / 36,000, IGST 9,720 + 1,800 = 11,520.
- 25% invoice discount on ₹1,00,000 → discount 25,000, taxable 75,000.
- Flat ₹9,999 discount on ₹1,000 → taxable 0, total 0.
- ₹1 flat discount over three ₹1,000 lines → shares sum to 100 paise.
- TDS 10% on ₹1,00,000 inter-state → TDS 10,000, expected receipt 1,08,000.
- No lines → total 0, no throw.
- Σ lineTotal + roundOff = total, always.

**Default line GST rate:** item default → profile default → entity default → 18. Allowed rates = `FolioSettings.invoicing.taxRates`. Sale invoices force every line to 0, and the builder hides the GST column.

### 6.4 Numbering and financial year (`engine/numbering.ts`, verbatim port)
- `financialYearOf(date)`: month ≥ April → `${Y}-${(Y+1)%100 padded 2}`, else from Y−1. `2026-08-14 → 2026-27`, `2027-03-31 → 2026-27`, `1999-04-01 → 1999-00`. Use core `fiscalYear` if it is identical.
- `financialYearRange('2026-27') → { start: '2026-04-01', end: '2027-03-31' }`; throws on a malformed label. The reference test named "ends on 29 February in a leap year" actually asserts `2028-03-31` (mislabelled). Keep the assertions and rename it "ends on 31 March, leap year or not".
- `formatDocumentNumber(prefix, fy, seq, padding=4) = ${prefix}/${fy}/${seq padded}` (`VWX/2026-27/0007`); never truncates a sequence longer than the padding.
- `dueDateFor(issueDate, terms) = addDays(issueDate, max(0, round(terms)))`.
- Billing calendar: `monthsPerPeriod`, `addBillingPeriod`, `firstBillingDate`, `servicePeriodFor`, `dueBillingDates` (§6.9).

**Series rules:**
- Counter key: org + entity + kind (`invoice | credit_note | receipt | quote | proforma`) + FY. The FY comes from the document's own date (issue date, note date, receipt date, quote date).
- Invoices: number spent **inside the issue transaction** (counter `$inc` + status flip together). If the transaction aborts, the increment rolls back, so there are no gaps. Concurrent issues both write the counter document, which forces a write conflict; Mongo retries the loser.
- A void keeps its number ("a statutory series may contain cancellations, but it may not contain gaps"). Drafts are deleted, never voided, and hold no number.
- Changing a prefix mid-year changes the prefix of future numbers only; the sequence continues.
- Peek ("Will be issued as VWX/2026-27/0008") reads `seq + 1` without spending it. It is display only, and is the reference `peekDocumentNumber`, which was exported but never used.
- **New in Folio:** refuse issuing with an `issueDate` later than today ("Invoices cannot be dated in the future."). Refuse an `issueDate` earlier than the latest issued invoice date in the same entity+FY series ("VWX's last invoice is dated 20 Oct 2026. Date this one on or after it, so the series stays in order."). The reference allowed both.

### 6.5 Invoice lifecycle (state machine)

```
            create/edit (folio.invoices.write)
  (none) ──────────────▶ DRAFT ──delete──▶ (gone; frees milestone/quote/retainer period)
                           │
                           │ issue (folio.invoices.issue, transaction: number + snapshots + status)
                           ▼
         ┌──────────── ISSUED ◀──────────────┐
         │   settlement (derived, §6.7)      │
         ▼                                   │
     PART_PAID ◀──────────▶ PAID ────────────┘   (back down when a receipt bounces/is released/CN cancelled)
         │
  void (only if paid = tdsReceived = credited = 0; reason; number kept)  ──▶ VOID (terminal)
  write-off (balance > 0; reason) ──▶ status unchanged, writtenOffPaise = balance, balance 0, badge "Written off"
  undo write-off (folio.invoices.issue) ──▶ writtenOffPaise = 0, recalc
```

Service functions (`modules/folio/invoices/service.ts`), port of `lib/invoice/service.ts`:
- **`createDraftInvoice(ctx, input)`** loads entity (active, same org) and client (same org, `status: 'active'`) through `ctx.db`, plus the billing profile. `priceInvoice` resolves place of supply and supply type, converts rupee rates to paise, takes TDS % from the input or else from the profile (`tds.applicable ? percent : 0`), and calls `computeInvoice`. It then builds the fields: `documentType` from the entity; `entityGstin` only on tax invoices; `reverseCharge` only on tax invoices; notes and terms default to entity defaults when blank; `billTo` snapshot; `dueDate = dueDateFor`. It creates the invoice with `status: 'draft'` and `createdBy`, and returns the id.
- **`updateDraftInvoice(ctx, id, input)`** refuses unless draft ("Only a draft can be edited. Raise a credit note instead."), replaces everything, and saves.
- **`issueInvoice(ctx, id, { issueDate? })`** runs in one transaction:
  1. load the invoice; it must be a draft ("That invoice has already been issued."), have ≥1 line ("An invoice needs at least one line.") and `total > 0` ("An invoice must be for more than zero.")
  2. if `issueDate` was changed in the issue dialog, re-run pricing with the new date and recompute `dueDate`
  3. apply the date rules of §6.4
  4. tax invoice: if the client has a GSTIN it must be valid; reverse charge requires a client GSTIN
  5. compute `fyLabel`; take the number; snapshot `from` and `bank`; refresh `billTo`
  6. set number, fyLabel, seq, status `issued`, issuedAt, issuedBy and `balancePaise = total`
  7. if `milestoneId`: set that milestone `status: 'invoiced'`, `invoiceId`
  8. if `quoteId`: quote `status: 'converted'`, `convertedInvoiceId`

  After commit: audit, notify, revalidate. Toast "Invoice VWX/2026-27/0007 issued".
- **`voidInvoice(ctx, id, reason)`** requires a reason ("A void needs a reason on the record."). Status must be issued, part_paid or paid; refuse a draft ("Delete the draft instead.") and a void ("That invoice is already void."). Refuse when `paidPaise + tdsReceivedPaise + creditedPaise > 0` ("Money or a credit note is already applied to this invoice. Release the payment or cancel the credit note first, or raise a credit note instead."). The reference checked only `amountPaid`. Sets status `void`, voided fields and balance 0. Releases links: milestone back to `pending` with `invoiceId: null`; quote back to `accepted` with `convertedInvoiceId: null`. A retainer period becomes due again automatically (§6.9). Toast: "Invoice VWX/2026-27/0007 voided. Its number stays spent."
- **`deleteDraftInvoice(ctx, id)`** deletes only `status: 'draft'` ("Only a draft invoice can be deleted."). Clears `milestone.invoiceId` (the reference left it set, so the phase could never be invoiced again) and reverts the quote to `accepted`. Permission: `folio.invoices.issue`, or `folio.invoices.write` when you created the draft.
- **`writeOffInvoice(ctx, id, reason)`** requires issued or part_paid and `balance > 0` ("Only an issued or part-paid invoice with a balance can be written off."). Sets `writtenOffPaise = balancePaise`, write-off fields, then recalc. **`undoWriteOff`** sets `writtenOffPaise = 0` and recalcs.
- **`duplicateInvoice(ctx, id)`** creates a new draft with the same entity, client, lines, discount and notes, and today's date. Cheap and handy for one-offs.

### 6.6 Notifications on invoices
- Draft created or generated by someone without `folio.invoices.issue` → `notify` every member who has it: "Draft invoice for Aarav Retail (₹1,47,500) is ready to issue", href to the invoice. Retainer generation sends one summary: "4 retainer drafts created for October 2026".
- Receipt bounced → notify the invoice creators: "Payment VWX-RC/2026-27/0012 from Kabir Foods bounced. 2 invoices are owed again."
- Follow-up assigned to someone else → notify the assignee.

### 6.7 Settlement (`modules/folio/settlement.ts` + pure `engine/settlement-math.ts`)

`recalcInvoiceSettlement(ctx, invoiceId, session)` is the **single writer** of `paidPaise`, `tdsReceivedPaise`, `creditedPaise`, `balancePaise` and post-issue `status`. It always recomputes from source rows and never increments, so a double call or a missed call converges on the truth:
- `paid` = Σ `allocations.amountPaise` and `tds` = Σ `allocations.tdsPaise` over **recorded** receipts with an allocation to this invoice (`$match` orgId + status recorded + `allocations.invoiceId`, `$unwind`, `$match` again, `$group`)
- `credited` = Σ `totalPaise` of **issued** credit notes with this `invoiceId`
- pure `deriveSettlement({ status, total, paid, tds, credited, writtenOff })`:
  - `draft`/`void` → unchanged, balance 0
  - otherwise `settled = paid + tds + credited`; `status = settled ≥ total ? 'paid' : settled > 0 ? 'part_paid' : 'issued'`
  - `balance = max(0, total − settled − writtenOff)`
- write with a normal `updateOne` (the guard allows it because no frozen field is touched)

`recalcForReceipt(ctx, receiptId, session)` recalculates every invoice the receipt touches; use it on bounce and cancel.

`outstandingFor(ctx, invoiceId, session, excludeReceiptId?)` reads fresh from source rows (not the denormalised fields): `{ total, settled, outstanding = total − settled − writtenOff, number, status, clientId, entityId }`. It is used by the allocation and credit-note guards.

**Why it is race-safe (keep this property):** every allocation path calls `recalcInvoiceSettlement` inside the same transaction, which writes the invoice document. Two concurrent allocations to one invoice from different receipts therefore conflict on that document; Mongo aborts one with a transient error, `withTransaction` retries it, and the retry re-reads outstanding and refuses the over-allocation. Do not move the recalc outside the transaction. Snapshot isolation alone would let both through.

### 6.8 Receipts and allocation (`modules/folio/receipts/service.ts`)

**`recordReceipt(ctx, input)`** runs in one transaction:
1. `amount > 0`; entity in org and active; client in org; bank account (if given) belongs to the entity.
2. Number from the entity's `receiptPrefix` series, FY of `receivedOn`.
3. Build allocations: explicit rows `[{ invoiceId, amount, tds }]` (rupees → paise; drop rows where both are 0), or, if the user pressed "Apply oldest first" without amounts, `spendOldestFirst`. That function takes the client's open invoices for **the same entity**, sorted `dueDate asc, issueDate asc`, and slices `min(outstanding, remaining)` from each until the money runs out.
4. For each allocation, `outstandingFor` with fresh reads must show: invoice `clientId` = receipt client, `entityId` = receipt entity, status `issued` or `part_paid`, and `amount + tds ≤ outstanding`. Otherwise refuse: "Invoice VWX/2026-27/0007 has only ₹12,000.00 outstanding." / "That invoice belongs to another client." / "Money received into Vistaar Solutions cannot settle a Vistaar WebX invoice." The reference checked none of client, entity or status, so a crafted request could settle another client's or a draft invoice.
5. `Σ amount ≤ receipt amount` ("This receipt has only ₹X to allocate."). TDS is not cash, so it does not count against the receipt amount.
6. Create the receipt, then recalc each touched invoice.

Return `{ id, number, allocated, unallocated }`. Toast: "VWX-RC/2026-27/0012 recorded. ₹50,000 is held as advance credit." or "…recorded and applied."

**`allocateReceipt(ctx, receiptId, invoiceId, amount, tds)`** applies leftover credit. In a transaction: the receipt must be `recorded` ("A bounced or cancelled receipt cannot be allocated."); `alreadyAllocated + amount ≤ receipt.amount` ("This receipt has only ₹X left to allocate."); same client, entity and status checks; `outstandingFor(invoice, excludeReceiptId = this receipt)`; `wouldBe = existingRowFor(invoice).amount + tds + new` must be ≤ outstanding. Top up the existing row, never add a duplicate. Save, recalc.

**`unallocateReceipt(ctx, receiptId, allocationId)`** removes the row and recalcs the invoice. Toast: "Released. VWX/2026-27/0007 is owed again and ₹X is free credit."

**`markReceiptBounced(ctx, receiptId, bouncedOn, reason)`** requires `recorded` ("Only a recorded receipt can be marked bounced."), sets the status, keeps the allocations (for the record, but they no longer count), then `recalcForReceipt`. **`cancelReceipt(ctx, receiptId, reason)`** does the same with status `cancelled`, for "entered by mistake".

Receipts are never edited or deleted. To correct one, cancel it and record again.

**TDS:** the profile says the client deducts X%. The invoice shows "TDS @10% −₹10,000 / Expect in bank ₹1,08,000". When recording, the allocation row offers a "TDS" cell prefilled as `min(invoice.tdsPaise − invoice.tdsReceivedPaise, outstanding − cash)` whenever the profile has TDS on. The cash and TDS together settle the invoice. The ledger shows TDS as its own credit line ("TDS deducted · 194J"). GST is untouched, which is correct.

**Unapplied credit** for a client = Σ over recorded receipts of `amountPaise − Σ allocations.amountPaise` (only where > 0).

### 6.9 Retainers: recurring drafts (`modules/folio/recurring/generate.ts`)

Calendar functions (verbatim port, tested):
- **`addBillingPeriod(date, frequency, billingDay)`** advances by 1/3/6/12 months and clamps the day to the target month using `billingDay`, not the previous clamped day. With billingDay 31: 2026-01-31 → 02-28 → 03-31.
- **`firstBillingDate(start, freq, day)`**: if the billing day in the start month is on or after the start, that date; otherwise one period later. Examples: start 06-15, day 1 → 07-01; start 06-01, day 10 → 06-10. The first partial period is not prorated (the reference behaviour; say so in the UI hint).
- **`servicePeriodFor(billingDate, freq, day, inAdvance)`**:
  - in advance → billingDate to (next billing date − 1). 2026-10-01 monthly → 10-01 to 10-31.
  - in arrears → previous billing date to billingDate − 1. 2026-10-01 → 09-01 to 09-30.
  - quarterly in advance 04-01 → 04-01 to 06-30.
- **`dueBillingDates({ startDate, endDate, frequency, billingDay, lastInvoicedOn? }, asOf, limit=24)`** returns every billing date from `firstBillingDate` (or from after `lastInvoicedOn`) that is ≤ asOf and ≤ endDate, at most 24. The reference tested it and never called it.

**Generation (stateless, idempotent, catches up):** `generateRetainerInvoices(ctx, asOf, retainerIds?)`. For each retainer with `status: 'active'` (and `autoGenerate` when called from cron):
1. `dates = dueBillingDates(retainer, asOf)` (bounded to 24).
2. `billed = distinct retainerBillingDate` from this retainer's invoices with `status ≠ 'void'`. Drafts count as billed, so running twice never double-bills.
3. For each date in `dates − billed`, oldest first, create a draft through `createDraftInvoice` with:
   - `issueDate = date`; terms from retainer, else profile, else entity
   - `billingType 'retainer'`, `retainerId`, `retainerBillingDate = date`
   - `periodStart/End = servicePeriodFor(...)`
   - subject `"{name} · 1 Oct 2026 to 31 Oct 2026"`
   - one line: `{ description: retainer.description ?? retainer.name, hsnSac, quantity 1, unit: frequency==='monthly' ? 'month' : 'period', rate: amount, gstRatePercent }`. The reference always wrote 'month'.
4. Collect `{ created: [{retainerId, invoiceId, billingDate}], skipped: [{retainerId, name, reason}] }`. A failure on one retainer is caught and reported; the rest continue.

Consequences: deleting a generated draft or voiding its invoice makes that period due again; editing a retainer's amount affects future drafts only; `ended` or `endDate` stops it. "Next invoice on" shown in the UI = the first date of `dueBillingDates(retainer, '9999-12-31', 1)` not yet billed. Keep this cheap by computing from the last billed date.

Monthly run rate (reference): monthly = amount, quarterly = amount/3, half-yearly = /6, annual = /12, summed over active retainers.

### 6.10 Billing plans: milestone drafts
- Amount of a phase = `amountPaise` when not null, else `round(totalValue × percentOfTotal / 100)`. Use `!= null`, not truthiness (the reference UI treated 0 as absent).
- `generateMilestoneInvoice(ctx, milestoneId, issueDate)`:
  - refuse if `invoiceId` is set ("That milestone has already been invoiced.") or if it is cancelled ("A cancelled milestone cannot be invoiced.")
  - refuse if amount ≤ 0 ("That milestone works out to nothing to bill.")
  - create a draft with `billingType 'milestone'`, `planId`, `milestoneId`, subject `"{plan} · {phase}"`, and one line `"{plan} — {phase}"`, qty 1, unit 'phase', the plan's `hsnSac` and GST rate
  - set `milestone.invoiceId` (still `pending` until issue; the issue moves it to `invoiced`)
- After an invoice is paid (settlement status → `paid`), set its milestone to `paid` inside the recalc. The reference never set `paid` outside the seed. Going back below paid returns the milestone to `invoiced`.
- "Invoiced" on a plan = Σ `taxablePaise` of its non-void, non-draft invoices (tax excluded, because the plan value is agreed before tax). Left to bill = `max(0, total − invoiced)`. Editing the plan total re-derives every unbilled percent phase.

### 6.11 Opening balance
- Set on the billing profile (needs `folio.invoices.issue`).
- Saving a non-zero amount creates or updates one invoice for the client with:
  - `billingType 'opening'`, status `issued`
  - `number = 'OB-' + last 6 of the client id` (unique per entity via the index), `fyLabel = financialYearOf(openingBalanceOn)`, `issueDate = dueDate = openingBalanceOn`
  - the client's default entity (else the org default entity); `documentType` = that entity's
  - `supplyType 'exempt'`, one line "Opening balance as on 1 Apr 2026" at the amount with no tax, `totalPaise = amount`
- It is created directly as issued (bypassing the counter). Editing the amount is allowed only while nothing is allocated to it ("Payments are already applied to the opening balance. Release them first."). Setting it to 0 deletes it under the same condition.
- Excluded from: numbering, PDFs (no PDF button), GST summary, sales register, revenue reports, "billed this month". Included in: balances, aging (due on `openingBalanceOn`), ledger (entry type `opening`), allocation lists.
- Why: the reference showed the opening balance in the ledger but not in outstanding or aging, and receipts could not be applied to it, so the client page and the ledger disagreed.

### 6.12 Credit notes (`modules/folio/credit-notes/service.ts`)
- **`createCreditNote(ctx, { invoiceId, noteDate, reason, reasonText, mode: 'full' | 'lines', lines: [{ invoiceLineId, taxable (rupees) }] })`** runs in one transaction:
  1. The invoice must be in the org and issued, part_paid or paid ("Credit notes can only be raised against an issued invoice.").
  2. Per line, `creditTaxable ≤ line.taxablePaise − Σ already credited on that line` across issued credit notes ("Line 2 has only ₹X left to credit."). `full` = every line at its remaining taxable.
  3. Price with `computeInvoice({ lines: [{ quantity 1, rate: creditTaxable, gstRatePercent: line.gstRatePercent }], supplyType: invoice.supplyType, roundOffTotal: settings })`.
  4. **`total ≤ outstandingFor(invoice).outstanding`** ("VWX/2026-27/0007 has only ₹X outstanding. Release a payment from it first if the client needs a refund."). This keeps invoices from going negative; refunds are modelled as unallocate-then-credit.
  5. Number from `creditNotePrefix`, FY of `noteDate`; status `issued`; recalc the invoice.
- **`cancelCreditNote(ctx, id, reason)`** sets status cancelled and recalcs (the invoice is owed again). Its number stays spent.
- PDF title "Credit Note", with "Against invoice VWX/2026-27/0007 dated 1 Oct 2026", the reason, the same tax table and the client GSTIN. Sale-invoice credit notes print no tax and say "Not a tax document".

### 6.13 Quotes and proformas (`modules/folio/quotes/service.ts`)
- **Create/update** prices exactly like invoices and stays editable until converted. The number is assigned on create (`QT/…` or `PI/…`).
- **Send** emails the PDF to recipients (or "Mark as sent") → `sent`, `sentAt`.
- **Accept/decline** are manual buttons; decline asks for a reason.
- **Convert to invoice** works from draft, sent or accepted (not declined, not converted, not expired without first extending `validUntil`). It needs `folio.invoices.write` and creates an invoice draft copying entity, client, lines, discount, notes, terms, subject, `quoteId`, `dealId`, today's date and the profile's terms. The quote becomes `converted` (stored at draft creation, so it can't be converted twice). Deleting that draft or voiding the invoice returns the quote to `accepted`.
- A proforma PDF says "PROFORMA INVOICE: This is not a tax invoice. A tax invoice will be issued on receipt of payment." A quote PDF says "Quotation · valid until 15 Oct 2026".

### 6.14 Collections: reminder schedule, composition and run

**Schedule** (`collections/schedule.ts`, port of `lib/reminders/schedule.ts`): `remindersDue(invoices, settings, asOf)`:
- Settings disabled → nothing. An invoice with `balance ≤ 0` → skip.
- For each offset, `scheduledFor = addDays(dueDate, offset)`; a rule is due when `scheduledFor ≤ asOf` and not already logged for that invoice, channel and offset.
- Output sorted by `scheduledFor` ascending.
- **Folio change (catch-up flood):** when several offsets are due for the same invoice and channel, return only the **latest** one, and return the older ones flagged `skip: true` (the run logs them as `skipped`). The reference sent every missed offset in one run; an invoice first seen 40 days late got five emails at once.
- `toneFor(offsetDays)`: < 0 `advance_notice`; 0 `due_today`; ≤ 15 `polite`; ≤ 45 `firm`; else `final`. Labels: Advance notice, Due today, Gentle reminder, Firm reminder, Final notice. Tone is chosen from **actual days overdue at send time** (as the reference `run.ts` and the manual composer did).

**Compose** (`collections/compose.ts`, verbatim port plus HTML):
- Subjects:
  - advance: "{Company}: invoice {no} due {date}"
  - due today: "{Company}: invoice {no} is due today"
  - final: "Final reminder: invoice {no} — {amount} outstanding"
  - otherwise: "Reminder: invoice {no} — {amount} outstanding"
- Email body:
  - greeting "Hi {first name}," else "Hello,"
  - opening by tone:
    - advance: "A quick note that invoice {no} for {amt} falls due on {date}."
    - due today: "…is due today."
    - polite: "…was due on {date} and is showing as unpaid on our side."
    - firm: "…is now {n} days past its due date of {date}."
    - final: "…is {n} days overdue. This is our final reminder before we escalate the account."
  - a 4-line block (Invoice / Dated / Due / Amount)
  - closing by tone:
    - advance: "No action needed if it is already scheduled — this is just a heads-up."
    - due today: "If it is already scheduled for today, please ignore this note."
    - polite: "If it has been paid in the last day or two, do let us know the reference and we will match it."
    - firm: "Could you confirm the payment date? If something is holding it up, tell us and we will sort it out."
    - final: "Please confirm when this will be settled, or let us know who we should be speaking to."
  - "Thanks,", sender (entity signatory, else org name), company (entity trade name, else legal name), support email
  - Folio adds a "Pay to" line (bank name, A/c last 4, IFSC, UPI) and an HTML version for `sendMail`
- WhatsApp is short and single:
  - advance: "Hi {first}, a heads-up from {Co}: invoice {no} for {amt} is due on {date}. — {sender}"
  - due today: "Hi {first}, invoice {no} for {amt} from {Co} is due today. — {sender}"
  - otherwise: "…was due on {date} ({n} days ago). Could you let us know when it will be settled? — {sender}"
- `whatsappLink(phone, msg)`: digits only; fewer than 10 → null; exactly 10 → prefix `91`; result `https://wa.me/{digits}?text={encodeURIComponent(msg)}`.

**Automatic run** (`collections/run.ts`, from `lib/reminders/run.ts`), called by `/api/folio/cron`:
1. Iterate orgs where Folio is entitled and enabled (`ctx.has('folio')` via a system context) and `FolioSettings.reminders.enabled`.
2. Per org: open invoices (status issued or part_paid, `balancePaise > 0`, not `opening`), excluding clients with `remindersPaused` or core client status `inactive`.
3. Load already-logged rules (kind reminder, offset not null, status in sent/logged/queued/skipped), then `remindersDue`.
4. Recipient: first profile recipient with `receivesReminders`, primary first (email channel uses `email`; WhatsApp uses `whatsapp ?? phone`). If none: skip and note "{no}: no {channel} contact set to receive reminders".
5. Email goes through `sendMail` (`sent` if a provider is configured, else `logged`). WhatsApp is written as `queued` for a human to send from Collections.
6. Write the `FolioMessage`. A duplicate-key error (11000) means another run got there first: ignore it and continue.
7. Result `{ considered, sent, logged, queued, failed, skipped: string[] }`.

The same cron call runs `generateRetainerInvoices(asOf = todayIST())` for `autoGenerate` retainers and sends the summary notification.

**Manual reminder** (from invoice detail and Collections): preview by composing server-side; the user can edit subject and body. **The "To" field is a choice among the client's recipients, resolved on the server.** The reference trusted a free-typed address and body, so the action could mail anything to anyone. Email is sent via `sendMail`. WhatsApp opens the `wa.me` link in a new tab and the user then clicks "Record as sent", which writes a message row with status `logged` ("Recorded. Send it from the WhatsApp window that opened."). Audit `reminder.sent`.

**Follow-ups** (from `app/(app)/collections/actions.ts`):
- Create or edit: client required, invoice optional (must belong to the same client), due date, channel, subject, notes, assignee (a member with Folio access; defaults to self). The reference had this action but no UI reached it.
- Close: **outcome required** ("Write down what happened, even if it was nothing."). Optional "date they committed to" (`promisedOn`). Optional "chase again on", which creates the next follow-up with the same client, invoice and channel, subject "Follow-up", notes "Carried on from: {outcome}", assigned to the closer. Toast: "Closed, and the next chase is scheduled."
- Snooze until a date (status `snoozed`). The effective due date is `snoozedUntil ?? dueOn`.
- Drop (cancel) with an optional reason.
- Queue = status open or snoozed with effective due ≤ today. `daysLate = today − effective due`.

### 6.15 Ledger / statement (`queries/ledger.ts`)

The ledger is derived on every read; nothing is stored. The sign convention: debit increases what the client owes, credit reduces it, positive closing = owed to us.

Rows for one client:

| Source | Date | Type | Debit | Credit | Particulars |
|---|---|---|---|---|---|
| Invoices, status ∈ issued/part_paid/paid (not void, not draft), billingType ≠ opening | `issueDate` | `tax_invoice`/`sale_invoice` | `totalPaise` | 0 | subject, else "Invoice {no}" |
| Opening invoice | `issueDate` | `opening` | total | 0 | "Opening balance" |
| Receipts, status recorded | `receivedOn` | `receipt` | 0 | `amountPaise` | "Payment received · {reference}" |
| TDS on recorded receipts (one row per allocation with tds > 0) | `receivedOn` | `tds` | 0 | `tdsPaise` | "TDS deducted · {section} · {invoice no}" |
| Credit notes, status issued | `noteDate` | `credit_note` | 0 | `totalPaise` | "Credit note · {reasonText}" |
| Invoices with `writtenOffPaise > 0` | date of `writtenOffAt` (IST) | `write_off` | 0 | `writtenOffPaise` | "Written off · {reason}" |

Use one `$unionWith` aggregation **with an `orgId` match inside every sub-pipeline**, or separate `ctx.db` queries merged in code. The second is simpler and fine at this scale.

- Sort: date asc, then type order (opening 0, invoice 1, receipt 2, tds 3, credit note 4, write-off 5), then source id.
- **Running balance:** without a range, start at 0. With a range, **start at the brought-forward** = Σ (debit − credit) of rows dated before `from`, and filter rows to `[from, to]`. In the reference the ranged running balance restarted at 0, yet the statement PDF labelled the last row "Closing balance" and printed "{client} owes ₹X" from it, which was wrong.
- Closing sentence: > 0 "{client} owes {amt}."; < 0 "We hold {amt} of {client}'s money as credit."; 0 "The account is square."; plus amount in words.
- **Identity check:** ledger closing (no range) = Σ open invoice balances (opening included) − unapplied receipt credit = the client's net receivable. Tie the two with a unit test using in-memory rows in `settlement-math`.
- `monthlyLedger(clientId)` groups rows by `YYYY-MM` into billed (Σ debit) and settled (Σ credit), with opening = previous closing, closing = opening + billed − settled, newest first.
- `monthlyTotals(ctx, months=6)` gives billed (Σ total of non-void, non-draft, non-opening invoices by month of `issueDate`) against collected (Σ recorded receipt amounts by month of `receivedOn`). Compute the month boundary in IST (the reference used UTC `new Date()`).
- Bounced and cancelled receipts are excluded from the ledger, as in the reference. The receipt itself remains visible on the receipts list with its badge.
- Statement issuer (PDF/CSV letterhead) = the client's default entity, else the org default entity. A statement leads with the **brand** (trade name, "a brand of {legal}"), unlike a tax invoice.

### 6.16 Aging and balances (`engine/aging.ts`, `queries/balances.ts`)

From `lib/ledger/aging.ts` (verbatim):
- `daysOverdue(due, asOf) = round((asOf − due) / 86 400 000)` on UTC midnights; negative = not yet due.
- `bucketFor`:

  | Days overdue | Bucket |
  |---|---|
  | ≤ 0 | `current` |
  | 1–30 | `1_30` |
  | 31–60 | `31_60` |
  | 61–90 | `61_90` |
  | > 90 | `90_plus` |

  Boundaries are inclusive at 30, 60 and 90. Labels: Not yet due, 1–30 days, 31–60 days, 61–90 days, Over 90 days.
- `summariseAging(invoices, asOf)` → per bucket + `total` + `overdue` (all but current); skips balance ≤ 0.
- `daysSalesOutstanding(receivables, creditSales, periodDays) = round(receivables / creditSales × periodDays)`, or `null` when there are no sales (show "—").
- `collectionPriority`: days overdue descending, then balance descending; returns a copy and does not mutate its input.
- `totalExposure`: Σ max(0, balance).

Balances:
- `balancesByClient(ctx)` returns, per client: `outstanding` (Σ `balancePaise` of issued/part_paid with balance > 0), `overdue` (same with `dueDate < today`), `oldestDueDate` (min overdue due date), `openInvoices` (count), `unappliedCredit` (§6.8), `netReceivable = outstanding − unappliedCredit`. Read `balancePaise`; do not recompute.
- `balanceForClient(ctx, clientId)` is the same with a `clientId` match. The reference computed every client and then picked one.
- `listOutstanding(ctx, clientId?)` lists open invoices with balance > 0, client name, days overdue and bucket, sorted by due date.

### 6.17 Reports (`queries/reports.ts`, `/app/folio/reports`)

Defaults: from = FY start of today, to = today. Every report exports CSV via `toTitledCsv` with preamble rows: title, issuer ("Trade — a brand of Legal"), period ("1 Apr 2026 to 1 Oct 2026" or "As at 1 Oct 2026"), "Generated {date}", then a blank row.

1. **GST (GSTR-1 prep).** Pick a GST entity (each GSTIN files separately). Covers tax invoices with status issued, part_paid or paid (written-off amounts stay in: tax was due). Excludes void, draft and opening rows. Date on `issueDate`.
   - **Summary:** rows grouped by line `gstRatePercent` and invoice `supplyType`. Columns: invoices (distinct count), taxable, CGST, SGST, IGST. Minus credit notes in the period as their own rows ("Credit notes") so net tax is visible. This is the reference output plus credit notes.
   - **B2B:** clients with a GSTIN; one row per invoice and rate. Columns: GSTIN, name, number, date, invoice value, place of supply "23-Madhya Pradesh", reverse charge Y/N, rate, taxable, IGST, CGST, SGST.
   - **B2C large:** inter-state, no GSTIN, invoice value above a constant (`B2CL_THRESHOLD_PAISE = 1_00_000_00`; verify the current threshold before filing). Invoice-wise.
   - **B2C small:** the rest without a GSTIN, grouped by place of supply and rate.
   - **Exports/SEZ:** invoice-wise, zero-rated.
   - **Credit notes:** note-wise; registered clients (CDNR) and unregistered (CDNUR).
   - **HSN/SAC summary:** grouped by `hsnSac` and rate; quantity, taxable, IGST, CGST, SGST.
   - **Documents issued:** per series: first number, last number, total, voided count. Invoices including void; credit notes including cancelled.
   - Empty-state copy: "No tax invoices in this period. Only the GST entity's issued tax invoices appear here — sale invoices carry no tax and have no place in a return."
   - Sale invoices never appear here: the issuer is not registered.
2. **Sales register.** Every non-draft invoice in range, both entities (filterable), voids included with a status column, in number order (date, then seq). Columns: number, date, document, client, client GSTIN, place of supply, supply type, taxable, CGST, SGST, IGST, total, status. Excludes opening. Lists credit notes after the invoices, with negative values.
3. **Collections.** Recorded receipts in range. Columns: receipt, received on, client, entity, mode, reference, amount, applied, TDS, unapplied. Total received.
4. **Aging.** As of today (not the period end; say so). One row per client: not due, 1–30, 31–60, 61–90, 90+, total. Sorted by total descending. Totals row.
5. **Revenue.** Toggle `by=client|month`. Revenue = taxable value (tax excluded) of issued, part_paid and paid invoices (excluding void and opening; **written-off invoices included**, unlike the reference, to stay consistent with GST), minus issued credit-note taxable in range. By client: invoices count, revenue, share % (badge warns at ≥ 30% concentration). By month: billed taxable against collected.

### 6.18 CSV (`engine/csv.ts`, from `lib/reports/csv.ts`)
- `csvCell(v)`: null/undefined → `""`; otherwise `"…"` with internal quotes doubled. Zero renders as `"0"`; newlines stay inside the quotes.
- **Folio addition:** prefix a `'` when the text starts with `=`, `+`, `-`, `@`, tab or carriage return (formula injection). Do not prefix negative numbers passed as numbers: format money as plain numbers before calling.
- `csvRow` joins with commas. `toCsv(headers, rows)` = BOM `﻿` + header row, rows joined with CRLF. `toTitledCsv(title, headers, rows)` adds the preamble described in §6.17.
- Response headers: `text/csv; charset=utf-8`, `attachment; filename="…"`, `cache-control: private, no-store`.
- Money columns: rupees with 2 decimals (`(p/100).toFixed(2)`).

### 6.19 Dashboard metrics (`queries/dashboard.ts`)
- **Receivables** (net receivable across clients) and **Outstanding** (Σ balances). Hint: "{n} invoices overdue".
- **Overdue**, with hint "{x}% of the book" (= round(overdue / outstanding × 100)).
- **Collected this month**, with "+12% on last month" (round((this − last)/last × 100), or "No comparison yet" when last = 0).
- **Billed this month** (Σ total, non-void, non-draft, non-opening, `issueDate` in the IST month), with "{n} drafts waiting".
- **DSO (90 days)** = round(net receivable / Σ totals issued in the last 90 days × 90), or "—" when there were no sales. The reference had the function but never used it.
- Work tiles: follow-ups due today (open or snoozed, effective due ≤ today), drafts to issue (count of drafts), retainers to bill (retainers with at least one unbilled due date).
- Aging buckets with share %. Colours: current = success, 1–30 and 31–60 = warning, 61–90 and 90+ = danger.
- Top debtors: up to 8 clients with overdue > 0, sorted by overdue descending. Columns: client, oldest due, overdue, outstanding.
- Billed vs collected bar pairs for the last 6 months (SVG from `components/charts`).
- Banner when unapplied credit > 0: "{amt} received but not applied to any invoice", linking to `/app/folio/receipts?unallocated=1`.

---

## 7. Pages, by route (SPEC §6 Folio, plus required extras)

Every list: URL params `?page=&q=` + filters, 25 per page. The reference capped lists at 200 silently. Every list also has a designed empty state with the create action. Status badge vocabulary (`components/folio/StatusBadge.tsx`) uses SPEC tokens:

| Status | Badge |
|---|---|
| draft | neutral (`--text-3`) |
| issued | info `#6366F1` |
| part paid | warning `#E8B65C` |
| paid | success `#5EEAB0` |
| void | neutral, struck through, label "Void" |
| written off (`writtenOffPaise > 0`) | danger outline, label "Written off" |
| issued/part paid with daysOverdue > 0 | danger, label "Overdue {n}d" (overrides) |

Document badges are "TAX" (accent `--folio` amber) and "SALE" (neutral). Receipt badges: recorded = success, bounced = danger, cancelled = neutral. Retainer badges: active = success, paused = warning, ended = neutral. Milestone badges: pending = neutral, invoiced = info, paid = success, cancelled = neutral. Follow-up badges: open = warning, done = success, snoozed = neutral, cancelled = neutral. Aging badges: current neutral, 1–30 and 31–60 warning, 61–90 and 90+ danger.

### 7.1 `/app/folio`: dashboard (folio-b)
- **Purpose:** where the money stands today, and what needs a person.
- **Data:** §6.19. Greeting "Good morning, {firstName}" with the date (core helper).
- **Actions:** "New invoice" → `/app/folio/invoices/new`; "Record payment" → `/receipts/new`; "Work the queue" → `/collections`; tile links (drafts → `/invoices?status=draft`; retainers → `/recurring`); a debtor row → `/ledger/[clientId]`.
- **Permission:** `folio.read`. Buttons are hidden per permission.
- **Empty state (no invoices at all):** a card "Bill your first client" with three steps: set up a billing entity (link to settings if none), add a client (Orbit's `/app/clients/new`), raise an invoice. If no entity exists, every Folio page shows a callout "Set up a billing entity first" linking to `/app/folio/settings`.

### 7.2 `/app/folio/invoices`: list (folio-a)
- **Purpose:** every tax and sale invoice in one list.
- **Data:** per row: document badge + number (or "Draft") + subject (truncated), client (link to `/app/clients/[id]`), entity code (when more than one entity), issue date, due date, status badge, total, balance (danger when overdue, muted "—" when 0). Header line: "{n} shown · ₹X billed · ₹Y still owed".
- **Filters (URL):** `q` (number, subject, PO, client name; regex-escaped, case-insensitive), `status` (draft | issued | part_paid | paid | void | written_off pseudo-filter), `type` (tax_invoice | sale_invoice), `entity`, `client`, `open=1` (issued/part_paid with balance > 0), `overdue=1` (open and `dueDate < today`), `from`/`to` (issue date). Sort: issueDate desc, createdAt desc. Opening rows are hidden unless `client` is set.
- **Actions:** "New invoice"; "Generate retainer drafts ({n} due)" when due > 0 and the user has `folio.invoices.write`; row click → detail.
- **Permission:** `folio.read`.
- **Empty states:** none at all: "No invoices yet. Raise the first one: pick the business, the client and what you're billing." with a [New invoice] button. Filtered: "No invoices match these filters." with [Clear filters].

### 7.3 `/app/folio/invoices/new` and `/app/folio/invoices/[id]/edit`: builder (folio-a)
- **Purpose:** build or edit a draft, with live totals from the same engine the server uses.
- **Query params (new):** `clientId`, `entityId`, `duplicateOf`, and from Orbit `dealId`, `title`, `amount` (paise). The deal prefill is one line: description = title, qty 1, rate = amount/100.
- **Edit:** only drafts. An issued invoice redirects to the detail page. The reference did the same: no form that would be refused on submit.

**Layout and fields:**

*Card "Who and when":*
- **Billing from** (entity select). Defaults: profile default entity, else org default entity, else first active. Hint by kind: "Issues a Tax Invoice with a GST breakup." or "Issues a Sale Invoice. No tax is charged or shown."
- **Client** (active clients). Picking one sets terms, entity, TDS and place of supply from the profile, and shows the credit-limit warning when outstanding + this total > limit.
- **Invoice date** (default today).
- **Payment terms (days)**, hint "Due {date}".
- **Subject** ("What this invoice is for, in one line").
- **Billing type** (one-time | retainer | milestone | advance; the opening type is never offered).
- **Client PO reference**.
- **Bank account to print** (entity's accounts, masked).
- Tax invoices only:
  - **Place of supply** select: "From the client ({code})" or any state. Hint: "{supply label}. Defaults to the client's; override only when the service is delivered elsewhere."
  - **Supply** (Auto | Export (zero-rated) | SEZ (zero-rated))
  - **Reverse charge** checkbox, enabled only when the client has a GSTIN
- **Service period** start/end (optional).

*Card "What you are billing":* line rows with:
- service item picker ("Free text" or catalogue; picking fills description, SAC, unit, rate and GST rate; GST 0 on sale invoices)
- description, Qty (step 0.001), Unit, Rate ₹ (step 0.01), Disc %, GST % (tax only; select of allowed rates), SAC
- under each row: "Taxable ₹ · CGST ₹ · SGST ₹ (or IGST) · ₹ line total"
- Add line; remove line (never below one). On sale invoices: "This is a sale invoice, so no tax is charged and none will appear on the document."

*Card "Discount and notes":*
- invoice discount type (None | Percentage | Flat amount) with hint "Applied across the lines before tax, in proportion to their value."
- value
- notes on invoice (default from entity), terms (default from entity), internal notes ("Never printed. For whoever picks this up next.")

*Sticky aside "Totals":*
- badge "Tax Invoice" or "Sale Invoice"
- Subtotal, Discount, Taxable value (strong), CGST/SGST (or UTGST) or IGST
- when a tax invoice carries no tax: "No tax on this supply — {label}."
- Round off; Total (big); TDS box "TDS {x}% −₹ / Expect in bank ₹" when the profile has TDS on
- buttons "Create draft" / "Save draft", note "Saved as a draft. It gets a number only when it is issued."

- **Validation (zod, server):** entityId and clientId in org (entity active, client active); issueDate ISO; terms integer 0–365; billingType ∈ one_time/retainer/milestone/advance; lines 1–100; description 1–500; quantity > 0, ≤ 1,000,000, ≤ 3 decimals; unit 1–20; rate ≥ 0, ≤ ₹10,00,00,000, ≤ 2 decimals; discountPercent 0–100; gstRatePercent ∈ settings tax rates (tax invoice) and forced 0 (sale); hsnSac optional, digits only, 4–8; discountType none|percent|amount; percent 0–100; amount ≥ 0; placeOfSupply a valid code or empty; reverseCharge only with a client GSTIN on a tax invoice; subject ≤ 200; PO ≤ 60; notes, terms and internal notes ≤ 2000; periodEnd ≥ periodStart. The server recomputes all money. Field errors scroll to the first error (the reference showed one string for the whole form; Folio must show per-field errors).
- **On success:** new → redirect to `/app/folio/invoices/[id]`, toast "Draft invoice for {client} saved"; edit → back to detail.
- **Permission:** `folio.invoices.write`.
- **Empty states:** no entity → callout linking to settings. No active clients → "Add a client first" linking to `/app/clients/new`.

### 7.4 `/app/folio/invoices/[id]`: detail (folio-a)
- **Purpose:** the document, its money and its chase history.

**Data:**
- Header: eyebrow = entity legal name; title = number or "Draft invoice"; description = subject.
- Badges: document type, status or overdue, billing type (when not one-time), supply type (tax invoices), "Written off".
- "Billed to" block: from `billTo`; drafts read live (name, address, GSTIN, state).
- Dates block: invoice date, due date, terms, service period, "Your PO".
- Lines table (#, description, SAC on tax invoices, qty + unit, rate, GST% on tax invoices, amount = line taxable).
- Notes and terms.
- **Payments against this invoice** (receipt no → receipt page, received, mode, reference, applied cash, TDS).
- **Credit notes** (number, date, reason, total, status).
- **Chase history**: message log (channel badge, subject, "Sent 1 Oct 2026 to x@y" or "Not sent", error) and follow-ups (channel, subject, outcome or "Due {date}").
- Aside "Summary": subtotal, discount, taxable, CGST/SGST/IGST, round off, **Total** (+ amount in words), received, TDS received, credit notes, written off, **Balance due** (danger if overdue, success if 0), TDS box (expected TDS and expect in bank).
- Internal note card. Void or write-off reason callout.
- Callouts: drafts show "This is still a draft. It carries no number and is not a legal document yet. Issuing it takes the next number in {entity code}'s series ({peek}) and locks the figures." Overdue shows "Overdue by {n} days. {balance} was due on {date}." with a link "Work the follow-up" to `/collections?client=`.

**Actions by status:**

| Status | Actions (each destructive or irreversible one behind `ConfirmDialog`) |
|---|---|
| draft | Edit · Delete draft (confirm: "Nothing has been issued, so this leaves no trace and spends no number.") · Issue (confirm: "It takes the next number ({peek}) and its figures become permanent. After this, the only way to change it is a credit note." with date field defaulting to the draft date) · Duplicate |
| issued / part_paid | PDF · Email to client · Record payment (→ `/receipts/new?clientId=&invoiceId=`, prefills that row) · Send reminder (email/WhatsApp dialog) · Add follow-up · Raise credit note (→ `/credit-notes/new?invoiceId=`) · Void (only when nothing is settled; reason required; "The number stays spent — a statutory series may contain cancellations but not gaps.") · Write off (reason required; "The invoice stands and the debt stops being counted as receivable. The ledger will show it as a write-off, not as a payment.") · Duplicate |
| paid | PDF · Email · Duplicate |
| any with write-off | Undo write-off |
| void | PDF (with a VOID banner) · Duplicate |
| opening | no PDF; "Edit on billing profile" link |

**Email to client dialog:**
- **To**: checkboxes of profile recipients with `receivesInvoices` (fallback: client primary contact). The server resolves addresses by recipient id. **Cc**: optional free email.
- **Subject** default: "Invoice VWX/2026-27/0007 from Vistaar WebX — ₹1,47,500 due 16 Oct 2026".
- **Message** default: "Hi {first name},\n\nPlease find attached invoice {no} dated {date} for {total}, due on {due date}.{period line}\n\nPayment details:\n{bank name} · A/c {account} · IFSC {ifsc}{ · UPI}\n\nThanks,\n{signatory}\n{trade name}".
- The PDF is attached. Writes a `FolioMessage` (kind invoice) and sets `lastEmailedAt`. Toast "Invoice {no} emailed to {names}" (or "Logged. No email provider is configured, so nothing was delivered." when there is no provider).

- **Permissions:** view `folio.read`; edit, delete, duplicate and email need `folio.invoices.write`; issue, void and write-off need `folio.invoices.issue`; record payment `folio.receipts.write`; credit note `folio.credit_notes.write`; reminder and follow-up `folio.collections.write`.
- **Empty states:** no payments: "No payments applied yet." with [Record payment]; no chase history: section hidden.
- **Not found:** `notFound()` inside the shell.

### 7.5 `/app/folio/quotes`, `/app/folio/quotes/new`, `/app/folio/quotes/[id]` (folio-a)
- **List purpose:** quotes and proformas.
  - **Data:** number, kind badge (Quote/Proforma), client, date, valid until, status (with derived "Expired" in warning), total.
  - **Filters:** `q`, `status`, `kind`, `client`.
  - **Actions:** "New quote", "New proforma".
  - **Empty state:** "No quotes yet. Send a quote before the work starts, then convert it to an invoice in one click." with [New quote].
- **New/edit:** the same builder component in quote mode. Differences: kind toggle; "Valid until" (default date + settings validity days) instead of terms; no billing type or TDS; button "Save quote". Query params as for invoices, including `dealId`, `title` and `amount` from Orbit. Validation as for invoices, plus `validUntil ≥ quoteDate`.
- **Detail:**
  - **Data:** like the invoice detail, minus money-in sections; plus "Converted to invoice {no}" link when converted.
  - **Actions:** Edit (until converted) · PDF · Email to client (marks sent; kind quote) · Mark as sent · Accept · Decline (reason) · Convert to invoice (confirm: "Creates a draft invoice with these lines. Review it before issuing.") · Duplicate · Delete (draft only).
- **Permission:** `folio.quotes.write` for all quote pages; read access via `folio.read` or `folio.quotes.write`; convert needs `folio.invoices.write` as well.

### 7.6 `/app/folio/receipts`: list (folio-b)
- **Purpose:** every rupee that arrived and what it settled.
- **Data:** receipt no (+ status badge when not recorded), client, entity code, received on, mode, reference, amount, unapplied (warning when > 0). Header: "₹X received · ₹Y not yet applied."
- **Filters:** `q` (number, reference, client), `client`, `entity`, `mode`, `status`, `unallocated=1` (recorded with unapplied > 0; title becomes "Unapplied payments" with callout "Money in the bank that no invoice knows about. These are advances and part payments. Applying them to an invoice is what makes the outstanding figure honest."), `from`/`to`.
- **Actions:** "Record payment"; the "Unapplied only" / "Show all" toggle.
- **Permission:** `folio.read`.
- **Empty states:** "No payments recorded yet. Record the first payment as it lands." with [Record payment]. Unapplied filter with no rows: "Everything is applied. Every payment has been matched to an invoice."

### 7.7 `/app/folio/receipts/new`: record payment (folio-b)
- **Purpose:** record money against a client, then say which bills it settles.
- **Query params:** `clientId`, `invoiceId` (prefill that row with the full balance).

**Fields:**
- Client (required).
- **Received into** (entity; defaults to the client's default entity). Changing it filters the open invoices to that entity.
- Amount received ₹ (> 0).
- Received on (default today, ≤ today).
- How it arrived (mode select).
- Reference ("UTR, cheque number or gateway id — whatever the bank statement shows.").
- Into which account (entity bank accounts).
- Cheque date (shown when mode is cheque).
- Notes.

**"What it settles" card:**
- The client's open invoices for that entity, oldest due first. Row: number, "Due {date} · ₹ owed", an amount input (max = owed), and a TDS input (shown when the profile has TDS on).
- Button "Apply oldest first" fills cash down the list (`min(owed, remaining)`).
- Hint "Leave everything blank to hold it as an advance against future invoices."
- No client chosen: "Choose a client to see their open invoices." No open invoices: "Nothing outstanding. This will be recorded as advance credit."

**Aside "Allocation":** Received, Applied, Unapplied (or "Over-applied" in danger), Callouts: over: "You have applied more than the payment. Reduce an allocation."; remainder: "{amt} will sit as unapplied credit on this client, ready for the next invoice." Submit is disabled while over-applied or with no client.

- **Validation:** §6.8, plus client-side mirroring.
- **On success:** redirect to `/app/folio/receipts/[id]` with the §6.8 toast.
- **Permission:** `folio.receipts.write`.
- **Empty states:** no clients → link to `/app/clients/new`; no entity → settings callout.

### 7.8 `/app/folio/receipts/[id]`: receipt detail (folio-b; extra route required for allocation)
- **Data:** header: title = receipt no, eyebrow = client, description "{amt} received on {date}".
  - "Applied to" table: invoice no (link), invoice date, invoice total, applied cash, TDS, and [Release] on each row when the user can allocate.
  - Details aside: status, amount, applied, unapplied (warning), mode, reference, into (entity + masked bank), TDS withheld, notes.
  - Bounced callout: "This payment bounced. {reason} · {date}. Nothing it once settled counts as paid."
- **Actions:**
  - **Apply the remaining {amt}** panel (when unapplied > 0 and recorded): pick an open invoice of the same client and entity (shows due and owed, "· overdue"), enter amount (prefilled `min(owed excluding this receipt's own row, unapplied)`) and TDS, then Apply. The reference prefilled including its own allocation, which could exceed.
  - **Release** (confirm: "{invoice} becomes owed again, and this money returns to unapplied credit. The payment itself is untouched.").
  - **Mark bounced** (confirm with date and reason: "Every invoice it settled becomes owed again and returns to the collections list. Nothing is deleted — the record stands, marked bounced.").
  - **Cancel receipt** (reason).
- **Permission:** view `folio.read`; actions `folio.receipts.write`.
- **Empty state (nothing applied):** "Nothing applied yet. This is sitting as credit on {client}." No open invoices: "This client has nothing outstanding. The credit waits here until they do."

### 7.9 `/app/folio/recurring`: retainers and billing plans (folio-a)
- **Purpose:** recurring agreements that produce drafts, and phased billing.
- **Tabs (`?tab=retainers|plans`).**

**Retainers tab:**
- Stat tiles: Active retainers · Monthly run rate (§6.9) · Due for billing (count; warning if > 0).
- Callout when due: "{n} retainers are due for billing. The oldest is {date}. A retainer that nobody billed catches up rather than losing the revenue."
- Table: name, client, every (frequency), next invoice (danger + "· due" when due), status, raised (count of non-void invoices), amount, and a row action "Bill now".
- Header action: "Generate {n} due drafts" (confirm: "Each due retainer gets a draft invoice for each missed service period. Nothing is issued and nothing reaches a client until you say so. Running this twice will not bill anyone twice.").
- Result toast: "{n} draft invoices created. Review them before issuing." or "Nothing generated. {first skip reason}" or "No retainers are due right now."
- **Create/edit retainer** (dialog): client, entity, name, description, SAC, amount ₹, GST % (hidden or 0 for non-GST), frequency, start date, end date, billing day (1–31; hint "A 31 bills on the 30th in April."), bill in advance (toggle; hint shows the example service period), payment terms, auto-generate toggle, notes.
- Row menu: Edit · Pause / Resume · End (sets `ended` and `endDate = today` if empty; confirm) · View invoices (→ `/invoices?client=&q={name}`).
- Validation per §5.7. Changes are audited.

**Plans tab:**
- Table: name + code + phase count, client, status, billed meter (invoiced/total %), invoiced, value.
- **Create/edit plan** (dialog or `/app/folio/recurring/plans/new`): client, entity, name, code (auto), description, SAC, total value ₹ (before tax), GST %, start, target end, optional Work project link, status. Phases editor: position, name, description, either % or flat ₹ (toggle per row), due date. Live sum "{x}% / ₹y of ₹z allocated".
- **Plan detail `/app/folio/recurring/plans/[id]`** (extra route): tiles (value, invoiced %, left to bill, client); phases table (#, phase, due, status badge, invoice link, amount + %, [Raise invoice] confirm "Creates a draft for {amt}. Review it before issuing."); edit, mark completed, cancel phase.
- Validation per §5.8. Invoiced or paid phases cannot change amount or be deleted ("This phase is already invoiced.").

- **Permission:** view `folio.read`; create, edit, pause and end `folio.recurring.write`; generate and raise `folio.invoices.write`.
- **Empty states:** retainers: "No retainers yet. Add one to bill a client the same amount every month without rebuilding the invoice." with [New retainer]. Plans: "No billing plans yet. A plan is worth setting up when the money is agreed up front and billed in stages." with [New plan].

### 7.10 `/app/folio/credit-notes` (+ `/new?invoiceId=`, `/[id]`) (folio-a)
- **List:**
  - **Data:** number, client, against invoice (link), date, reason, total, status.
  - **Filters:** `q`, `client`, `status`, `from`/`to`.
  - **Empty state:** "No credit notes. A credit note is the only way to reduce an issued invoice: raise one from the invoice." with [Pick an invoice] (opens an invoice search).
- **New** (extra route; requires `invoiceId`):
  - Invoice summary (number, total, outstanding).
  - Mode: "Full (credit everything still creditable)" or "By line" (each invoice line shows taxable, already credited, and a "Credit ₹" input).
  - Note date, reason select, reason text.
  - Live totals from the engine (taxable, tax split, round off, total).
  - Submit "Issue credit note" (confirm: "It takes the next credit-note number and reduces what {client} owes on {invoice}.").
  - Validation per §6.12. Success → `/credit-notes/[id]`, toast "Credit note {no} issued against {invoice}".
- **Detail:** document view, PDF, Email to client, Cancel (reason; confirm "{invoice} becomes owed again. The number stays spent.").
- **Permission:** view `folio.read`; create and cancel `folio.credit_notes.write`.

### 7.11 `/app/folio/ledger` (index, extra route for nav) and `/app/folio/ledger/[clientId]` (folio-b)
- **Index purpose:** pick a client; see every client's balance.
  - **Data:** clients with Folio activity. Columns: client, terms, last billed, overdue (danger), outstanding, unapplied credit (success), net receivable. Sorted by overdue desc, then name.
  - **Filters:** `q`, `overdue=1`.
  - **Empty state:** "No balances yet. Ledgers appear once a client has an issued invoice or a payment."
- **Statement purpose:** the statement of account for one client.
  - **Controls:** client switcher, from, to, view toggle Statement | Monthly.
  - **Data (statement):** brought-forward callout when `from` is set. Table: date, type badge, document (link to invoice/receipt/credit note), particulars, debit, credit, balance. Totals row. Closing sentence (§6.15).
  - **Data (monthly):** month, opening, billed, received, closing.
  - Header shows the client name, the client's billing profile summary (terms, TDS, credit limit), and [Billing settings] (opens `BillingProfileCard` dialog; `folio.invoices.write`).
- **Actions:** CSV (`/api/folio/ledger/[clientId]/csv?from&to`), Statement PDF (`/api/folio/ledger/[clientId]/pdf?from&to`), Email statement (dialog like the invoice email: recipients, subject "Statement of account — {client} — as at {date}", attaches the PDF; kind statement), Record payment, New invoice.
- **Permission:** `folio.read`.
- **Empty state (no rows in range):** "Nothing in this period. No invoices, receipts or credit notes fall in the dates chosen." Unknown client id → `notFound()`.

### 7.12 `/app/folio/collections` (folio-b; extra route; ask foundation to add it to the Folio nav)
- **Purpose:** who to chase today, oldest debt first.
- **Data:**
  - Tiles: Due today (follow-ups count), Overdue (₹, invoice count), Over 60 days (61–90 + 90+), Over 90 days ("Consider writing off").
  - **Your queue today**: follow-ups due or late, filtered `mine=1` by default with a toggle for all. Columns: client (+ subject), invoice link, due (with "{n}d late" badge and snoozed badge), channel, balance, row actions.
  - Aging chips per bucket.
  - **Everything overdue**: `collectionPriority` order. Columns: invoice, client, due, age badge, balance, reminder buttons (email/WhatsApp), last reminder sent ("Reminder sent 28 Sep") and open follow-up indicator.
  - **WhatsApp to send**: messages with status `queued` from the automatic run, each with "Open WhatsApp" and "Mark sent".
- **Filters:** `client`, `mine`.
- **Actions:**
  - New follow-up (dialog: client, invoice of that client optional, due date, channel, subject, notes, assignee).
  - Row actions: Send reminder, Snooze ("Come back on"), Drop (optional reason; "For one raised by mistake. Use Close instead if you actually spoke to them — that keeps the outcome on the record."), Close ("What happened?": outcome required, "Date they committed to", "Chase again on" with hint "Opens the next follow-up automatically.").
  - Header: "Record a payment".
- **Permission:** view `folio.read`; act `folio.collections.write`.
- **Empty state:** "Nothing to chase. Every invoice is either current or settled." Queue only: "Nothing due. The queue is clear."

### 7.13 `/app/folio/reports` (folio-b)
- **Purpose:** §6.17.
- **Controls:** report tabs (GST · Sales register · Collections · Aging · Revenue); from/to dates (default FY start to today); entity select (required for GST, defaulting to the first GST entity); GST sub-tabs (Summary, B2B, B2C large, B2C small, Exports, Credit notes, HSN, Documents); Revenue toggle (by client/month).
- **Actions:** Export CSV for the current report and section.
- **Permission:** `folio.reports.read`.
- **Empty states:** per report as in §6.17 ("Nothing issued in this period", "No payments in this period", "Nothing outstanding. Every invoice is settled.", "No revenue in this period").

### 7.14 `/app/folio/settings` (folio-a)
- **Purpose:** the businesses, their series and banks, tax rates, default terms, signatory, service catalogue, reminder cadence.
- **Tabs (`?tab=`):**

**`entities`:** a list of entity cards plus [Add entity]. Fields:
- code, legal name, trade name
- kind (GST/Non-GST; locked after the first issued invoice, hint "This decides Tax Invoice vs Sale Invoice and cannot change once documents exist")
- GSTIN (GST only; live check against state), PAN, CIN/LLPIN
- address line 1/2 (the reference's form lacked line 2, so each save erased it), city, state (GST code select), PIN
- email, phone, website
- logo upload (`saveFile`, kind 'folio_logo')
- default entity toggle, active toggle

On first visit, prefill a new entity from core `Org` (name, address, GSTIN, state).

**`banks`:** per entity, bank accounts: label, account name, account number, IFSC, bank, branch, UPI, default. This is the only page that shows full account numbers. Audit every change ("bank details changed" with masked before and after).

**`series`:** per entity: invoice, credit note, receipt, quote and proforma prefixes, and padding. Shows "Next invoice: VWX/2026-27/0008" (peek). Callout: "Each entity keeps its own series, restarting every financial year on 1 April. A voided invoice keeps its number — a statutory series may contain cancellations, but it may not contain gaps."

**`tax`:** allowed GST rates (chips; default 0, 5, 12, 18, 28), default GST rate per entity, round off total to the rupee (toggle), show expected TDS on invoices (toggle), quote validity days.

**`terms`:** per entity: default payment terms (days), default terms text, default notes text.

**`signatory`:** per entity: signatory name, title, signature image upload.

**`services`:** catalogue table (code, name, SAC, unit, rate, GST, status) with add/edit dialog and archive/restore. "Archived services stop appearing in the picker; past invoice lines keep them."

**`reminders`:**
- enabled toggle
- cadence (comma list, e.g. "-3, 0, 7, 15, 30"; integers −30..365, unique, sorted, max 8; hint "Days relative to the due date. Negative is before.")
- channels (Email, WhatsApp; at least one: "Pick at least one channel.")
- automatic retainer drafts toggle (org-level master switch for the cron)

- **Validation:** §5.1, §5.12. Errors: "That is not a valid GSTIN. It should be 15 characters, like 27AABCA1234B1Z9." / "That is not a valid PAN. It should look like AAXFS1234A." / "Enter a valid IFSC, like HDFC0001234." / "That code is already in use." / "Only one account can be the default."
- **Permission:** `folio.settings.manage`.
- **Empty state:** no entities: "Add the business you bill from. A GST-registered business issues tax invoices; an unregistered one issues sale invoices with no tax." with [Add entity].

### 7.15 Client billing profile (component, folio-a)

`components/folio/BillingProfileCard.tsx` is a card with an edit dialog. It is embedded by Orbit on `/app/clients/[id]` (Overview) and opened from `/app/folio/ledger/[clientId]`.

- **Fields:** default entity, payment terms, place of supply override (state select, "Same as billing state"), export client toggle, default GST rate, credit limit ₹ (blank = none; **the edit form must show rupees**, not paise; the reference showed paise in rupee fields, so every save multiplied the credit limit and opening balance by 100), TDS toggle + section (default 194J) + rate (default 10), reminders paused, billing recipients list (name, email, phone, WhatsApp, receives invoices, receives reminders, primary), opening balance ₹ + as on (issue permission only), notes.
- **Validation:** §5.2; recipient email valid; at least one of email/phone/WhatsApp per recipient.
- **Permission:** `folio.invoices.write`; opening balance needs `folio.invoices.issue`.
- **Empty state:** "No billing settings yet. Defaults apply: {entity}, 15 days, no TDS." with [Set up billing].

---

## 8. Route handlers

| Route | Method | Permission | Behaviour |
|---|---|---|---|
| `/api/folio/invoices/[id]/pdf` | GET | `folio.read` | 404 if not in org; **409 for drafts** ("This invoice has not been issued yet." A draft has no number and must not circulate as a convincing document; drafts get an on-screen preview only); opening rows 404; renders from snapshots; `inline; filename="VWX-2026-27-0007.pdf"`; `cache-control: private, no-store` |
| `/api/folio/quotes/[id]/pdf` | GET | `folio.read` or `folio.quotes.write` | any status; "DRAFT" corner tag on drafts |
| `/api/folio/credit-notes/[id]/pdf` | GET | `folio.read` | |
| `/api/folio/ledger/[clientId]/pdf` | GET `?from&to` | `folio.read` | statement PDF (§8.1) |
| `/api/folio/ledger/[clientId]/csv` | GET `?from&to` | `folio.read` | titled CSV: Date, Type, Document, Particulars, Debit, Credit, Balance; filename `ledger-{client-slug}.csv` |
| `/api/folio/reports/[report]` | GET `?from&to&entity&section&by` | `folio.reports.read` | `report ∈ gst \| sales \| collections \| aging \| revenue`, otherwise 404 "Unknown report." |
| `/api/folio/cron` | POST | Bearer token = `HMAC-SHA256(APP_SECRET, 'folio:cron')` hex, compared with `timingSafeEqual` (length check first) | runs reminders and retainer generation for every Folio org, returns JSON per org; 401 "Not authorised." |

### 8.1 PDF layouts (`components/folio/pdf/*`)

Printed documents are light (white page, dark ink) even though the app is dark-only: they get printed and forwarded.

**Common:**
- A4, padding 40 top, 56 bottom, 40 sides; base 9pt; Work Sans.
- Ink `#0B0B0C`; secondary `#55555C`; muted `#8E8E96`; rules `#E6E6EA`; sunk panels `#F7F7F9`; accent = brand orchid `#BB62A5` for eyebrows and doc labels (the reference used Vistaar red).
- Money printed as "Rs." (§3).

**Invoice (tax and sale; port of `lib/pdf/invoice.tsx` with fixes):**
1. **Header row.**
   - Left: letterhead from the `from` snapshot: logo (or a burst-mark fallback), **legal name** (tax invoice leads with the legal name, because that is whose GSTIN it is), "a brand of" line only on non-statutory docs, address lines, email, phone, "GSTIN …" (tax only), CIN/LLPIN if set.
   - Right: doc label (8pt bold, letter-spacing 1.6, uppercase, accent) "TAX INVOICE" / "INVOICE" (sale) / "CREDIT NOTE" / "QUOTATION" / "PROFORMA INVOICE"; number (13pt bold; "DRAFT" for drafts); "Dated {date}"; "Due {date}"; "Your PO {ref}"; "Original for recipient" on tax invoices.
2. **Rule**, then two party columns.
   - **Billed to:** name, address lines, "State: Madhya Pradesh (23)", "GSTIN …" (tax only).
   - Right column: "For" (subject); "Service period" (start to end); "Place of supply: Name (code)" (tax only); **"Reverse charge: Yes/No" always printed on tax invoices** (the reference printed it only when true).
3. **Lines table:** #, Description, SAC (tax only), Qty + unit, Rate, Disc % (only when any line has a discount), GST % (tax only), Amount (= line taxable). Rows `wrap={false}`.
4. **Totals box** (width 240, right). The order is **Subtotal → Discount → Taxable value** (the reference printed "Taxable value" first and then subtracted the discount again, which read as a double discount). Then CGST @ x% and SGST/UTGST @ x% (or IGST @ x%), with one row per distinct rate when there are several. Then Round off, then **Total** (rule above, 12pt bold). Then, if TDS is shown: "Less: TDS @ 10% (194J) − Rs. …" and "Net payable Rs. …".
5. **Amount in words:** "Amount in words: **One Lakh Forty Seven Thousand Five Hundred Rupees Only**".
6. **Tax summary table** (tax invoices only; new): grouped by SAC and rate, with columns taxable, CGST rate/amount, SGST rate/amount (or IGST rate/amount), total tax.
7. **Panel** (sunk background, two columns): **Payment details** (account name, bank + branch, A/c number, IFSC, UPI) and **Terms** (terms, then notes).
8. **Signature block** (right): "For {legal name}", signature image if set, line, signatory name, title (default "Authorised Signatory").
9. **Fixed footer:** "{trade} — a brand of {legal} · {number} · Page x of y", plus " · Not a tax invoice. No GST charged." on sale invoices, plus core's "This is a computer-generated document."
10. Exports and SEZ add "Supply meant for export / to SEZ under LUT without payment of IGST" under the totals. Void invoices get a large diagonal "VOID" mark.

**Statement (port of `lib/pdf/statement.tsx`, fixed):**
- Letterhead leads with the brand.
- Right side: "STATEMENT OF ACCOUNT", client display name, "{from} to {to}" or "As at {to}".
- "Account of" block: legal name, address, GSTIN.
- Tiles: Brought forward (when ranged), Billed, Received & credited (green), Closing balance (red when > 0, green otherwise).
- Table: date, type, document, particulars, debit, credit, balance (running from brought forward).
- Totals row; closing sentence + amount in words; footer "{brand line} · Statement for {client} · Page x of y".

**Quote and credit note:** same skeleton as the invoice. The quote adds a "Valid until" line in place of "Due" and has no payment panel unless proforma. The credit note adds "Against invoice {no} dated {date}" and "Reason: {text}".

---

## 9. Exports other agents need (contracts)

| Export | Path | For | Signature |
|---|---|---|---|
| Client invoices tab | `components/folio/ClientInvoicesTab.tsx` (server component) | Orbit `/app/clients/[id]` "Invoices" tab | `({ clientId }: { clientId: string })`; shows balances tiles (outstanding, overdue, unapplied credit, net), recent invoices table (number, date, status, total, balance), recent receipts, active retainers and plans, buttons New invoice / Record payment / New quote (permission-aware); renders nothing but a lock note if `!ctx.has('folio')` |
| Client ledger tab | `components/folio/ClientLedgerTab.tsx` | Orbit "Ledger" tab | `({ clientId, from?, to? })`; statement table + CSV/PDF links |
| Billing profile card | `components/folio/BillingProfileCard.tsx` | Orbit client overview | `({ clientId })` |
| Queries | `modules/folio/queries/balances.ts` | Orbit client list column, Home | `balanceForClient(ctx, clientId)`, `balancesByClient(ctx)` |
| GST helpers | `modules/folio/engine/gst.ts`, `engine/states.ts` | Orbit client form validation | `isValidGstin`, `stateCodeOfGstin`, `gstinMatchesState`, `gstCodeFromStateLetters(code)`, `STATES` |
| Deal → Folio links | URL contract | Orbit deal detail (won) | `/app/folio/quotes/new?clientId=&dealId=&title=&amount=<paise>` and `/app/folio/invoices/new?…same` |
| Search | `modules/folio/search.ts` | command palette (if foundation aggregates) | `searchFolio(ctx, q)` → up to 6 invoices by number/subject/PO, `{ kind:'invoice', id, title, subtitle: '{client} · ₹', href }` |

---

## 10. Seed plan (`modules/folio/seed.ts`, `modules/folio/receipts/seed.ts`)

Dates are relative to `todayIST()` (October 2026), so aging and the queue stay meaningful. Every invoice is priced through `computeInvoice` (the reference did this, so seeded tax is right by construction) and numbered through the counter.

1. **FolioSettings** with defaults.
2. **Entities:**
   - `VWX` "Sanskaar Webx Services LLP", trade name "Vistaar WebX", GST, GSTIN `23AAXFS1234A1Z5`, PAN `AAXFS1234A`, 4th Floor, Vijay Nagar, Indore 452010, state 23, accounts@vistaarwebx.com. Bank: HDFC, a/c `50200098765432`, IFSC `HDFC0001234`, UPI `vistaarwebx@hdfcbank`. Signatory Sanskaar Singh. Terms: "Payment due within 15 days of the invoice date. Interest at 1.5% per month applies on overdue amounts."
   - `VSL` "Vistaar Solutions", non-GST, PAN `BBXPS5678B`, same address, a/c `50200011223344`, UPI `vistaarsolutions@hdfcbank`.
3. **Service items:**

   | Code | Name | Unit | Rate | SAC |
   |---|---|---|---|---|
   | SVC-RET | Growth Retainer | month | ₹75,000 | 998365 |
   | SVC-WEB | Website Development | project | ₹2,50,000 | 998314 |
   | SVC-ADS | Paid Media Management | month | ₹45,000 | 998365 |
   | SVC-SEO | SEO Programme | month | ₹35,000 | 998365 |
   | SVC-CRO | CRO Audit | nos | ₹60,000 | 998314 |
   | SVC-SHOOT | Content Production | day | ₹40,000 | 998386 |
   | SVC-CONS | Advisory | hour | ₹5,000 | 998311 |

   All at 18%.
4. **Clients:** reuse existing core clients if Orbit seeded them (match by name), else create these with 2-letter states, plus billing profiles:

   | Client | GSTIN | State | Default entity | Terms | TDS | Notes |
   |---|---|---|---|---|---|---|
   | Aarav Retail Pvt Ltd | `27AABCA1234B1Z9` | MH | VWX | 30 days | 194J 10% | contacts Priya Nair (finance, primary, reminders) and Rohit Shah |
   | Nirvana Wellness LLP | `23AABCN5678C1Z3` | MP | VWX | 15 days | | opening balance ₹1,25,000 as on 200 days ago |
   | Kabir Foods Pvt Ltd | `29AABCK9012D1Z7` | KA | VWX | 30 days | 194C 2% | |
   | Meera Jewellers | unregistered | MP | VSL | 15 days | | |
   | Orbit Interiors | unregistered | MP | VSL | 15 days | | |
   | Zenith Motors Pvt Ltd | `07AABCZ2345F1Z1` | DL | VWX | 45 days | | |
   | Saanvi Ceramics | `24AABCS6789G1Z8` | GJ | VWX | 30 days | | core status inactive |

5. **Retainers:**

   | Client | Name | Amount | Billing day | Start | Entity | GST |
   |---|---|---|---|---|---|---|
   | Aarav | Growth Retainer | ₹1,25,000 | 1 | 6 months ago | VWX | 18% |
   | Kabir | Paid Media Retainer | ₹65,000 | 1 | 4 months ago | VWX | 18% |
   | Zenith | SEO & Content Retainer | ₹85,000 | 5 | 8 months ago | VWX | 18% |
   | Orbit Interiors | Social Media Retainer | ₹25,000 | 1 | 3 months ago | VSL | 0 |

   All monthly, in advance.
6. **Plan:** Nirvana "Shopify Replatform" `PLN-0001`, ₹8,00,000 @ 18%, start 75 days ago. Phases: Discovery & design sign-off 25% (due −60d), Build & migration 40% (−10d), UAT & launch 25% (+20d), Post-launch stabilisation 10% (+50d).
7. **Issued invoices** (backdated issue dates are fine in seed; insert in date order so series stay chronological):
   - Aarav: monthly retainer invoices for the last 6 months (IGST: inter-state MH vs MP). The oldest 4 are settled by cash ₹1,35,000 + TDS ₹12,500 each (as allocation TDS, **not** a credit note); the last 2 are open.
   - Kabir: 4 monthly (IGST); the oldest 2 are settled by cash ₹75,400 + TDS ₹1,300; 2 open and ageing.
   - Zenith: 5 monthly (IGST); 2 paid ₹1,00,300; 1 part-paid ₹50,000; 2 open.
   - Orbit Interiors: 3 monthly sale invoices from VSL; 2 paid by UPI.
   - Nirvana: milestone 1 (₹2,00,000 + CGST 18,000 + SGST 18,000 = ₹2,36,000) paid; milestone 2 (₹3,20,000) open, 10 days old. Phases updated to paid and invoiced.
   - Meera: "Festive campaign creative and production" ₹85,000 (sale) paid in cash; "Product photography — two days" ₹60,000 open.
   - Plus 2 drafts (one generated retainer draft for the current month for Aarav, one hand-built for Meera), so the "drafts waiting" tile and the partial index are exercised.
8. **Advance:** VWX receipt ₹1,50,000 from Aarav 5 days ago, unallocated ("Advance against next quarter, to be applied when invoiced").
9. **One bounced receipt:** a Zenith cheque ₹50,000, bounced, reason "Insufficient funds".
10. **Credit note:** one against a Zenith invoice, ₹10,000 taxable post-sale discount.
11. **Quotes:** one sent quote (Kabir, SEO Programme ₹35,000 × 3), one accepted proforma (Meera).
12. **Follow-ups:** for each overdue invoice, an open follow-up. If more than 45 days late: due 2 days ago, channel call, notes "Third attempt. Escalate to the founder if there is no commitment this week." Otherwise: due today, channel email, notes "Standard chase against the outstanding balance." Assign to a finance member.
13. **Message log:** a few sent and logged reminders on the overdue invoices, so the chase history shows.

---

## 11. Tests (Vitest; port these, keep the reference's case names)

| Folio test file | Port from | Cases |
|---|---|---|
| `engine/totals.test.ts` | `lib/invoice/totals.test.ts` | all 17 + 2 `balanceDue` cases (§6.3 worked examples; e.g. the odd-tax case uses rate 100_005 @ 18% intra, asserting CGST = SGST; round-off uses rate 100_040 inter, asserting `total % 100 === 0` and total = taxable + tax + roundOff) |
| `engine/gst.test.ts` | `lib/invoice/gst.test.ts` | GSTIN accept/lower-case/length/missing Z/bad PAN block/empty; PAN; state and PAN extraction; null on invalid; `gstinMatchesState`; `resolveSupplyType` (same → intra, different → inter, sale → exempt whatever the states, export/SEZ, unknown state → inter); `isTaxable`. Add: `clientStateCode` priority order, letters/name → code, UTGST flag |
| `engine/numbering.test.ts` | `lib/invoice/numbering.test.ts` | FY boundaries (April starts, March belongs to previous, calendar turn, `1999-04-01 → 1999-00`); FY range (incl. `2027-28` ending `2028-03-31`); malformed label throws; padding and no truncation; `dueDateFor` (+terms, 0, month end); `addBillingPeriod` (monthly, clamp 31 → 28/30, clamp doesn't shorten the next, quarterly across year end, annual); `firstBillingDate` (3 cases); `servicePeriodFor` (advance, arrears, quarterly); `dueBillingDates` (catch-up `2026-06-01..08-01` for asOf `2026-08-15`; resumes after last; stops at end; nothing before start; bounded at 24) |
| `engine/aging.test.ts` | `lib/ledger/aging.test.ts` | negative before due, zero on due, whole days, DST-proof; due today is current; 1 day late → 1_30; inclusive at 30/60/90; one bucket each; buckets sum; overdue excludes current; ignores settled; empty → zeros; DSO and null; priority by age then amount; no mutation; exposure ignores overpayment |
| `engine/money.test.ts` | `lib/money.test.ts` (relevant parts) | `percentOf`, `roundToRupee`, `sumPaise`, `amountInWords` (whole, lakh/crore, paise, zero, negative), `formatINRForPrint` (Rs., en-IN grouping, never ₹) |
| `engine/calendar.test.ts` | `lib/dates.test.ts` (relevant parts) | ISO validation, UTC parsing, round trip, days in month incl. leap, `addDays` across months |
| `engine/csv.test.ts` | `lib/reports/csv.test.ts` | quoting, doubled quotes, null → empty, newline kept, zero kept, comma join, BOM, CRLF, header-only, titled preamble (issuer, blank row, no period line, BOM, comma in title). **Add:** formula-injection prefix |
| `collections/schedule.test.ts` | `lib/reminders/schedule.test.ts` | advance notice at −3; not before its date; never twice per channel; email sent ≠ WhatsApp sent; catch-up; oldest first; stops when paid/balance 0; disabled → nothing; empty cadence → nothing; `toneFor` escalation. **Change:** catch-up now returns only the latest missed offset plus older ones flagged skip; update the "catches up on every offset missed" case accordingly |
| `collections/compose.test.ts` | `lib/reminders/compose.test.ts` | subjects by tone, names the invoice, first-name greeting, neutral greeting, states number/dates/amount, courteous early/firm late, advance never accuses, sign-off; WhatsApp single short message, carries number and amount, mentions lateness; `whatsappLink` (prefilled, 91 for 10 digits, keeps country code, refuses short) |
| `engine/settlement-math.test.ts` | new (from `settle.ts` rules) | status derivation (issued/part/paid; draft and void untouched); TDS counts; write-off zeroes balance without changing status; balance never negative; ledger-closing = Σ balances − unapplied identity on a fixture |

Permissions are the catalog's (foundation). Do not port `lib/auth/permissions.test.ts`.

The integrity rules from `scripts/verify-guards.ts` must hold through the model hooks. Unit-test the pure validator functions where you extract them:
1. issued invoice cannot be re-priced, by `save`, `findOneAndUpdate` or **`updateOne`**
2. its lines cannot change
3. a sale invoice cannot carry tax
4. CGST and SGST cannot differ
5. IGST and CGST cannot coexist
6. a draft cannot hold a number
7. the due date cannot precede the issue date
8. a receipt cannot allocate more than it received
9. an invoice cannot be settled beyond its total
10. a receipt cannot list the same invoice twice
11. a non-GST entity cannot hold a GSTIN
12. an unrelated field on an issued invoice (`internalNotes`) stays writable

---

## 12. Reference bugs and gaps: do not port these

1. **Draft collision:** the compound `unique + sparse` index on `{entityId, number}` with `number: null` makes a second draft per entity fail (E11000). Same for credit notes. → partial index (§5.3).
2. **Client edit inflates money:** the client form pre-fills `creditLimit` and `openingBalance` with paise in rupee inputs, so each save multiplies them by 100. → rupees in forms.
3. **Credit notes:** model, settlement and ledger exist, but there is **no service and no UI**. KNOWN-GAPS claims the service layer is done; it is not. **Quotes/proformas don't exist. Emailing an invoice to the client doesn't exist** (only reminders). Manual follow-up creation is unreachable (`saveFollowupAction` is never used). → built in Folio.
4. **Allocation checks:** allocation never checks that the invoice belongs to the receipt's client or entity, or that it is issued/part-paid. → §6.8.
5. **Retainer catch-up:** generation bills one period per click (it advances `nextInvoiceOn`); `dueBillingDates` is tested but unused. Voided or deleted periods are lost. → stateless generation (§6.9).
6. **Milestones:** a draft milestone invoice locks the phase forever once the draft is deleted; `paid` is never set; void doesn't release the phase. → §6.10, §6.5.
7. **Ranged statements** label a period-only figure as "Closing balance" and "owes". → start at brought forward (§6.15).
8. **Opening balance** is in the ledger but not in outstanding or aging, and receipts can't settle it. → opening invoice row (§6.11).
9. **TDS:** cleared with credit notes (seed and OPERATIONS.md), which wrongly reduces GST taxable value; `receipt.tdsAmount` is stored and ignored. → TDS on allocations (§6.8).
10. **Issued PDFs read the client live:** client name and address are read at render time, so editing a client rewrites history. → snapshots (§5.3).
11. **Reminder flood:** catch-up sends every missed offset in one run. → latest only (§6.14).
12. **Settings ignored:** invoicing settings (round-off toggle, FY start, default GST, show TDS) and the reminder send-window are never read; the builder hard-codes round-off on. → only keep what is read (§5.12).
13. **Receipt numbers** share a hard-coded `RCP` prefix across entities. → per-entity prefix.
14. **Immutability hook coverage:** the hook covers `save` and `findOneAndUpdate` only; `updateOne`/`updateMany` bypass it. → guard all (§5.3).
15. **Tenancy in `$unionWith`:** porting the ledger's `$unionWith` naively would bypass `ctx.db`'s org filter → cross-tenant leak. → org match in every sub-pipeline (§3).
16. **GST summary** ignores credit notes and has no B2B/B2C/HSN split, which is not enough for GSTR-1. → §6.17.
17. **CSV** has no formula-injection guard. → §6.18.
18. **Manual reminder recipient:** the manual reminder trusts a client-posted "to" address and body. → recipients resolved server-side.
19. **Cancel rules:** cancel checked `amountPaid` only (credit notes ignored) and allowed cancelling paid-by-credit invoices; `clients.read_sensitive` was never enforced; the entity settings form drops address line 2; nothing is paginated; the builder ignores the client's default entity and never exposes export/SEZ.
20. **Rounding loss:** the CGST/SGST levelling silently charges 1 paisa less tax on lines with odd tax. This one is kept deliberately (§6.3); just know it.
21. **Missing UTGST:** UTGST wording is missing for UTs without a legislature (label only, §6.2).
22. **Dead code:** `createAdvanceInvoice`, `peekDocumentNumber`, `unappliedCredit` (service), `daysSalesOutstanding`, `totalExposure`, `reminderRecipients` and `monthsPerPeriod` are exported but unused. Folio uses peek and DSO and drops the rest, since an advance is just `billingType: 'advance'` on the normal builder.

---

## 13. Copy bank (reuse; adapted to Flowbit's "name what happened to what")

- "Invoice VWX/2026-27/0007 issued." · "Draft invoice for Aarav Retail saved." · "Draft deleted. No number was spent."
- "Invoice VWX/2026-27/0007 voided. Its number stays spent, as the series requires."
- "Written off. It stays in the ledger as a write-off, not as a payment."
- "VWX-RC/2026-27/0012 recorded and applied." · "VWX-RC/2026-27/0012 recorded. ₹50,000 is held as advance credit."
- "Applied ₹25,000 to VWX/2026-27/0007." · "Released. VWX/2026-27/0007 is owed again and the credit is free."
- "Marked bounced. Every invoice it had settled is owed again and back on the collections list."
- "Credit note VWX-CN/2026-27/0003 issued against VWX/2026-27/0007."
- "3 draft invoices created. Review them before issuing." · "No retainers are due right now."
- "Closed, and the next chase is scheduled." · "Snoozed. It comes back on 8 Oct 2026."
- "Sent to priya@aavretail.example." · "Logged. No email provider is configured, so nothing was delivered to priya@aavretail.example." · "Recorded. Send it from the WhatsApp window that opened."
- Errors: "Only a draft can be edited. Raise a credit note instead." · "Invoice VWX/2026-27/0007 is issued and its figures are locked. Raise a credit note instead." · "Invoice VWX/2026-27/0007 has only ₹12,000.00 outstanding." · "This receipt has only ₹8,000.00 left to allocate." · "A cancellation needs a reason on the record." · "Write down what happened, even if it was nothing." · "A GST-registered entity must have a GSTIN." · "This GSTIN is registered in state 27, but the billing address is in state 23."
