# Conflicts B: rules, promises and numbers (audit, 11 Oct 2026)

Read-only audit. No code was changed. Each row lists what two sources say, what the code actually does, the recommended single truth, and whether the owner has to decide.

Paths are relative to `flowbit/` unless they start with `flowbit-launch/`. Line numbers are as of 11 Oct 2026.

Ranking: legal or money promises first, then things a customer will notice, then internal docs.

---

## Tier 1: legal and money promises (fix before launch)

### 1. Yearly price: "10 × monthly, 2 months free" vs "12 × monthly, 50% off year 1"
- **Status (12 Oct):** Fixed d1e82c7 (10 × monthly + 50% off year 1: 20 on Suite pay ₹14,900, then ₹29,800). Launch decks and PDFs outside the repo still need the first-year line.
- **A:** the launch materials say yearly = 10 × monthly, "2 months free":
  - `flowbit-launch/BRIEF.md:25`
  - `flowbit-launch/content/LAUNCH-BIBLE.md:116` (20 people on Suite = ₹29,800 a year)
  - `flowbit-launch/content/carousels.json:378` and `carousels/src/C5.html:199`
  - `flowbit-launch/decks/D-SUITE/project/slides/pricing.html:53`, `D-MUSTER/.../pricing.html:41`, `D-FOLIO/.../pricing.html:31`, `D-CA/*`
  - `flowbit-launch/manual/index.html:195`, `manual/parts/10-start.html`
  - the built PDF manuals `flowbit-launch/manual/product-pdfs/build/complete.html:38` and `getting-started.html` (built 10 Oct)
  - `flowbit-launch/finance/PROFIT-PLAN.md:127` ("The code already works this way")
- **B:** the product says yearly = 12 × monthly, with 50% off the first yearly invoice only:
  - `src/lib/plans.ts:17` (`YEARLY_MONTHS = 12`)
  - `src/lib/first-year-discount.ts:9`
  - `src/modules/marketing/content/faq/plans.ts:63`
  - `src/components/marketing/pricing-section.tsx:37`
  - `content/manual/10-start.html:23-24`, `60-admin.html:324`
  - `docs/specs/console.md:23`
- **Code does:** 12 ×, with 50% off the first yearly invoice. A 20-person Suite pays ₹17,880 in year 1, then **₹35,760 at renewal**. The campaign promises ₹29,800 every year.
- **Single truth:** `lib/plans` and `lib/first-year-discount`. Rewrite the campaign, the decks and the tutorial cards, and rebuild the PDFs. BRIEF §2 also says "do not invent discounts", but the product now has one.
- **Owner decision:** yes. Either keep the 50% year-1 offer and change every launch asset, or go back to 10 × in code.

### 2. Workspace deletion: "kept 30 days, then removed", but nothing is ever removed
- **Status (12 Oct):** Fixed d936702 (purge 30 days after the owner deletes; 7-day reminder; emails).
- **A:**
  - `src/components/settings/general-forms.tsx:138,142`: "Data is kept for 30 days … then removed."
  - `src/modules/marketing/content/security.ts:62`: "can be undone for 30 days".
  - `src/modules/marketing/legal/privacy.ts:25`: "When a workspace owner asks us to delete … we remove its data".
  - `content/manual/60-admin.html:40`.
- **B:** `src/modules/settings/general-actions.ts:86-94` only sets `deletedAt`.
  - `lib/lifecycle.ts:82,181-187`: `deletionDue()` is never true for a workspace with `deletedAt` (its stage is `deleted`, not `blocked`).
  - `modules/lifecycle/job.ts:70` is the only caller of `purgeWorkspace`.
  - Staff can restore the workspace for 30 days (`modules/console/account-actions.ts:32`).
- **Code does:** an owner-deleted workspace stays soft-deleted for ever.
- **Single truth:** the promise (purge 30 days after the owner deletes, excluding the records the law requires). Add a purge path for `deletedAt` older than 30 days.
- **Owner decision:** no. This is a DPDP erasure promise, so build it.

### 3. Unpaid-workspace deletion and log pruning are promised, but run as dry runs
- **Status (12 Oct):** Fixed d936702 (on by default on deployed production; `=false` is the kill switch). The DEPLOY guide and the env.ts comment are Z's.
- **A:** these all say data is deleted 90 days after blocking:
  - `legal/terms.ts:19`
  - `legal/refunds.ts:16`
  - `legal/dpa.ts:34`
  - `faq/plans.ts:37`
  - `components/settings/subscription-buttons.tsx:18`

  These say old message logs are pruned after 13 months:
  - `faq/settings.ts:72`
  - `docs/V2-PLAN.md:81`
- **B:**
  - `modules/lifecycle/job.ts:1-8,80`: deletion is a dry run unless `LIFECYCLE_DELETE_ENABLED=true`.
  - Retention pruning is a dry run unless `RETENTION_PRUNE_ENABLED=true`.
  - `docs/DEPLOY-VERCEL.md:238-239` says "Leave unset at first".
- **Code does:** nothing is deleted until both env switches are on.
- **Single truth:** the published promise. Put a date for turning on both switches into the launch checklist.
- **Owner decision:** yes, on when to switch them on.

### 4. Log retention: "at least 1 year" vs "13 months" vs 365 days
- **Status (12 Oct):** Fixed d936702 + 4d3c67d (one 13-month constant; DPA, Privacy and FAQ say 13 months).
- **A:**
  - `legal/dpa.ts:34`: logs kept "for at least one year".
  - `faq/settings.ts:72`: "pruned after 13 months".
- **B:**
  - `src/modules/privacy/retention.ts:14`: `RETENTION_DAYS = 395`.
  - `src/lib/lifecycle.ts:22`: `LOG_RETENTION_DAYS = 365` (after a workspace is deleted).
- **Code does:** 395 days, once pruning is switched on (see #3).
- **Single truth:** one constant, with the DPA and FAQ both saying "13 months".
- **Owner decision:** no.

### 5. Staff masking of salary, bank and PAN: three different promises
- **Status (12 Oct):** Fixed f85eeb4 (masked for every staff role, Admin included; audit text and import previews too). DPA version bumped in 4d3c67d.
- **A:** `faq/getting-started.ts:65`: "salary, bank and PAN details stay masked" (always).
- **B:** `legal/dpa.ts:23`: masked "unless the setup task needs them".
- **C:** `content/manual/60-admin.html:666` and `docs/specs/console.md:162`: masked for Sales and Accounts staff only.
- **Code does:** `src/lib/console/mask.ts` and `roles.ts` `seesSensitive` let **Admin staff see the values unmasked** in every support view. A read grant from the owner is required first (`app/console/(staff)/accounts/[id]/support/page.tsx:37`).
- **Single truth:** the manual's wording ("masked for Flowbit sales and accounts staff; Flowbit admins see them only during an approved support visit"). Fix the FAQ and the DPA to match.
- **Owner decision:** yes. Either keep Admin unmasked or mask for everyone.

### 6. Who starts on Free, and "once per business" vs "once per workspace"
- **Status (12 Oct):** Fixed bcaf899 + 4d3c67d (one trial per business; Terms, Refunds and FAQ rewritten).
- **A:** `legal/terms.ts:19` and `legal/refunds.ts:15` say:
  - "A new workspace starts on the Free plan" / "Every workspace starts on the Free plan";
  - "Once per business you can also start a 15-day trial".
- **B:**
  - `lib/account-types.ts:93-96`: workspaces with more than 5 people start on the **Trial**.
  - `lib/lifecycle.ts:110-113`: the trial is limited to **once per workspace** (`trialStartedAt`).
  - **Free** is the once-per-business limit, by GSTIN, PAN or email (`lib/lifecycle.ts:135`, `docs/specs/console.md:24`).
  - `faq/plans.ts:30` says "one trial per workspace", which matches the code.
- **Code does:** ≤5 people → Free; more → Trial. One Trial per workspace; one Free workspace per business.
- **Single truth:** the code. Rewrite the trial sections of the Terms and Refunds pages. The comment at `terms.ts:9` already asks for this.
- **Owner decision:** yes, on whether the trial should be limited per business (today a new workspace gets a new trial).

### 7. "Renews automatically" and "retried for 7 days"
- **Status (12 Oct):** Fixed 4d3c67d.
- **A:**
  - `legal/terms.ts:20`: "Subscriptions renew automatically … If a renewal payment fails … retried".
  - `faq/plans.ts:76`: "It renews automatically."
  - `legal/refunds.ts:19`: "retried".
- **B:**
  - `content/manual/60-admin.html:369-374`: only autopay renews by itself.
  - `modules/billing/dunning.ts:20-30,42`: workspaces without autopay get reminders and an "overdue" email, not a retry.
  - Workspaces that pay by due bill or offline transfer (`modules/billing/bills.ts`) never renew on their own.
- **Code does:** renewal is automatic only for a checkout subscription or autopay (`modules/billing/autopay.ts:60`). Every other workspace goes past-due, gets 7 days, then turns read-only.
- **Single truth:** "Renews automatically if you pay by card checkout or autopay; otherwise we send a bill." Change the Terms, Refunds and FAQ to match.
- **Owner decision:** no.

### 8. Flowbit charges 18% GST before it has a GSTIN
- **Status (12 Oct):** Fixed 563f003 (no GST line and 'not a tax invoice' while FLOWBIT_GSTIN is unset; CA question 16).
- **A:** `legal/terms.ts:20`, `faq/plans.ts:44` and `pricing-section.tsx:39` say "Every payment gets a GST invoice from Sanskaar Webx Services LLP".
- **B:**
  - `src/lib/env.ts:97-99,260-265`: `FLOWBIT_GSTIN` defaults to empty.
  - `modules/subscription/invoice-pdf.tsx:60,110`: the invoice then prints "DRAFT" and "GSTIN: not registered".
  - `lib/plans.ts:153`: `quote()` still adds 18% GST.
- **Code does:** collects GST even when no GSTIN is set.
- **Single truth:** block live checkout (or drop GST) while `FLOWBIT_GSTIN` is empty. Also add "Flowbit" as a trade name on the registration (`docs/specs/console.md:207`).
- **Owner decision:** yes, together with the CA.

### 9. Supplier name: "Flowbit Technologies" vs the LLP
- **Status (12 Oct):** Fixed: the app already uses the LLP; flowbit-launch/BRIEF.md corrected (outside git). Decks D-FOLIO, D-PLAN, D-SUITE and D-CA, LAUNCH-BIBLE and FOUNDER-* still say 'Flowbit Technologies'.
- **A:** `flowbit-launch/BRIEF.md:8`: "made by Flowbit Technologies".
- **B:** `src/lib/company.ts` (`COMPANY_LEGAL_NAME = 'Sanskaar Webx Services LLP'`), every legal page, and `docs/V2-PLAN.md:127-131`.
- **Code does:** uses the LLP.
- **Single truth:** the LLP. Fix the BRIEF and grep every launch asset.
- **Owner decision:** no.

### 10. Seat counting: "higher of logins and employees" vs the per-product counts and the Suite union
- **Status (12 Oct):** Fixed 4d3c67d (FAQ and manual describe the code's counting).
- **A:** these say you pay for the higher of logins and employees:
  - `content/manual/60-admin.html:325`
  - `docs/specs/console.md:20`
  - `faq/plans.ts:23` (the last two are written for Free)
- **B:** `faq/plans.ts:51` and `faq/work.ts:92` say each product counts its own people, and Suite counts each person once.
- **Code does** (`lib/billing.ts:274-305`, `modules/subscription/usage.ts:75`):
  - **Free:** max(logins + pending invites, payroll employees).
  - **Suite:** logins + employees *without* a login (the union, not the maximum).
  - **Separate products:** each product is counted on its own.
  - Pending invites count everywhere.
- **Single truth:** the code. Say "Free: the higher of …; Suite: everyone who signs in plus employees without a login; products: each counted separately", and mention pending invites.
- **Owner decision:** no.

### 11. Folio's 3-user limit is a hidden upgrade trap
- **Status (12 Oct):** Fixed 624b217 + 4d3c67d (behaviour unchanged; stated on pricing and in the FAQ, D7).
- **A:**
  - `faq/plans.ts:51,103` and `marketing/pricing.ts:32`: "Folio includes 2 firms and 3 users".
  - `faq/sales.ts:58`: people who only view do not count (for Orbit).
- **B:**
  - `modules/subscription/usage.ts:40-42`: anyone holding **any** Folio permission counts as a Folio user. That includes Owner, Admin, Finance, and **Sales** (`quotes.write`, `lib/permissions.ts` sales role).
  - `lib/billing.ts:305` and `modules/subscription/selection.ts:161`: the limit is a fixed 3, with no way to buy more ("Move to Suite").
- **Code does:** an Owner, an Admin and two salespeople already make 4 Folio users, so a Folio + Orbit buyer is pushed to Suite (minimum ₹1,490 a month).
- **Single truth:** owner choice. Either count only `invoices.write`-type permissions, sell extra Folio users, or state plainly that Owner, Admin, Finance and Sales count.
- **Owner decision:** yes.

### 12. Free gets paid add-ons (client portal, custom domains)
- **Status (12 Oct):** Fixed 1950c08 (Free gets no paid add-ons, through hasAddOn and entitlements).
- **A:**
  - `docs/specs/console.md:65`: add-ons are not on Free.
  - `docs/V2-PLAN.md:41`.
  - `faq/work.ts:99`: the portal is "in Suite, as an add-on, and during a trial".
- **B:** `src/lib/addons.ts:24`: `hasAddOn` returns true for any `status === 'trialing'`, and **Free is stored as trialing**. The same bug was fixed for brand colours in `lib/brand-theme.ts:157-158`.
- **Code does:** Free workspaces get the portal and custom domains (about ₹999 a month). Meetings AI is gated only because its cap is 0 hours.
- **Single truth:** the spec. Exclude `accountType === 'free'` in `hasAddOn`.
- **Owner decision:** no.

---

## Tier 2: promises a customer will notice

### 13. Hero and CTA say "15-day trial" for everyone
- **Status (12 Oct):** Fixed 624b217 ('Start free' + note). Tutorial voice lines and the gs-home screenshot still show the old CTA.
- **A:** these say every new workspace gets a 15-day trial:
  - `app/(marketing)/page.tsx:27,68` ("Start your 15-day trial")
  - `products/[slug]/page.tsx:61,64`
  - `cta-band.tsx:26` ("All four products for 15 days")
  - `contact/page.tsx:33`
  - `pricing/page.tsx:18`
  - `site-footer.tsx:10`
  - `flowbit-launch/BRIEF.md:36,123` ("the only call to action")
  - `flowbit-launch/tutorials/script.v2.mjs:45,56,353,360` ("every new workspace gets a fifteen day free trial")
- **B:** the small print on the same pages, `faq/plans.ts:23`, `onboarding/step-workspace.tsx:121`, and the code: teams of up to 5 get **Free for 6 months**, not a trial.
- **Single truth:** the code. Change the CTA to "Start free". Re-record or re-voice the tutorial lines.
- **Owner decision:** yes, on the campaign wording.

### 14. What opens when a workspace is blocked
- **Status (12 Oct):** Fixed 624b217 + d936702 + 4d3c67d (BLOCKED_OPEN_PAGES everywhere). docs/specs/console.md is Z's.
- **A:**
  - `lib/lifecycle-copy.ts:39`: "only Subscription and Export open".
  - `legal/terms.ts:19`: "only the subscription page and export".
  - `lib/plans.ts:309`: "only Settings → Subscription".
  - `docs/specs/console.md:71`: "Only Billing and Export".
- **B:** `faq/plans.ts:37`: "subscription, billing and export".
- **Code does:** routes passing `allowBlocked` are Subscription, Billing, Wallet, Export, Security and personal Notifications (`app/app/settings/*`).
- **Single truth:** the FAQ's wording. Update the banner, the Terms and the spec.
- **Owner decision:** no.

### 15. HR executive can see every salary
- **Status (12 Oct):** Fixed f85eeb4 (payroll.read removed from hr_exec).
- **A:**
  - `content/manual/10-start.html:215`, `60-admin.html:245`: "No payroll approval, salary edits or sensitive IDs".
  - `lib/permissions.ts:50` (role description): the same.
- **B:** `lib/permissions.ts:52-54` gives `payroll.read`, which `lib/catalog.ts:77` labels "View salaries and payroll cycles".
- **Code does:** HR executive opens Payroll, Salary structures and Tax worksheets.
- **Single truth:** owner choice. Either drop `payroll.read`, or say "can view salaries but not change or approve them".
- **Owner decision:** yes.

### 16. WhatsApp: "coming soon" vs "works today"
- **Status (12 Oct):** Fixed 4d3c67d (site and manual say coming soon; the in-app page opens only when the switch is on).
- **A:**
  - `faq/integrations.ts:72`.
  - `content/manual/70-new.html:138`, `50-folio.html:358`, `60-admin.html:438`: "coming soon".
  - `flowbit-launch/BRIEF.md` §3: "no WhatsApp".
- **B:**
  - `app/app/settings/integrations/whatsapp/page.tsx:61`: "Works today".
  - `app/app/settings/billing/wallet/page.tsx`: the wallet.
  - `legal/terms.ts:22` and `privacy.ts:22`: describe WhatsApp sending.
  - `docs/V2-PLAN.md:79`: "built 8 Oct".
- **Code does:** WhatsApp is built and hidden behind the env switch (`lib/feature-flags.ts`).
- **Single truth:** "coming soon" while the switch is off. When it goes on, the FAQ and manual must change on the same day.
- **Owner decision:** yes, on the go-live date.

### 17. WhatsApp wallet rates and packs: three versions
- **Status (12 Oct):** Open: the code (wallet/rules + Console) is the one rate card; marking notifications-v2 §0b superseded is Z's; credit expiry waits on the CA.
- **A:** `docs/specs/notifications-v2.md:120-121,230`: utility ₹0.20, marketing ₹1.20, packs ₹500–₹5,000 with no bonus.
- **B:**
  - `docs/V2-PLAN.md:176-188`: ₹0.25, ₹1.25, auth and service ₹0.20, packs up to ₹10,000 with a 5/10/12% bonus.
  - `modules/wallet/rules.ts:20-33,90-93` matches B, and also sets free messages: Suite 1,000, Custom 300, Free and Trial 0.
- **Code does:** B. Paid credit expires after 12 months, which the CA has not confirmed (`V2-PLAN.md:188`). The wallet page states it as fact (`wallet/page.tsx:117`).
- **Single truth:** the Console rate card. Mark notifications-v2 §0b as superseded.
- **Owner decision:** yes, on credit expiry and refund (CA).

### 18. Interakt cost assumptions
- **Status (12 Oct):** Open: docs only (Z).
- **A:** `docs/specs/console.md:199`: Meta rates of ₹0.86 and ₹0.115.
- **B:** `docs/V2-PLAN.md:149-152`: Interakt Growth ₹0.958 / 0.150 / 0.128.
- **Code does:** `modules/whatsapp/templates.ts:46` uses the Interakt figures.
- **Single truth:** the Console. Update the spec.
- **Owner decision:** no.

### 19. Privacy: "one essential cookie, no tracking"
- **Status (12 Oct):** Fixed 4d3c67d (cookies listed by purpose). Whether fb_utm needs consent is still for the lawyer.
- **A:** `legal/privacy.ts:23`.
- **B:** the code sets `fb_utm` (signup attribution, 30 days, `lib/utm.ts:8-10`), `fb_plan` (7 days), `fb_oauth`, the 2FA pending and remember-device cookies, `fb_portal`, `fb_claim`, `fb_ps`, `fb_slack`, `fb_gint` and `fb_console`.
- **Code does:** many cookies, one of them for marketing attribution.
- **Single truth:** list the cookies by purpose. Decide whether `fb_utm` needs consent.
- **Owner decision:** yes (lawyer).

### 20. Where data is stored
- **Status (12 Oct):** Fixed 4d3c67d (one DATA_LOCATION sentence).
- **A:** `marketing/content/security.ts:69` and `faq/settings.ts:86`: "both in Mumbai".
- **B:** `legal/dpa.ts:35`: "in India and in other countries where our providers operate".
- Resend (email) and Anthropic (AI) process data outside India.
- **Single truth:** "Stored in Mumbai; some providers (email, AI) process data abroad." Use the same sentence on all three pages.
- **Owner decision:** no.

### 21. Sub-processor lists differ
- **Status (12 Oct):** Fixed 4d3c67d (one named list in legal/providers.ts).
- **A:** `legal/privacy.ts:24` lists Razorpay *for subscriptions* and Google sign-in.
- **B:** `legal/dpa.ts:25-31` lists Razorpay only for Folio payment links, with no Google, Vercel or MongoDB by name, and no Gmail sending (Orbit sequences) or GSP (e-invoice).
- **Single truth:** one named list used by both pages.
- **Owner decision:** no.

### 22. Email action links: an undocumented sign-in rule
- **Status (12 Oct):** Fixed 764fa0a + 4d3c67d (rule documented; sign-in for every approval not added).
- **A:** `faq/hr.ts:58`, `faq/settings.ts:37` and `faq/work.ts:71`: "approve straight from the email".
- **B:**
  - `modules/actionlinks/token.ts:35,55-70`: a link works for 7 days for **whoever holds it**, with no sign-in.
  - `modules/actionlinks/kinds.ts:44`: only claims and bank changes need the recipient signed in.
- **Code does:** a forwarded leave or timesheet email can be approved by anyone who holds it.
- **Single truth:** document the rule, and consider requiring sign-in for every approval.
- **Owner decision:** yes (security choice).

### 23. Two trial lengths
- **Status (12 Oct):** Fixed 624b217 (product trial removed).
- **A:** 15-day workspace trial (`lib/plans.ts:10`).
- **B:** 14-day one-time product trial (`lib/plans.ts:21`, `app/app/locked/page.tsx:60`). It is in no FAQ, manual page or Terms.
- **Single truth:** 15 for both, or document the 14.
- **Owner decision:** yes (small).

### 24. Manual upgrade panel offers a trial that is no longer available
- **Status (12 Oct):** Fixed 4d3c67d.
- **A:** `content/manual/60-admin.html:343`: when the free months or the trial end, the panel offers "Start 15-day trial".
- **B:** `lib/lifecycle.ts:110-114` refuses the trial when it was already used or the free months are over.
- **Single truth:** the code. Fix the manual.
- **Owner decision:** no.

---

## Tier 3: limits and numbers

### 25. Upload sizes
- **Status (12 Oct):** Fixed ec90662.
FAQ, manual and code all agree on 4 MB on Vercel. These numbers differ:
- **Employee import:**
  - `content/manual/30-muster-a.html:200` says "under 2 MB, 500 rows".
  - The People importer matches (`modules/muster/import/actions.ts:14`, 2 M characters).
  - The Settings → Import path allows 3 MB (`modules/imports/sheet.ts:13`).
  - These are two importers for the same data, with different limits.
- **`MAX_UPLOAD_MB`** is 10 off Vercel (`lib/upload-limit.ts:8`). `docs/FEATURES.md:387,395` notes old "10 MB" text.
- **Not in the FAQ:** recordings 200 MB (`meetings/ai/actions.ts:32`), export 500 MB of files (`lifecycle/export.ts:34`), avatar 2 MB, logos 1 MB.
- **Single truth:** one limits table in the FAQ, and one employee importer.
- **Owner decision:** no.

### 26. Rows per import
- **Status (12 Oct):** Fixed ec90662.
Each importer has its own limit:
- Team 200
- Employees 500
- Attendance 5,000
- Biometric 50,000 punches
- Leads, contacts and companies 2,000
- Folio items 1,000
- Projects 500
- Tasks 2,000

Sources: `modules/imports/importers/*.ts`, `orbit/constants.ts:143`, `muster/attendance/import.ts:15`.

Only Employees (500) and Leads (2,000) are documented. List them all on the Import page.

### 27. Workday length: 8 h vs 9 h
- **Status (12 Oct):** Fixed e055bfc (10:00–19:00 with 8 h of work).
- **A:** Work workload and estimates use 8 h (`modules/work/teams/workload.ts:4`, `tasks/constants.ts:29`).
- **B:** Muster office hours default to 10:00–19:00, which is 9 h (`lib/attendance-core.ts:17`, `content/manual/10-start.html:157`). The punch dial falls back to 9 h.
- **C:** automations' "business hours" are 09:00–18:00, Monday to Saturday (`modules/automations/timing.ts:14`, `60-admin.html:435`).
- **Single truth:** read the workspace's Muster office hours everywhere, or label each figure.
- **Owner decision:** no.

### 28. Hard-coded prices and limits vs Console-editable values
- **Status (12 Oct):** Partly fixed 74c037b (product pages read the price table; Console warns). The static manual tables stay hard-coded.
- **A:** the Console can change prices, Free seats, Free months, trial days and the discount (`lib/plan-config.ts`, `lib/console/settings-defaults.ts`).
- **B:** many places use fixed values instead:
  - Marketing, FAQ and legal pages read the constants (`marketing/pricing.ts:37-42` admits this).
  - These hard-code ₹ figures: `content/work.ts:56`, `orbit.ts:53`, `muster.ts:55`, `folio.ts:12,53,56`, and the manual tables at `10-start.html:28-33` and `60-admin.html:332-340`.
  - These hard-code "15": `lifecycle.ts:105` ("already had its 15-day trial"), `trialStartFields` (seats: 10), and `settings-defaults.ts:58` (`trialDays: 15`).
  - The wallet keeps its own `GST_PERCENT` (`modules/wallet/rules.ts:33`).
- **Code does:** a Console change makes the app disagree with the website, the Terms and the manual.
- **Single truth:** freeze public numbers in the Console (warn on edit), or render the website and legal pages from the settings.
- **Owner decision:** yes.

### 29. MCP limits
- **Status (12 Oct):** Fixed da0e3af (500 a day in the FAQ).
These agree: 120 requests a minute, 50 changes per apply, 500 writes a day, 7-day undo, paid and trial only (`modules/mcp/limits.ts`, `docs/specs/mcp.md:67`, `faq/integrations.ts:30,37`, `60-admin.html:492-495`). The FAQ does not show the 500-a-day limit. **No conflict.**

### 30. AI and Meetings AI caps
- **Status (12 Oct):** Fixed da0e3af (Test wording).
These agree:
- Arc: 0 on Free, 50 on trial, 500 on paid (`lib/ai-caps.ts:15`, `faq/integrations.ts:23`, `70-new.html:111`).
- Meetings AI: Free 0, trial 1 h, 5 h per seat (`lib/meeting-caps.ts:11`, PDF `extra.html:33`).

One edge: "Test" workspaces are described as having "no limits" (`lib/plans.ts:253`), but Test gets a 50 AI cap and the trial's 1 h of meetings.

---

## Tier 4: feature-status and compliance wording

### 31. The BRIEF's never-claim list is now wrong
- **Status (12 Oct):** Fixed: BRIEF §3 rewritten (outside git); PROFIT-PLAN not touched.
- **A:** `flowbit-launch/BRIEF.md` §3 and `finance/PROFIT-PLAN.md:183` say Flowbit has no TDS or Form 16, no IRN or e-way bill, no WhatsApp and no biometric import.
- **B:** the site claims all of these:
  - TDS and Form 130: `faq/hr.ts:86`
  - IRN and e-way bills: `faq/finance.ts:79`
  - biometric file import: `faq/hr.ts:44`
  - `compare.ts:29-30`
- **Single truth:** the site. Rewrite BRIEF §3 to list only what is truly missing: filing, Gantt, a native app, live biometric link, payouts, and credit-note, export and RCM IRN.
- **Owner decision:** yes (the campaign voice).

### 32. Form names
- **Status (12 Oct):** Fixed 4d3c67d. App UI labels are Y's (A16).
- **A:** `faq/hr.ts:86` uses "Form 138 (formerly 24Q)" and "Form 130 (formerly Form 16)".
- **B:** `compare.ts:30` says "the 24Q data export". The BRIEF says "Form 16".
- **Single truth:** "Form 138 (formerly 24Q)" everywhere.

### 33. E-invoice
- **Status (12 Oct):** No conflict; the IRN credit-note gap stays a roadmap item.
These agree: above ₹5 crore, with credit notes, exports and RCM not covered (`einvoice/payload.ts:15`, `faq/finance.ts:79`, `folio.ts:51`).

The gap is a risk, not a conflict: an invoice with an IRN can be credited only by a credit note that has no IRN. That legal gap should be on the roadmap.

### 34. Tally and IndiaMART
- **Status (12 Oct):** No conflict.
Both are marked beta consistently (`faq/finance.ts:86`, `faq/sales.ts:44`, `70-new.html:103`, `40-orbit.html:446`). **No conflict.**

### 35. TDS on Flowbit's own bills: 2% vs 10%, and the 98% rule
- **Status (12 Oct):** Open: waits on the CA (question 10).
- **A:** `modules/billing/rules.ts:15-23`: 2% under s.393(1) (formerly 194J). The payment link asks for the total less 2% of the taxable value.
- **B:** `rules.ts:36` settles a bill at ≥98% of the **GST-inclusive total**, which allows a slightly larger short payment (`docs/V2-REVIEW.md:38,173`).
- `docs/CA-QUESTIONS.md:49-50` still asks whether the rate is 2% or 10%.
- **Single truth:** settle at total − 2% of taxable, once the CA confirms.
- **Owner decision:** yes (CA).

### 36. DPDP dates and breach timing
- **Status (12 Oct):** Fixed da0e3af in the manual; the runbook is Z's.
- **Dates:** consistent everywhere ("13 May 2027, maybe Nov 2026").
- **Breach timing, A:** the DPA promises "aim … within 24 hours" (`legal/dpa.ts:32`).
- **Breach timing, B:** the runbook says "as soon as it is confirmed" (`docs/BREACH-RUNBOOK.md:23-24`), and the manual says the same (`60-admin.html:637`).
- **Single truth:** put "within 24 hours of confirming" into the runbook.

### 37. Founding offer, lifetime deals and lock-out
- **Status (12 Oct):** Open: owner decision.
- **A:** finance says there will be a founding offer, a lifetime discount, and no lock-out:
  - `finance/FINAL-PLAN.md:47-48`: "20 founding seats … 50% for life"; "Free plan, never a lock-out".
  - `PROFIT-PLAN.md:62,154-158`: a ₹149 founding lock.
- **B:** the spec and code have none of these, and they do lock out:
  - `docs/specs/console.md:13`: founding and lifetime were dropped.
  - `console.md:67-72`: read-only, then blocked, then deleted.
  - The code has no founding seats.
- **Single truth:** console.md. Mark the finance plans as out of date before the CA deck (`decks/D-CA`) is used.
- **Owner decision:** yes. The ₹999 + ₹199 pricing from January 2027 is still open (`console.md:26`, `V2-PLAN.md:118`).

### 38. Launch dates
- **Status (12 Oct):** Open: owner decision.
- **A:** `flowbit-launch/BRIEF.md` §7 and `README.md:3`: Day 1 is 5 Oct, launch 19 Oct.
- **B:** `docs/V2-PLAN.md:71`: "Before 12 Oct (launch 'The Tab Tax')".
- **C:** the memory notes: 12 Oct–10 Nov.
- **Single truth:** the BRIEF.
- **Owner decision:** confirm.

### 39. Positioning: "GST billing"
- **Status (12 Oct):** Open: owner decision.
- **A:** `docs/V2-PLAN.md:71` says to remove the "GST billing" framing (marked done).
- **B:** BRIEF §6 still promises "CRM and GST billing at ₹149", and "₹149" holds only from 10 people on Suite.
- **Single truth:** decide one hero line.

---

## Defaults that agree (checked, no change needed)

- **Quiet hours:** 21:00–08:00 (`messaging/preferences.ts:18`, `faq/settings.ts:37`, `60-admin.html:389`, notifications-v2:408).
- **End-of-day digest:** 18:00.
- **Morning brief default:** 08:30 (`briefs/job.ts:20`). It is not stated in the docs, which is fine.
- **Past-due grace:** 7 days everywhere.
- **Read-only:** 30 days everywhere.
- **Deletion:** 90 days after blocking, with notices at 30, 7 and 1 days, everywhere.
- **Extra Folio firm:** ₹199.
- **GST:** 18%.
- **Prices:** ₹149 Suite and Orbit, ₹59 Work, ₹39 and ₹79 Muster, ₹399 Folio, the same in code, FAQ, manual and BRIEF. The BRIEF leaves out Folio's firms.
- **Support access:** read-only access is 1–72 hours (24 h by default) and import access is 7 days. This matches `lib/console/support-access.ts:14-17` and `faq/getting-started.ts:65`.
- **Offline payment:** 7 days of provisional access.
- **Correction window:** 15 days by default. The manual states it as a fixed rule, but it is a setting.
