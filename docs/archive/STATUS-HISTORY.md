# Flowbit status

As of 3 Oct 2026. This page covers what is built, how it was checked, how the screens compare with the Figma, what is still missing, and the decisions that need the owner. How to run the app is in `README.md`. The spec it was built against is `docs/SPEC.md`.

## Summary

- Every route in the catalog (`src/lib/catalog.ts`, SPEC section 6) has a working page backed by MongoDB. There are 121 pages and 34 API route handlers, and no placeholder or "coming soon" screens.
- Final checks on 3 Oct 2026, after the Figma redesign and a clean reseed: `tsc` reports 0 errors, all 768 Vitest tests in 80 files pass, ESLint reports 0 errors (21 warnings, listed under gaps), `npm run build` passes, and the role crawl of the production build is clean for all 10 roles plus anonymous (8,724 requests, 0 flags, no server errors).
- The app now follows the Figma redesign (`docs/DESIGN.md`). Screens as built are in `docs/design/after/`; see "Design" below.
- The demo database holds only the seeded **Vistaar WebX** workspace. The click-test leftovers ("QA Project …", "Flow QA …", the "Labs" workspaces, probe records) were removed by `npm run db:seed -- --reset`. A scan of every string in the `flowbit` database found no test names. The only matches are seeded job titles ("QA Engineer") and seeded tasks or meetings about QA.

## Final verification of the 10–11 Oct night (11 Oct)

The full report is in `docs/NIGHT-11OCT-VERIFY.md`. It checked the 158 commits from `0271e5b` to `73c617f`: fix rounds A and B, the punch dial and the first-year discount.

- **Static checks:** `tsc` has 0 errors. ESLint has 0 errors and 27 warnings.
- **Tests:** 40 runs in all, with no failures and no flaky tests.
  - The full suite ran 5 times in a row: 2,819 tests in 334 files, every time.
  - The targeted tests for tonight's modules ran 35 times: 369 tests in 23 files, every time.
- **Build:** `.next-night7` passes.
- **Role crawl:** the final run made 10,539 requests with 0 flags and 0 server errors.
- **App fixes:** none were needed. Earlier crawl flags came from the crawler and its fixtures. The crawler now expects the clients export to need `clients.write` (`e7bed9f`).
- **Render checks (curl):** the punch dial on `/app`, the 50% first-year line on `/pricing`, and `/faq`, `/help` and `/manual` all pass. The letter PDF contains ₹.
- **Still needs a person in a browser:** the dial's morph and break animations, and visual polish.
- **Developer zip:** `~/Downloads/flowbit-v2-developer-handover-20261011-0145.zip`.

**Demo:** port 4500 now serves `.next-night7` (`.local-test/serve-night7.sh`) on `flowbit_v2night`. `.next-night6` was removed.

## Animated check-in dial (11 Oct)

The owner asked for the check-in clock to animate and to turn into the break when he takes one. `PunchDial` (`src/components/shell/punch-dial.tsx`, logic in `punch-dial-model.ts`, break drawings in `punch-dial-art.tsx`) is now the one dial for the side-panel check-in card (92px) and the phone top bar's quick check-in (30px). No other screen draws a check-in clock (the Home attendance card uses a timeline bar).

- **Idle** (not checked in): the grey clock with a ticking second hand. **Working:** the green clock with a sweeping second hand and a white ring that fills toward the workday (office start to end from Settings, `ShellData.workdayMinutes`, 9 h fallback).
- **On a break:** the clock shrinks and turns away while the break's glass disc springs in (520 ms, spring curve, transform and opacity only). Lunch: a plate and fork bobbing under steam. Power nap: a moon with floating z's. Tea/coffee: a cup with three curls of steam. Personal/rest: a leaf in a breathing circle. Untyped: pause bars. The card shows the break name and the running break's timer; the ring is the type's minutes today against its daily limit, amber from 80% and red past it. Resume morphs back.
- **Checked out:** the hands stop at the check-out time, dim, and a check mark sits inside a full green ring.
- **Reduced motion** (OS setting or Settings → Appearance): an instant swap, no second hand, no loops. Screen readers hear a polite status, e.g. "On break: Lunch Break, 12 minutes" (English and Hindi).
- Punch rules and server actions are unchanged. Tests: `punch-dial-model.test.ts` (state mapping, ring maths, timer text, status, reduced motion).

## Help centre, FAQ and manual update (10 Oct)

The owner asked for every FAQ on the website and a "How to use" guide for every product. Three commits on top of `d8ad2bd`: `d326acf` (manual), `b2c44f4` (FAQ), `1bed0d8` (help centre).

- **`/faq`:** 105 questions in 8 categories (Getting started 10, Plans & billing 14, Work 15, HR & payroll 18, Sales CRM 8, Billing & finance 13, Settings & security 17, Integrations & AI 10). They cover the old pricing and product FAQs, the 32 tutorial FAQ topics (`flowbit-launch/tutorials/script.v2.mjs`) and new answers for the v2 features. Search, category chips, an anchor per question, native `<details>` (works with JavaScript off) and FAQPage JSON-LD. 91 answers end in "Read the guide" to a manual topic. Data: `src/modules/marketing/content/faq/` (one file per category); the landing, pricing and product pages pick their questions by id, so no answer is written twice. The pricing page no longer carries its own FAQPage JSON-LD (only `/faq` does).
- **Corrected v1 answers:** e-invoice, Orbit email (sequences), Form 16 (Form 130) and the client portal were "not yet"; the product "not yet" lists now match the code. WhatsApp appears only as "coming soon".
- **`/help`:** cards for Getting started, Work, Muster, self-service, Orbit, Folio, admin, what's new and FAQ, each opening its `/manual/<chapter>`. Each product page has "How to use <product>" (5–6 tasks linked to manual topics, Full guide). Header: a Help menu (Help centre, FAQ, User manual); footer: a Help column; account menu: "Help centre".
- **Manual:** new topics for two-factor sign-in, Hindi, My tax and Salary tax (TDS, Form 138, Form 130), client portal, bank statement import, e-invoice and e-way bill, Connected apps (MCP), Slack, webhooks, email to task and the status page; posts rewritten for the ten types; text only, no new screenshots.
- **Tests:** FAQ ids, categories, the 32 tutorial topics, WhatsApp wording, manual links (parsed from `content/manual`), subsets and JSON-LD; help cards and how-to links; the new manual topics.

**Checks:** `tsc` 0 errors; Vitest 2,373 tests in 264 files pass (2 workers); ESLint 0 errors (22 warnings, unchanged); `NEXT_DIST_DIR=.next-help` build passes (`tsconfig.json` restored, `.next-help` removed).

**Demo:** port 4500 now serves `.next-night6` (`.local-test/serve-night6.sh`) on `flowbit_v2night`; `.next-night5` was removed.

## Recheck of the 9 Oct work (10 Oct)

This recheck covers the 40 commits from `48a7ad2` to `0d3a63b`. The full report is in `docs/V2-RECHECK-10OCT.md`.

**Results**
- **Static checks:** `tsc` has 0 errors, ESLint has 0 errors and 22 known warnings, and `next build` passes. The test count is now 2,332 tests in 261 files.
- **Role crawl:** 10,557 requests across 9 roles, anonymous, the Console, the portal and MCP. It also called the new actions directly: signatories, logo, webhook edit, biometric, GIF and email to task. Run 1 raised 17 flags; run 2 raised 0, with 0 server errors.

**Fixes**
- `c396aa5`: a split suggestion up to ₹1 over the deposit can now be confirmed.
- `b0da24a`: attendance imports write members' days in one bulk write, so a 15,000-day biometric import stays within the transaction limit.
- `7d5246c`: biometric dates like "01 Oct 2026" are read.
- `744ccd5`: the Company profile page refuses through `/app/denied`.
- `12cf845`: attaching GIFs is limited to 20 a minute.
- `1bfcb6d`: the GIF route's privacy comment is corrected.

**Still open:** all minor, and listed in the report.

**Demo:** port 4500 now serves `.next-night5` (`.local-test/serve-night5.sh`).

## PDF footers, biometric attendance import and demo logins (9 Oct)

**PDF footers** (`lib/pdf/footer.ts`): the "computer-generated … does not need a signature" line prints only when a document has no signature block (payslips with "Show signature on payslips" off, Flowbit's own subscription invoice). Invoices, quotes, credit notes, receipts, statements, letters and Form 130 always print a signature block, so their footer is neutral: brand line, number and the page count. Payslips pick the footer by the same rule. Tests: `lib/pdf/footer.test.ts` and the builder checks in `lib/pdf/pdf-builders.test.ts`.

**Biometric attendance import** (HR → Attendance → Import → From a biometric device, `?view=import&from=device`, `attendance.manage`):
- Reads eSSL / eTimeTrackLite attendance logs (UserId, LogDate, Direction, DeviceId; report exports' Employee Code / Log Date), ZKTeco `attlog.dat` / `.txt` (PIN, stamp, state…) and ZKTeco CSV / XLSX exports (AC-No. + Time, or Employee ID + Date + Time + Punch State), plus a generic punch CSV with columns picked by hand. Format is auto-detected from the content or headers, with a manual override. `modules/muster/attendance/biometric/` (`formats.ts`, `datetime.ts`, `read.ts`).
- Punch rules (`punches.ts`): grouped by device id and IST date; first punch = in, last = out; repeats under 2 minutes ignored; one punch = "missing out"; punches after midnight before the cutoff (04:00 default, 00:00–06:00, set per import) belong to the previous day's shift, written as 24:00–29:59 (the attendance import accepts those only from this path).
- Device ids map by the new `Employee.biometricId` first, then the employee code (an employee with a saved id is matched by it alone). Unmapped ids are listed in the preview; mapping one saves it on the profile (`saveBiometricMapping`, audited `employee.biometric_id`). The id is editable on the profile (Job), shown on the Job tab and importable as `biometric_id` / `device_user_id` in the employee import; clashes ("0007" = "7") are refused.
- Days then run through the existing attendance checks (`checkWithScope` in `import-run.ts`): status from the times, locked months, joining/exit dates, own record. Writing re-reads the file, commits in one transaction and records an undoable `ImportBatch` ("Attendance (biometric)").
- Limits: 50,000 punch rows and 3 MB per file; at most 15,000 person-days per import.
- Header names come from the eSSL web API manual, ZKTeco ADMS/attlog libraries and field exports (cited in `formats.ts`); vendors vary by version, which is why column picking exists.

**Demo logins reset** (owner-approved): `scripts/seed.ts` had overwritten `seed-logins.local.md` while seeding other databases, so it no longer matched the `flowbit` demo users. `.local-test/reset-demo-logins.mts` set a new password (the app's `hashPassword`) on exactly the 16 users the seed creates in `flowbit`, changing only `users.passwordHash`: sessions, 2FA epochs, the Console Staff row and all other data are untouched. One login was verified with `verifyPassword` in the script. The owner's Console Admin password was not reset (the file says so). Root cause fixed: the seed's people and file naming live in `scripts/lib/seed-logins.ts`, and a seed of any database other than `flowbit` writes `seed-logins.<db>.local.md` (still covered by `*.local.md`). Test: `src/lib/seed-logins-file.test.ts`.

## Company profile and PDF branding (9 Oct)

The owner asked for a company profile with authorised signatories, and for every exported PDF to carry the company's branding, details and signature. Four commits on top of `a91bba8`: `2be8964` (profile), `5955d61` (Folio fallback), `2e5ec7a` (every PDF), `6ce2537` (tests).

**Settings → Company profile** (`/app/settings/company`, owners and admins with `org.manage`):
- Legal and trade name, GST registered with a GSTIN that must match the address state (or "Not registered"), PAN (must match the GSTIN), CIN/LLPIN, website, contact email, phone and the full address. `lib/company-profile-schema.ts`.
- Logo: PNG, JPEG, SVG or WebP, turned into a PNG of at most 512 px in the browser (`components/ui/image-convert.ts`); the server checks the bytes are PNG or JPEG.
- Authorised signatories (`Org.signatories`): name, designation, signature image (optional background removal by a brightness threshold on a canvas, `lib/image-bytes.ts clearLightPixels`), optional seal, one default. Only owners and admins with `org.manage` may change them (`canManageSignatories`); every change is audited (`org.signatory_*`).
- Signature and seal files are the kinds `company_signature` and `company_seal`. `/api/files`, the portal and Console routes never serve them; they are read only server-side into PDFs (`lib/pdf/org-branding.ts pdfSignature`). A test scans `src/app` for any route or page that passes their ids on.
- "Show signature on payslips" (default off).
- Migration is at read time (`companyProfileOf`): name → legal name, a stored GSTIN → registered, signup PAN or the GSTIN's PAN → PAN. Address, GSTIN and logo stay on the Org. The printed PAN is `Org.profile.pan`, separate from the signup PAN that enforces one Free workspace per PAN.
- Settings → General no longer repeats the address and logo cards; it links to the profile.

**Folio entity fallback:** an entity that leaves its logo, email, phone, website or signatory blank prints the profile's (`inheritFromProfile`; the entity's signatory first, then the profile default with signature and seal). The entity dialog and the Signatory tab show the inherited values as placeholders with "Using company profile".

**Every PDF:**

| PDF | Letterhead from profile | Brand colours | Signature block |
|---|---|---|---|
| Payslip (English, bilingual) | yes | yes | only with "Show signature on payslips" |
| HR letters (all 20 types) | yes | yes | stored signatory, signature and seal |
| Form 130 Part B | yes | yes | tax-year signer; their image when they are a signatory, the default when blank |
| Receipt, statement | entity, blanks from profile | yes | entity signatory, else profile default |
| Invoice, e-invoice QR invoice, quote, credit note | entity, blanks from profile | yes | entity signatory, else profile default |
| Flowbit subscription invoice | Flowbit | Flowbit | unchanged |
| 24Q | CSV, not affected | | |

There is no meeting MOM PDF export, so nothing to change there.

**Colours:** `lib/brand-theme.ts workspaceTheme(org)` is the only place that decides which theme a workspace shows. The shell (`themeCss(workspaceTheme(ctx.org))`), every PDF (`pdfBrandForOrg`) and the public document page read it; PDFs only darken for paper (`readableOnPaper`). `lib/pdf/theme-parity.test.ts` checks parity for every plan.

**HR letters:** HR settings → Letter signatories names a signatory per letter type (`MusterPolicy.letterSignatories`). New drafts use it, else the profile default, else the drafter as before. The draft editor's "Signed by" picks another signatory or "Someone else" (typed, no image). At issue the signatory's current signature and seal file ids are stored on the letter (`Letter.signatoryId/signatureFileId/sealFileId`), so reprints match. A replaced or removed signature file is kept for those reprints.

**Checks:** `tsc` 0 errors; Vitest 2,284 tests in 253 files pass (2,230 in 247 before); ESLint 0 errors; the production build passes. A smoke test on `flowbit_v2dev` (dropped afterwards) stored a signature and seal, rendered a signed letter and a signed bilingual payslip from real storage. The `flowbit` demo database and the servers on 4100, 4300, 4400 and 4500 were not touched.

**Assumptions:** the simplest reading was taken where the request was open.
- The signatory is picked in the draft editor, and the Issue confirmation names who signs; changing it means saving the draft first.
- PAN prints on every letterhead when set.
- An entity signatory with no image stays unsigned rather than borrowing the default's image.
- The Form 130 signer is matched to a signatory by name, case-insensitively.
- Custom roles never manage signatories, even with `org.manage`.

**Left:**
- The manual's General screenshot (`shots/set-home.jpg`) still shows the old Address and Logo cards; it needs retaking, and the new page has no screenshot yet.
- Email headers (`lib/email-brand.ts`) and the `/a` and `/p` public pages still take the stored theme colour without the plan check.
- Folio entity signatures (kind `folio_signature`) stay openable by Folio readers through `/api/files`, as before.

## Final polish (9 Oct)

The owner asked for every remaining code item to be finished ("sare feature final banao"). 25 commits on top of `01842aa`, one per item, each with a regression test. Nothing touched the `flowbit` demo database or the servers on 4100, 4300, 4400 and 4500.

**Security (`docs/V2-NIGHT-CHECK.md`, all now "Fixed 9 Oct"):**
- **M6** `be8c3f2`: email to task accepts only the owner of the `tasks+` address. An admin can allow teammates (Settings → Security). SPF, DKIM and DMARC must pass when the provider reports them.
- **M7** `c9f04fc`: each sequence enrolment has a signed reply address, `reply+<enrolment>-<hmac>@…`. A reply stops only that enrolment.
- **L5** `be252e7`: a refresh-token family table. Reuse of any old token, or a code replay racing the exchange, revokes the grant.
- **L7** `51ca716`: per-IP limit on bad tokens at `/mcp`, `/oauth/token` and `/oauth/revoke`.
- **L8** `a655d1f`: a daily cap of 30 2FA attempts, and an email alert after repeated wrong codes.
- **L9** `4bf4f23`: unknown portal hosts cost no lookup, the cache is bounded, and pending domains claim nothing.
- **L10** `43d20ea`: bank match and undo are atomic, and stuck `matching` rows are released after 5 minutes.
- **L11** `42f4c5b`: inbound task webhook replay protection (timestamp window, plus id, nonce or body-hash dedupe).
- **L12** `3dbda85`: mapped, translated, NAT64 and Teredo IPv6 ranges are blocked, and the GSP client has a 30-second absolute deadline.
- **L13** `8b95bb3`: Slack, inbound email and Recall bodies are size-limited while streaming, and cancelling an IRN needs `einvoice.cancel`.

**Browser check fixes (`docs/BROWSER-CHECK-9OCT.md`):**
- chart x-axis labels `29a170f`;
- the Console top bar `f01797f`;
- 2FA set-up on click `8eacf83`;
- the product tour remembered at once `f0e5a1a`;
- the Email-to-task card shows the address `eba142b`.

**Features:**
- **Bank:** one deposit split across several invoices of one client, with a manual allocation dialog (amount and TDS per invoice). When a deposit equals two to four open balances, the split is suggested (`9c8d6da`).
- **Posts:**
  - GIF search through Klipy, behind `KLIPY_API_KEY`, using a server proxy; a picked GIF is copied into the workspace (`733e724`).
  - Feed and composer polish (`fb828d7`):
    - a media grid;
    - Read more / Show less in place;
    - type shortcuts and an options panel;
    - an empty state with an action;
    - the mobile type picker.
- **Email to task:** raw MIME from generic providers, parsed with `postal-mime` (now a direct dependency) (`cdb1ac8`).
- **Webhooks:** edit the URL, name, events and the active flag (`8944331`).
- **Client page Tasks tab:** quick add sets the client (`412bae1`).
- **Clients CSV export:** follows every list filter, including health, and adds a Health column (`e97bfea`).
- **My attendance:** where each check-in happened (office, distance or "recorded", with a map link), plus a privacy note (`35bfd4e`).
- **`/status`:** public page with app, database, storage, email and each cron job's last run. External uptime monitoring is a TODO for the owner (`9f51227`).
- **Manual:** 7 screenshots that showed WhatsApp controls were removed, and each was replaced by a "being retaken" note. No screenshots were generated (`ec7250f`).

**Checks:**
- `tsc`: 0 errors.
- Vitest (`--pool=forks --maxWorkers=2`): 2,230 tests in 247 files pass (2,158 in 233 before).
- ESLint: 0 errors, 22 warnings (unchanged).
- `next build` (`.next-fin`, 3 GB heap): passes; `tsconfig.json` was restored and `.next-fin` removed afterwards.

Klipy, the mail providers and DNS are mocked in every test. There was no browser click-through (browser tools were off) and no password sign-in, and nothing was seeded.

**Left:**
- Retake the 7 removed manual screenshots.
- Add an external uptime monitor polling `/api/health`.
- Run `setup:prod` after deploying: new `oauthrefreshtokens` and `inboundreplays`, and the custom-domain index is replaced.
- GIF thumbnails in the picker load from Klipy's CDN. The GIF that gets posted is a workspace copy.

## Night build final check (9 Oct 2026)

Step 9 checked the 55 overnight commits (`98ada19..5a4cdec`) on a fresh `flowbit_v2night` seed. The full report is in `docs/V2-NIGHT-CHECK.md`; the owner's consolidated to-do list is in `docs/OWNER-MORNING-9OCT.md`.

- **Static:** `tsc` 0 errors. Vitest 2,158 tests in 233 files pass (2,139 before). ESLint 0 errors (22 warnings, unchanged). The `.next-night` build passes, and the Google font fetch was not blocked.
- **Crawl:** the production build on 127.0.0.1:4500, crawled with sessions minted directly (no password sign-in). Coverage:
  - 9 roles, anonymous, 4 Console sessions, a client-portal contact and 10 MCP grants;
  - new checks for the settings pages, `/manual`, `/security` and `/compare-v1-v2`;
  - portal isolation, MCP 401, discovery and scope-or-role refusals;
  - unsigned Slack, inbound email, Recall and Sarvam webhooks;
  - WhatsApp 404 with the flag off, and every cron route (401).

  Flags went 89 → 15 → 1 over three runs of 10,100 requests each, with 0 server errors after the fixes. The last flag was a crawler mistake; the v2 and night phase was re-run on its own with 0 flags.
- **Fixed (11 commits, each with a regression test):**
  - **HIGH:**
    - an XLSX zip bomb (`2a85135`);
    - GSP credentials leaking to a changed base URL (`9af0ee8`);
    - one workspace resetting a person's 2FA everywhere (`5dcdbc0`).
  - **MEDIUM:**
    - MCP resources and undo skipping the scope check (`ce5d1a5`);
    - reset and sign-out leaving AI connections alive (`163e57a`, `eaba163`);
    - "require 2FA" not covering MCP, connectors, export or files (`c635c0e`);
    - the webhook slow-drip stall (`d2917ba`).
  - **LOW:** portal contact enumeration (`48fe6d0`) and bank undo deleting expenses (`f53bd81`).
  - **Bugs found by the crawl:** a 500 on a malformed Basic header at `/oauth/token` (`ce5d1a5`); dead 24Q and Form 130 links on Salary tax (`e062090`).
- **Open at the time:** M6, M7 and the LOW items; all fixed in the final polish above.
- **Left running:** port 4500 with `.next-night` on `flowbit_v2night`. Demo sessions come from `node .local-test/demo-sessions.mjs`. The servers on 4300 and 4400 were left alone.

## v2.2 step 8 (Tier 3b) (built 9 Oct 2026)

Tier 3 items of `docs/REVIEW-8OCT-PLAN.md` plus the "deprioritise" list the owner overruled, one commit each on top of `4392b5d`; the plan rows are marked built.

1. **Salary TDS and Form 130 (Muster)** (`3dd1f67`). My tax (`/app/me/tax`): regime (new default / old), 80C, 80D (self, parents, senior flags), rent with metro and landlord PAN (required above ₹1 lakh a year), home loan interest, NPS 80CCD(1B) and previous-employer salary, TDS and PT; a proof upload inside the HR-set window (`tax_proof` files, own-or-payroll access). HR's Salary tax (`/app/hr/payroll/tax`): regimes, proof status, YTD TDS, the year's settings (declarations open, proof window, TAN, signatory), proof review (verify with adjusted amounts or send back). With statutory TDS mode `auto` (a new switch in the statutory rates), generation builds a worksheet per person (`modules/muster/tax`): YTD from paid entries of the tax year, this month as computed, the structure for the months left (cut at an exit date), standard deduction, HRA exemption, PT, 80C with employee PF, 80D, NPS, home loan, then slabs, rebate with marginal relief, surcharge with marginal relief and 4% cess; the unpaid balance is spread over the months left as the `TDS` line. Finance can override one person's month with a reason (`TdsOverride`, audited). The worksheet is kept in the entry snapshot and shown on the entry and a worksheet page (a live preview before any payroll). Exports: quarterly Form 138 (ex-24Q) deductee CSV (section 392) plus Q4 salary details, and a Form 130 (ex-Form 16) Part B PDF with Part A left to TRACES. FY 2026-27 slabs (Budget 2026 unchanged; Income-tax Act 2025 / Rules 2026, sources cited in `rules.ts`) are editable JSON in Console → Settings → Salary TDS rules. Every screen carries "Verify with your CA".
2. **E-invoice and e-way bill (Folio)** (`c134ab5`). `GspProvider` with a generic NIC-style GSP adapter (auth token, IRN, cancel, e-way bill by IRN) over an SSRF-guarded HTTPS client; per GST entity settings (on/off, turnover above ₹5 crore, sandbox/production, base URL, client ID/secret and username/password sealed with `secret-box`). An issued B2B tax invoice with a client GSTIN maps to the NIC schema v1.1 payload (field names checked on einv-apisandbox.nic.in) with validation (document number, GSTINs, PINs, state codes, HSN/SAC, GST rates, line and total arithmetic); the IRN, Ack no, Ack date, signed QR and signed invoice are stored in `EInvoice` (the invoice stays frozen) and the PDF prints the QR, IRN and acknowledgement. Cancel within 24 hours (NIC reasons; refused while an e-way bill exists). E-way bill by IRN from transport details (mode, distance, vehicle or transporter, document) with its number and validity. Exports and reverse charge are refused with a clear message.
3. **Custom domains add-on** (`98e804d`). Add-on `domains` (Console → Add-ons; trials and house workspaces get it). Settings → Domains: a sending domain created through the Resend Domains API (adapter, mocked in tests) with its SPF, DKIM and return-path records and Verify; once verified, invoice, quote, statement, reminder and portal mail goes from `billing@<domain>` (a stored per-message From header the email adapter validates), else Flowbit's sender. A portal host (a subdomain only) CNAMEd to `PORTAL_CNAME_TARGET`, verified by a time-limited `node:dns` CNAME lookup of a validated name; `src/proxy.ts` rewrites a verified host to that workspace's `/portal/<slug>` (a one-minute cache; unknown hosts pass through unchanged). Optional Vercel domains API behind `VERCEL_DOMAINS_API`.
4. **Orbit reply detection** (`b2b92fd`). The no-CASA path: Flowbit-sent sequence mail copies the workspace reply inbox `replies+<slug>-<token>@INBOUND_EMAIL_DOMAIN` (HMAC token) on Reply-To; the step 6 inbound webhook routes it, and a reply from a lead with a live sequence stops it (`replied`) and logs a reply activity (out-of-office ignored). Behind `GMAIL_REPLY_DETECTION` (off by default, restricted-scope/CASA warning on the card): a `gmail_read` Google connection (`gmail.readonly`), Gmail thread ids kept on sent steps, and the sequences cron reading those threads (headers only) to stop a sequence on a human reply from anyone but the sender.
5. **Polish:** glass break icons with an on-break halo and a ring timer in the picker, the check-in widget and the attendance rules (`a3398ba`); skills and time zone on the profile, local time and skills on team member cards and a "who knows" filter (`be6bcd1`; the animated gradient border already existed); eight theme presets that pass the contrast checks plus a workspace avatar style, initials or a generated pattern (`fc6701b`); `/compare-v1-v2` with counted figures (`8ccf94b`, wording `33421f2`); `/security` (`53f97d1`).

**Checks:** `tsc` 0 errors; Vitest 2,139 tests in 228 files pass (2,067 in 220 before); ESLint on `src` and `scripts` 0 errors (22 warnings, existing kinds); `NEXT_DIST_DIR=.next-s8` build with `--max-old-space-size=3072` passes (`/app/me/tax`, `/app/hr/payroll/tax`, `/app/hr/payroll/tax/[employeeId]`, `/api/muster/tax/24q`, `/api/muster/tax/form130/[employeeId]`, `/app/settings/domains`, `/compare-v1-v2`, `/security` listed); the build needed network access for the Google font; `tsconfig.json` restored and `.next-s8` removed. New tests: both regimes at several salary levels, the ₹12 lakh rebate edge and marginal relief, surcharge relief, old-regime HRA/80C/PT, the landlord PAN rule, a mid-year joiner with and without previous-employer TDS, declarations changing mid-year, over-deduction, editable rules, windows, Form 138 rows; the engine TDS line, override and manual-mode warning; NIC payload mapping and validation, SEZ, units, the cancel window, e-way bill payload and transport checks, the GSP adapter against a mocked HTTP (one auth, errors with codes, cancel, e-way bill); domain names, portal routing, CNAME check and Resend domains (mocked); the From header and Reply-To list in the email adapter; the reply inbox, Gmail thread reading (mocked fetch) and the reply job; skills, avatar patterns, presets' contrast; content guards on the new pages. A scratch run on `flowbit_v2dev` checked the declaration upsert, the unique IRN and portal-host indexes and the proxy's host lookup; the database was dropped. No real GSP, Resend, Google or Vercel call; no browser, no password sign-in; the `flowbit` demo database and the servers on 4100/4300/4400 were not touched.

**Assumptions:** TDS is computed only in statutory mode `auto` (manual stays the default) and only paid (`ready`) entries of released or earlier months count as YTD; declared amounts drive TDS until HR verifies proofs, then the verified ones; the regime defaults to new without a declaration; the HRA exemption waits for the landlord PAN above ₹1 lakh of rent; perquisites, other income, arrears relief (s.89) and employer NPS are not modelled; tax arithmetic is rounded to the rupee (not s.288 ten-rupee rounding); the Console TDS rules apply to every workspace and name one tax year; Form 130 Part B is provisional until March is released. E-invoice settings are per GST entity with one GSP login; exports, reverse charge and credit-note IRNs are not covered; cancelling an IRN does not void the invoice. The sending domain is one per workspace from `billing@`; portal hosts must be subdomains; the reply inbox matches the reply's From address against leads with a live sequence (no stage move, the owner decides); Gmail detection reads only threads the sequences started.

**Owner actions:** see "Step 8 (v2.2, Tier 3b) owner setup" in `docs/DEPLOY-VERCEL.md`: `npm run setup:prod`; turn on auto TDS per workspace and have a CA check the worksheet; GSP sandbox credentials per entity; `PORTAL_CNAME_TARGET` and its Vercel domain, optional `VERCEL_*`; switch the `domains` add-on per workspace; optional `GMAIL_REPLY_DETECTION` with Google's CASA assessment; Atlas M10 backups before stating a schedule on `/security`.

**Not in this step:** a browser click-through and 375 px check (no browser in this run); real GSP, Resend Domains, Gmail and Vercel calls; filing the 24Q return itself (the CSV is for the CA's utility); a status page; the posts redesign.

## v2.2 step 7 (Tier 3a) (built 9 Oct 2026)

Tier 3 items of `docs/REVIEW-8OCT-PLAN.md`, one commit each on top of `c5a0160`; the plan rows are marked built.

1. **Two-factor sign-in** (`9b0468d`). TOTP for every user (the Console's `lib/console/totp`), enrolled in Settings → Security with a QR code and 10 recovery codes (shown once), secret sealed with `secret-box`. Asked after the password, after Google and after a reset link through a 10-minute signed cookie (`fb_2fa`, no session until the code), with "remember this device for 30 days" (signed cookie bound to a device epoch that a reset or turning it off bumps). Codes are used once (conditional update on the last step; recovery hashes pulled atomically), 8 tries per 15 minutes. "Require 2FA for admins" (default off; you need your own 2FA first): owners and admins without it are sent to Security, and every action and route handler refuses them. Admins reset a member's 2FA from Members (audited and emailed; only the owner resets the owner). TODO: a public security page.
2. **Hindi for self-service** (`32b6fae`). Settings → Profile → Language (English / हिन्दी). `lib/i18n` with a typed dictionary per locale and `t()` (values and `{n:one|many}`); Hindi is typed `Record<MessageKey, string>` and marked `HI_STATUS = 'review'`. Covers My profile, My attendance and the check-in widget and phone quick check-in (with the break types), My leave (apply and balances), My payslips, and the Home attendance and Get started cards. Payslip PDFs print "English / हिन्दी" labels when the viewer reads in Hindi (or `?lang=hi`), in an embedded Noto Sans Devanagari (SIL OFL 1.1; static Regular/Bold subsets in `assets/fonts/noto-sans-devanagari` with the licence; shaping checked on a rendered PDF).
3. **Bank statement import** (`820245f`). Folio → Bank: CSV/XLSX with HDFC, ICICI, SBI, Axis and Kotak presets (the header row is found under the bank's preamble) or column mapping ("Other bank"); money in paise, credits and debits, a unique row hash per workspace (re-imports skip what is in), preview before import. Each deposit is scored against open invoices of the same entity: the balance, the balance less 2% or 10% TDS on the taxable value, the invoice number, a UTR the client shared on the invoice link, the client's name and the due date, with a confidence. Confirm records a receipt with the allocation (and TDS) through the Folio receipt service, fires `payment.received` and audits; a row is claimed so two clicks cannot make two receipts. Withdrawals can be booked as expenses with a suggested category, payee and mode, or ignored. Undo per statement within 7 days cancels its receipts, deletes its expenses and rows.
4. **Client portal** (`576d267`). `/portal/<slug>`, feature `portal` (Suite, the new `portal` add-on, or a trial; Console → account → Add-ons). Contacts invited per client sign in with a six-digit email code (HMAC, 5 guesses, rate-limited per email and IP, same answer for any email) into their own session (`fb_portal`, host-only, path `/portal`, own collection; never opens `/app`). They see only their client: shared projects (status, health, progress, milestones), client-visible tasks, approvals (Approve / Request changes with a comment), invoices and quotes through the doc links with Pay now, the statement, and shared project and task files (download route checks the same rules). The agency: portal on/off and invites on the client's Contacts tab, "Client portal" switch in project Settings, "Client can see this" and "Ask the client to approve" on the task. Client answers are written once, logged on the task as "<name> (client)" and notified (`portal.*` group). Workspace brand: logo, name and colour.
5. **Meetings AI** (`bcc6f06`). Feature `meetings_ai` (add-on or trial). On a meeting: upload a recording (direct presigned PUT to S3/R2, SigV4 in `lib/storage/presign` verified against AWS's example; the form upload on local storage) or "Send notetaker" (Recall.ai bot "Flowbit Notetaker" on the Meet/Zoom/Teams link, announces itself in the chat, a consent notice emailed to attendees). `TranscriptionProvider` with Sarvam (default: batch, `saaras:v4`, `codemix`, diarization, callback with a per-job token) and a Deepgram stub; transcripts stored with speakers and timestamps (`MeetingTranscript`), speakers can be named. Claude drafts the minutes (Arc client and caps, task `minutes`): agenda (when empty), notes and decisions appended to the notes, action items with owners matched to members and due dates as drafts for the existing Create task; without AI the notes quote the transcript. Recall webhooks (Svix) and a 15-minute cron (`/api/cron/meetings`) pick up the recording or transcript and continue the same pipeline. Delete recording / transcript buttons; retention per workspace in Settings → Privacy (default 90 days), purged by the cron, dry run unless `MEETINGS_PURGE`. Hours cap in Console → Settings → Meetings AI (Free 0, Trial 1 h, paid 5 h per seat), usage shown on the meeting.

**Checks:** `tsc` 0 errors; Vitest 2,067 tests in 220 files pass (1,989 in 214 before); ESLint on `src` and `scripts` 0 errors (warnings unchanged); `NEXT_DIST_DIR=.next-s7` build with `--max-old-space-size=3072` passes (`/login/2fa`, `/app/folio/bank`, `/portal/[slug]`, `/api/webhooks/sarvam`, `/api/webhooks/recall`, `/api/cron/meetings` listed); `tsconfig.json` restored and `.next-s7` removed. New tests: 2FA (pending and device cookies, enrolment rules, TOTP once, recovery codes, remember-device and admin reset), i18n key and placeholder parity plus a rendered bilingual payslip, bank presets for all five banks and generic mapping, dedupe, match scoring and TDS, confirm-to-receipt, double confirm and undo, portal sign-in (no enumeration, cookie scope, code replay, cross-workspace codes), isolation (projects, tasks, files, approvals of other clients) and approvals, Sarvam and Recall adapters with mocked fetch, the webhook signature, minutes parsing, owner matching and merge, the transcript → minutes pipeline (once only, cap refusal, AI fallback), retention dry run and live purge, hours cap. A scratch run on `flowbit_v2dev` checked the unique bank row hash, the portal sign-in and viewer, the meeting usage aggregate and minutes on real Mongo; the database was dropped. Sarvam, Recall and Anthropic were never called; no browser, no password sign-in; the `flowbit` demo database and the servers on 4100/4300/4400 were not touched.

**Assumptions:** 2FA is per user (one secret across workspaces); "admins" means the owner and admin roles; requiring it redirects pages and refuses actions/route handlers but layouts still render; a reset link still asks for the code; Google sign-in counts as the first factor. Hindi covers only the listed surfaces and leaves server messages, dates and leave-type names in English; a payslip is bilingual for a Hindi reader or `?lang=hi`, emailed payslips stay English. Bank: `.xls` is not read (save as `.xlsx`/`.csv`); identical rows in one file without a balance are told apart by their order; TDS is worked out on the invoice's taxable value; one deposit pays one invoice (the rest is advance); undo deletes the expenses it made. Portal: one email belongs to one client per workspace; the portal is read-only apart from approvals; files are those of shared projects and visible tasks; asking for an approval makes the task visible. Meetings: Sarvam language `hi-IN` with code-mix; recordings up to 2 hours and 200 MB; the hours cap counts transcribed seconds and checks the browser's duration before upload; the notetaker requests mixed audio and Sarvam transcribes it (a Recall transcript is used when present); minutes go into the meeting's existing notes; retention runs from the meeting's end.

**Owner actions:** see "Step 7 (v2.2, Tier 3a) owner setup" in `docs/DEPLOY-VERCEL.md`: `npm run setup:prod`; switch add-ons per workspace in the Console; bucket CORS for direct uploads; `SARVAM_API_KEY`, `RECALL_API_KEY`, `RECALL_REGION`, `RECALL_WEBHOOK_SECRET` and the Recall webhook; `MEETINGS_PURGE=1` when you want real deletion; a Hindi review of `src/lib/i18n/hi.ts`.

**Not in this step:** a public security page and a status page; a browser click-through and 375 px check (no browser in this run); real Sarvam, Recall and Claude calls; Deepgram beyond the stub; matching one deposit to several invoices; portal comments other than approvals; Hindi for the rest of the app.

## v2.1 step 6 (MCP + connectors) (built 9 Oct 2026)

The MCP server and connectors from `docs/specs/mcp.md` (Part A and Part B), one commit per sub-part on top of `de5b5a5`. The spec now carries "Built:" notes.

1. **OAuth 2.1 for AI apps** (`c3e0656`). Discovery (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource[/mcp]`), dynamic client registration (`/oauth/register`, 20 a day per IP), consent at `/oauth/authorize` on the Flowbit session (pick a workspace, untick scopes; scopes = requested ∩ role), code + PKCE S256 only, exact redirect URI match (never redirects on a bad one), 1-hour access and 30-day rotating refresh tokens stored as SHA-256 (reuse of an old refresh token or a replayed code revokes the connection), `/oauth/revoke`. Plan gate: paid, trial and house accounts; never Free; blocked refused; admin switch.
2. **MCP server** (`8266cf9`). `/mcp`, official SDK 1.32.1, stateless Streamable HTTP with JSON responses; 401 + `WWW-Authenticate` with the resource metadata. 26 tools (spec A3) with zod schemas, structured output with links and read-only/destructive hints; scope ∩ role on every call; the never-allowed list (attendance, payroll/salary, issuing/voiding invoices, payments, deletes, roles, settings, billing) refused by name; salary, PAN and bank fields never returned (`never.ts` redact plus explicit projections). Fuzzy find with confidence; `plan_changes` → ok / needs-confirmation / refused with a 30-minute `plan_id`, Hinglish dates in IST (step 2 parser), duplicate and same-source checks; `apply_plan` as one ImportBatch-style batch (kind `mcp`, ≤ 50 changes), "<name> via <app>" audit, idempotency on source + change, `Task.origin` ("created this task from Slack #design via Claude" on the timeline), undo for 7 days (drafts only while drafts). Resources `flowbit://workspace/context`, `flowbit://me/today`, `flowbit://guide/updating`; prompts `update-from-notes`, `daily-standup`, `client-update`, `followups-today`, `collections-review`. Limits: 120 requests a minute per connection, 500 AI writes a day per workspace. Deal moves now share `orbit/deal-moves.ts` with the deal actions.
3. **Settings → Connected apps** (`132cc88`). Connection URL with Claude and ChatGPT steps, connections (who, scopes, last used) with Revoke, history of AI batches with Undo, admin on/off switch.
4. **Outbound webhooks** (`c95830d`). Settings → Integrations → Webhooks: URL + secret (sealed), events `task.created`, `task.completed`, `lead.created`, `deal.won`, `invoice.issued`, `invoice.paid`, send test, pause, remove, 30-day delivery log. HMAC-SHA256 `X-Flowbit-Signature: t=…,v1=…`, first try after the event, retries from `/api/cron/messages` (1 m → 6 h). SSRF guard at save and on the socket's DNS lookup (private, loopback, link-local, CGNAT, reserved, IPv6 mapped/NAT64), http(s) only, no redirects. Events are fired from task create/complete, manual and MCP lead creation and the automation bus (lead, deal won, invoice issued, invoice paid when the balance reaches 0). The generic lead webhook also creates a Work task for `"type": "task"`.
5. **Slack** (`d5d81c5`). OAuth install per workspace (bot token sealed), signing-secret check on every request, message shortcut → modal, `/flowbit task <text>` (Hinglish quick add), `/flowbit my day`, optional channel updates. Slack users act as themselves (matched by email). Manifest: `docs/SLACK-APP-MANIFEST.yml`.
6. **Email to task** (`0adb5fd`). `tasks+<slug>-<token>@INBOUND_EMAIL_DOMAIN` (HMAC token, in Profile); Resend inbound (Svix) or signed generic JSON behind one adapter; members only; subject → title, body → description, attachments within the upload limit, one task per message.
7. **Integrations page** (`bbea412`): "Apps and connectors" cards (Connected apps, Slack, Webhooks, Email to task) above the server services.

**Checks:** `tsc` 0 errors; Vitest 1,989 tests in 214 files pass (1,833 in 205 before); ESLint on `src` and `scripts` 0 errors (21 warnings, unchanged); `NEXT_DIST_DIR=.next-s6` build with `--max-old-space-size=3072` passes (`/mcp`, `/oauth/*`, `/.well-known/*`, `/api/slack/*`, `/api/inbound/email` listed); `tsconfig.json` restored and `.next-s6` removed. New tests cover OAuth (registration, PKCE, exchange, refresh rotation and reuse, revocation, wrong redirect), scope ∩ role for every scoped tool, the never-allowed list and redaction, the find matcher, plan groups, apply/idempotency/undo, Hinglish dates, limits, Slack signature and command parsing, inbound email auth and parsing, webhook HMAC, retries and the SSRF guard, plus an in-process MCP protocol smoke test with the SDK client (list tools, whoami, plan, apply). A scratch run on `flowbit_v2dev` checked the Mongo OAuth store (code replay, refresh reuse, hashes only), the all-or-nothing write budget, unique idempotency keys and `Task.origin`, and an HTTP end-to-end against `next start` of the build on port 4610 (initialize, 26 tools, whoami, plan → apply → same source skipped → find → audit "via Claude" → undo, scope refusal); the database was dropped. No password sign-in, no browser, no real Slack, Resend or AI platform call; the `flowbit` demo database and the servers on 4100/4300/4400 were not touched.

**Assumptions:** MCP is stateless (no server-initiated stream; GET/DELETE answer 405); clients register by DCR (client ID metadata documents not supported yet); access tokens last 1 hour, refresh tokens 30 days, codes 5 minutes; an admin's switch-off refuses at runtime but keeps connections (they work again when switched on); a role or plan change applies on the next call; scopes are requested ∩ role at consent and re-checked against the role on every call; `people.read` needs any of `tasks.read`, `people.read` or `leave.read` and returns members (name, title, department, manager, teams, email) and approved leave without reasons or types; a single write tool that is unsure answers `needs_confirmation` and saves nothing until `confirm: true`; each single write is its own undoable batch; idempotency key = source kind + ref (or URL) + change + subject, so different changes from one message are distinct; undo restores whole changed documents (later edits to the same record within the window are lost) and skips invoices or quotes no longer drafts; AI-drafted quotes take a quote number (undo leaves a gap in the quote series, not the invoice series); lead upsert fills only empty email/phone, appends notes and never renames; leads created by MCP get source/sector "other" unless given; the daily cap is 500 changes per workspace per IST day; Slack posts updates to public channels only (`chat:write.public`), one Slack team maps to one Flowbit workspace, and a Slack modal's task is created after Slack's 3-second answer (errors other than an empty title are logged, not shown); email-to-task tokens derive from `APP_SECRET` (rotating it changes every address), the address owner is the assignee and the sender (any member) the creator, attachments outside the task attachment types are skipped, MIME uploads are not parsed (use Resend or JSON); webhook retries ride the 5-minute messages cron, a removed or paused webhook fails its queued deliveries, 4xx other than 408/429 is not retried; inbound webhook tasks are created by the workspace owner shown as "Webhook".

**Owner actions:** deploy, then `npm run setup:prod` (new collections and unique/TTL indexes); connect Claude (Settings → Connectors → Add custom connector → `https://<APP_URL>/mcp`) and ChatGPT (Developer mode → Create → same URL, OAuth) from a paid or trial workspace and run `update-from-notes` once each; submit to Claude's and ChatGPT's directories if wanted; Slack: create the app from `docs/SLACK-APP-MANIFEST.yml`, set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` (and public distribution for other teams); email to task: pick the inbound subdomain, add Resend's MX record, the Resend inbound webhook to `/api/inbound/email`, set `INBOUND_EMAIL_DOMAIN` and `INBOUND_EMAIL_SECRET` (`RESEND_API_KEY` already needed); keep `APP_ENCRYPTION_KEY` set (webhook secrets and Slack tokens).

**Not in this step:** listing in the Claude and ChatGPT directories; client ID metadata documents (newer MCP auth option); a browser click-through of the consent screen and the new settings pages (no browser in this run); Gmail, Google Calendar import of messages, Tally and other "later" connectors from the spec table beyond what was asked; inbound MIME parsing; a UI to edit an existing webhook's events (remove and add again).

## v2.1 step 5 (built 9 Oct 2026)

Tier 2 items 5, 6, 12 and 13 of `docs/REVIEW-8OCT-PLAN.md`, one commit each on top of `6afe752`, plus one fix.

1. **Arc with Claude** (`59a85fd`).
   - `@anthropic-ai/sdk` 0.132.1 replaces the hand-written `fetch`. All calls go through `modules/work/arc/ai-client.ts`: `claude-sonnet-5-5` drafts outlines and breakdowns (effort low, server-side refusal fallback `fallbacks: 'default'`), `claude-haiku-4-5-20251001` rewords progress updates. 45 s timeout, one retry; a refusal, error or empty reply falls back to the template.
   - **Caps:** Console → Settings → "Arc AI requests a month" by account type (`ConsoleSettings.ai.caps`, `lib/ai-caps.ts`): Free 0, Trial 50, Paid 500, Comped 500, Internal 500, Test 50. Counted per workspace per IST month. At the cap Arc says so and uses its template.
   - **Log:** every call writes `AiUsage` (member, task, model, month, input and output tokens, ok); never the prompt or reply. Settings → Integrations → Arc shows "X of Y AI requests" and the month's tokens.
   - **Privacy:** `lib/ai-redact.ts` strips salary/CTC amounts, bank account numbers, IFSC and PAN from every prompt before it leaves. Arc still only drafts; Apply is a person.
2. **Google Calendar and Meet** (`9bd5d53`).
   - **Settings → Google** (Personal group, every member, own account only): Connect / Disconnect per service. OAuth with one scope per service (`calendar.events`; `gmail.send` for item 3), `access_type=offline`, `prompt=consent`, a signed state cookie bound to the member and workspace, scope checked on return. The refresh token is sealed with `secret-box` (`GoogleConnection`, never exported); a revoked grant marks it "Reconnect"; Disconnect revokes at Google and deletes it. Reuses `GOOGLE_CLIENT_ID/SECRET`; second redirect URI `/api/integrations/google/callback`.
   - **Sync** (`modules/work/meetings/google-sync.ts`): create, update and cancel in Work create, patch and delete the event on the organiser's primary calendar with the attendees' emails and, when the meeting has no link of its own, `conferenceData.createRequest` (unique `requestId`) and `conferenceDataVersion=1` (asserted in `client.test.ts`). `sendUpdates=none` because Flowbit already emails the .ics invite. Event id and Meet link are stored on `Meeting.google`; the Meet link becomes the meeting link and goes into the invite email. A Google failure never fails the meeting; it is stored and shown on the meeting page.
   - **Import:** the Meetings calendar shows the viewer's own Google events for that week (on demand, read-only, dashed, linking to Google), without the ones Flowbit created and without all-day events.
   - All Google HTTP is in `modules/google/client.ts` (mocked in tests).
3. **Orbit follow-up sequences** (`a2bc328`, fix `5e13e8b`).
   - **Builder** (Orbit → Sequences): up to 5 steps (email with `{{first_name}}`, `{{company}}`, `{{owner}}` and `{{x|fallback}}`, call task, reminder, wait N days), the IST send window (Monday to Saturday, hours per sequence) and the daily cap per sender (default 150, counted across sequences per IST day with an atomic counter).
   - **Enrol:** Leads → select → Enroll in sequence, or the lead page's Sequence card. Open leads you can edit, with an email when the sequence sends one, one live enrolment per lead (unique index). The person who enrols is the sender.
   - **Sending:** the sender's own Gmail when connected (`gmail.send`, RFC 2822 built in `mime.ts`), otherwise `enqueue` (Resend) with Reply-To set to the sender (the email adapter now maps a `Reply-To` header to Resend's `replyTo`). Both carry the unsubscribe link and `List-Unsubscribe` + `List-Unsubscribe-Post`; the workspace suppression list is checked before each email.
   - **Exits:** Replied (button; logs a reply and moves new/contacted leads to Engaged), Remove, bounce or complaint, unsubscribe, conversion (won), lost or disqualified (hooked into the stage move and conversion, and re-checked by the runner), archived sequence, no email, three failed sends. **TODO:** reply detection through a reply-to address (needs inbound mail).
   - **Activity:** each email is logged as a done Email activity, calls and reminders become planned activities for the sender; the lead page shows progress and step history.
   - **Runner:** `/api/cron/sequences` every 15 minutes (`vercel.json`), claims each due enrolment (`claimedUntil`), skips workspaces that are paused, read-only or without Orbit.
4. **User manual** (`4eacd8c`).
   - The launch kit's HTML chapters are copied into `content/manual` and 115 screenshots into `public/manual-img` (10 MB); the external folder was not changed. `/manual` (index with search and product sections) and `/manual/<chapter>` (9 chapters, contents on the side) are prerendered at build.
   - Edits while copying: the WhatsApp wallet, Connect WhatsApp and WhatsApp inbox topics removed and every other WhatsApp mention removed or turned into "coming soon" (3 left, each "coming soon"); uploads say 4 MB (5 places); Integrations and Arc text updated; a new "What's new in 2.0 and 2.1" chapter (14 topics). `content.test.ts` checks topic ids, cross-chapter links, screenshots, WhatsApp and the upload limit.
   - Linked from the marketing nav ("Manual"), the footer ("User manual") and the account menu ("Help: user manual").

**Checks:** `tsc` 0 errors; Vitest 1,833 tests in 205 files pass (1,763 in 190 before); ESLint on `src` and `scripts` 0 errors (21 warnings, unchanged); `NEXT_DIST_DIR=.next-s5` build with `--max-old-space-size=3072` passes, the manual pages prerender as static (`/manual` ○, 9 chapters ●). `tsconfig.json` restored and `.next-s5` removed. A scratch Vitest run on `flowbit_v2dev` checked the new models and indexes, the daily cap under four concurrent sends (exactly 2 of 4 at cap 2, which found and fixed a race), the one-live-enrolment index and a runner email step on real Mongo; the database was dropped. No real Google, Gmail or Anthropic call was made; the `flowbit` demo database was not touched.

**Assumptions:** a Google connection belongs to one member in one workspace; events go to the organiser's primary calendar and Google sends no emails of its own; a meeting with its own link gets no Meet; external events show only on the calendar view and only for the viewer, not when "Organised by me" is on; the person who enrols a lead sends its emails and owns its tasks; the daily cap is set per sequence but counts every sequence email the sender sends that day; any member with `leads.write` can build a sequence, its creator or a reviewer (`orbit.close`) can edit or archive it; sequence emails are non-essential mail (kind `sequence`), so an unsubscribe stops them; Replied moves only new or contacted leads to Engaged; a lead's stage is not moved by a sent email (only the activity is logged); Haiku 4.5 handles progress rewording, Sonnet 5.5 the JSON drafts; AI caps count requests (a JSON retry counts twice); the manual's screenshots were kept as taken, including ones that still show WhatsApp controls.

**Owner actions:** in Google Cloud, add the redirect URI `https://<APP_URL>/api/integrations/google/callback`, enable the Calendar and Gmail APIs, add the `calendar.events` and `gmail.send` scopes and submit them for Google's sensitive-scope verification (no CASA); set `APP_ENCRYPTION_KEY` if not set; set `ANTHROPIC_API_KEY` for real AI; run `npm run setup:prod` after deploying (new collections and unique indexes); a Vercel plan with sub-daily crons for `/api/cron/sequences`.

**Not in this step:** inbound reply detection; a browser click-through and 375 px check (no browser in this run); real Google and Anthropic calls; retaking manual screenshots that show WhatsApp; Gmail sends are not copied into the Messages log (they are on the lead's activity).

## v2.1 step 4 (built 9 Oct 2026)

Tier 2 items 7, 9 and 10 of `docs/REVIEW-8OCT-PLAN.md` (review items 9–12), one commit each on top of `ed6200d`.

1. **Posts** (`768b7ac`).
   - **Ten types** (`modules/work/posts/post-types.ts`): Announcement, Update, Kudos, Celebration, Policy, Question, Poll, Win, Welcome, Event, each with a Phosphor duotone icon in a tinted pill. `@phosphor-icons/react` 2.1.10 (MIT) is imported one SSR file per icon (`dist/ssr/<Name>`), so only the ten used icons ship: about 3.7 KB raw each, roughly 10 KB gzipped in all. Old `discussion` and `idea` posts read as Questions; `scripts/migrate-post-types.ts` (dry run, then `--apply`) rewrites them. Announcements and policies stay with moderators (`posts.manage`).
   - **Policy:** members get "I've read this"; the author and moderators see who has and has not acknowledged (post page panel), export it as CSV (`/api/work/posts/[id]/acks`, formula-safe) and remind only the pending people, at most once an hour.
   - **Kudos:** tag one or more people (required); they are notified, and so are their managers (`Member.managerId`). The Muster profile has a Kudos tab with the kudos the viewer may see.
   - **Polls:** 2–8 options, single or multiple choice, anonymous (voters stored to keep one vote each, never shown), optional close date, close by hand, live bars after voting; votes can be changed or withdrawn until it closes. Concurrent votes are guarded by `updatedAt`.
   - **Scheduled publishing:** "Publish at" (IST, up to 90 days); `/api/cron/posts` every 15 minutes (added to `vercel.json`) publishes due posts once and sends the notifications then. The author sees a "Your scheduled posts" section.
   - **Audience:** everyone, roles, teams / departments / work locations (only the kinds the workspace has: Work teams, member departments, Muster work locations), or only mentioned people. Enforced in the feed query, the post page, Arc search and the announcement pop-up.
   - **Automatic posts:** a new automation step `post` and three People recipes, on by default: birthday and work-anniversary Celebrations on the day, a Welcome on the joining day. One post per recipe, person and occurrence (`autoKey`, unique per workspace); posted as the workspace owner, marked "Posted automatically"; name only, never the date of birth or age. They can be switched off or reworded in Settings → Automations.
   - **Feed:** filter chips by type with icons (scroll sideways on a phone), sort, "About me", a Pinned section on top, cleaner cards (author line, type pill, who it is about, event time and place, poll or policy strip, reactions and replies). GIFs stay file uploads; a TODO marks Klipy search.
2. **Activation** (`bc9c831`).
   - **Load sample agency** (`modules/activation`): 2 clients, 3 projects, 15 tasks, 5 leads, 2 draft invoices (only when a Folio business exists) and 3 employees, only for the products the workspace has, every row `sample: true`. **Remove sample data** deletes only those rows through the workspace-scoped models; a failed load clears itself. Offered on Home's empty state, the Get started card and the Setup guide's data step. Audited.
   - **Get started** card on Home for owners and admins for 30 days, until done or hidden: invite 2 people, create a project, add a task, check in, draft an invoice. Ticked from real data (sample rows excluded) or UsageEvents; steps of products the workspace lacks are left out.
   - **Product tours:** `components/activation/product-tour.tsx`, no library: a spotlight ring and a tooltip card, five steps each for Work, Muster, Orbit and Folio, pointing at shell anchors (`data-tour`) and centring when a target is hidden (phones). Starts on a product's first visit, remembered in `User.prefs.toursSeen`, replayed from the account menu ("Help: replay the tour"). Arrow keys, Enter and Esc.
3. **Location check-in on the web** (`1dd8925`).
   - Muster → HR settings → Attendance rules → Location at check-in: off, optional or required; office areas (name, latitude, longitude, radius 25–5,000 m, "use my location"); outside every area is flagged or blocked.
   - Check-in and check-out from the side panel and the phone quick check-in (one hook) read the position once, high accuracy, no cache; breaks never ask. Haversine distance to the nearest office decides inside or outside (`lib/geo.ts`).
   - A notice is shown before the first read; acceptance is stored on the member (`locationConsent`, with the notice version) and audited, and the server never stores a location without it. Declining keeps optional check-ins working.
   - Stored on the punch's existing `geo` field (the bot's lat/lng) plus accuracy, inside, office and distance. The daily view shows each check-in and check-out place with a Google Maps link; outside is amber.
   - The `Permissions-Policy` header blocked geolocation (`geolocation=()`); it is now `geolocation=(self)`.

**Checks:** `tsc` 0 errors; Vitest 1,763 tests in 190 files pass (1,697 in 181 before); ESLint on `src` and `scripts` 0 errors (21 warnings, unchanged); `NEXT_DIST_DIR=.next-s4 next build` passes, but only with a 3 GB heap: the build's own type check runs out of memory at 2 GB (standalone `tsc` already used 2.27 GB before this step), so the build ran with `--max-old-space-size=3072` as the single heavy job. `tsconfig.json` was restored and `.next-s4` removed. A scratch Vitest run on `flowbit_v2dev` loaded the sample agency into two workspaces, removed it from one (real rows and the other workspace untouched) and upserted the same birthday post twice (one post); the database was dropped. Sample and post documents were also validated against the Mongoose schemas. The `flowbit` demo database was not touched.

**Assumptions:** old discussions and ideas become Questions; any member may post every type except Announcement and Policy; editing a post keeps its type, poll and images; audience targeting is open to every type; a groups audience matches a team, a department (member's department, case-insensitive) or a Muster work location; kudos managers come from the member's manager in Work; automatic posts are authored by the first active owner and need Flowbit Work; no birthday privacy setting exists, so the recipes are the switch; the checklist is hidden per workspace (not per person); "invite 2 people" counts pending invites plus teammates; tours point at shell anchors, not product-specific buttons; a check-in is inside when the distance is within the radius (accuracy is stored, not added); location applies to web check-in and check-out only.

**Not in this step:** GIF search (Klipy, needs a key); a browser click-through and 375 px check (no browser in this run); running `migrate-post-types.ts --apply` on production; the employee's own attendance page does not list punch places yet; tours do not yet point at product-specific buttons.

## v2.1 step 3 (built 9 Oct 2026)

Tier 2 items 2, 3, 4, 14 and 15 of `docs/REVIEW-8OCT-PLAN.md` (review items 19, 20, 27, 30, 35), one commit each on top of `d8eb1ed`.

1. **Clients page** (`5dd1ead`).
   - **Measured first** with `scripts/perf-clients.ts` (`MONGODB_DB=flowbit_v2dev npx tsx scripts/perf-clients.ts --bulk 2000`) on the seed plus 2,000 synthetic clients, 4,000 deals, 20,000 activities and 8,000 invoices. Before: name sort 4.3 ms, recent 7.1 ms, search 19.4 ms, outstanding sort 32.6 ms, pipeline sort 35.0 ms (medians). The queries were not the slow part on the demo data; the cost grew with computed sorts, which loaded every client in full and ran all four metric lookups over every id. Now candidates read only `_id`/status/updatedAt, the sort metric is one grouped pass without a 2,000-id `$in`, full documents and metrics load only for the 25 on the page, and count and page run in parallel. New indexes `{orgId, updatedAt}` and `{orgId, createdAt}`. After (with the new card numbers included): name 8.1 ms, recent 5.5 ms, search 7.9 ms, outstanding 23.2 ms, pipeline 25.3 ms, health filter 29.9 ms, dashboard 26.1 ms.
   - **Dashboard:** tiles for total clients, new in 30 days, active this month (Orbit activity, time or an invoice this month) and overdue; charts on the existing SVG/CSS components: clients by health (donut; by status when nobody is active), new clients per month (12 months), top clients by revenue (12 months, taxable net of credit notes).
   - **Filters and sort:** health, new in 30/90 days, onboarding month, owner, tag, status; sort by "Newest first" (onboarding date). Cards (default) or list (`?view=list`).
   - **Cards and rows:** logo, status, health, hours this month against the retainer's new optional "Hours a month", margin over 90 days (time × each member's hourly cost from the current Muster salary structure, CTC ÷ 12 ÷ 176 h, against Folio revenue; only for viewers with `payroll.read` and Folio), overdue, last activity and onboarding date.
   - **Health** (`modules/clients/health.ts`): at risk when an invoice is more than 60 days overdue or nothing happened for 90 days; needs attention with anything overdue or 30 quiet days; else healthy. Only active clients have one.
   - **Tasks tab** on the client page: the Work task workspace (list, board, calendar, filters) locked to the client; rows open in the step 2 side panel. `LockedFilter` gains `client`.
2. **Folio report charts** (`a3495e4`). Reports opens on a Charts tab: receivables aging by bucket, each bucket linking to its open invoices (new `?aging=` filter on Invoices); invoiced vs collected over 12 months; top 10 by revenue (period) and by outstanding (today); GST summary by rate and month with CGST/SGST/IGST, net of credit notes. Firm filter and `folio.reports` respected. P&L labelled "billing-based".
3. **Tally export, beta** (`721f8f5`). Folio → Export (new page and nav item): TallyPrime XML for a period and firm in the documented ENVELOPE / HEADER / BODY / IMPORTDATA / REQUESTDESC / REQUESTDATA / TALLYMESSAGE envelope. Sales (party, income, output CGST/SGST at half rate and IGST per rate, round-off closes any residual), credit notes, receipts (bank or cash plus TDS receivable), expenses as Payment or Journal (claimable GST split by GSTIN states), optional party masters. Ledger names and the Tally company are mapped on the same page (stored in `FolioSettings.tally`, blanks keep defaults). Over 5,000 documents of a kind is refused ("pick a shorter period"). Each export is audited.
4. **PDF branding** (`e417455`). Invoice, quote, credit note, receipt, statement, payslip and letters take heading and accent colours from the workspace brand (when the plan allows brand colours, as the shell does), darkened until readable on white (4.5:1 headings, 3:1 accents); Flowbit's colours otherwise. Receipts and statements carry the workspace logo; Folio documents fall back to it when the firm has none.
5. **Support access** (`9cb97d0`). Settings → Support access lists every importer from `IMPORTERS` (label, product, description) and what cannot be imported (billing and subscription, inventory, past Folio documents, payroll history, files and chats).

**Checks:** `tsc` 0 errors; Vitest 1,697 tests in 181 files pass (1,663 in 176 before); ESLint on `src` and `scripts` 0 errors (21 warnings, unchanged); `NEXT_DIST_DIR=.next-s3 npm run build` passes. Smoke runs on `flowbit_v2dev`: report charts and the aging invoice filter, a full Tally export (5,076 vouchers, 0 unbalanced), and a branded PDF render (yellow brand printed as a readable olive). The database was dropped afterwards; the `flowbit` demo database was not touched.

**Assumptions:** onboarding date is the client's creation date; health uses Orbit activity, the last invoice and record edits (not time entries); margin covers the last 90 days; hourly cost uses 176 working hours a month; retainer hours are a new optional field; the cards view is the default; aging keeps Flowbit's five buckets (not due, 1–30, 31–60, 61–90, 90+) rather than 0–30; "top clients" by revenue follows the chosen period; the GST summary excludes void invoices and counts written-off ones; Tally ledger mapping sits on the Export page (folio.settings to edit) rather than Folio settings; expenses are always paid, so they export as Payment unless Journal is chosen; PDF brand colours follow the same plan gate as the app shell.

**Not in this step:** a test import into a real Tally company; a browser click-through and 375 px check of the new screens (no browser in this run); health from time entries; tasks created from the client Tasks tab quick add do not get the client set; the clients CSV export ignores the health filter.

## v2.1 step 2 (built 9 Oct 2026)

Tier 2 items 1, 8 and 11 of `docs/REVIEW-8OCT-PLAN.md`, one commit each on top of `4e6e649`.

1. **Hinglish quick add** (`c6238de`).
   - Every quick-add input (Tasks list, board columns, calendar, space and project Tasks tabs, subtasks, Home → Assign to me) reads the title as it is typed. The parser is `modules/work/tasks/quick-parse.ts` (+ `quick-parse-dates.ts`), pure and in IST. No new dependency: `chrono-node` is not installed, so the Hinglish words have their own small parser.
   - **Dates:** aaj/today, kal/tomorrow, parso, weekdays in English and Hindi (somvar … ravivar), next mon / agle hafte, 15 oct / oct 15 / 15/10 (the next such date), in 3 days / 3 din mein. **Times:** 5pm, 5:30 pm, 17:30, 5 baje (1–7 read as evening, 8–11 as morning), subah, dopahar, shaam, raat, "kal shaam 6 baje". A time alone is today if still ahead, else tomorrow. Little words that tie a date on ("by friday", "kal tak") are dropped.
   - **Tokens:** `@person` (fuzzy on active members), `#project` (code or name), else `#list` (with its space), else `#space` (when it has one list), `!client`, `p1`–`p4`, `!!` (high) and `!!!` (urgent). Unknown tokens stay in the title.
   - What was read shows as chips under the input; X keeps that word as plain text. Home loads the people/project/client lists on first focus (`quickAddOptions`).
   - Tasks gain an optional `dueTime` ('HH:mm'), shown in the task panel and cleared when the due date changes.
   - Tests: 39 phrase cases in `quick-parse.test.ts`.
2. **Task side panel and relations** (`eb03dce`).
   - `app/app/@panel/(.)work/tasks/[id]` intercepts task links anywhere under `/app` (lists, board, calendar, Home, bell), so the task opens in a right-hand panel over the page; a deep link or refresh still renders the full page. The panel closes itself when the URL leaves the task (`usePathname`), so the slot needs no catch-all.
   - Layout: key fields under the title (status, project, client logo, assignees, due with time, priority, relation flags), a main column (description, subtasks, checklist, relations, attachments, comments with the existing All / Comments / Activity toggle) and a sticky properties column (details, watchers, time). Full screen on phones. Non-modal Radix dialog: the list behind stays usable.
   - Keys: J/K next or previous task in the list on screen (each view registers its order, `panel/task-order.tsx`), E edit title, M assign to me, `?` shortcut sheet, Esc close. Single keys are ignored while typing or when another layer is open.
   - The task page and the panel share `detail/load-task-view.ts` and `detail/task-sections.tsx`, so there is one loader and one set of cards.
   - **Relations:** `blockedByIds` and `relatedIds` on Task (Blocks is the inverse query). Add from the panel by key or title search; loops are refused; deleting a task drops it from others. Cards and rows flag orange while waiting, red while holding work up, green once the blocker is done (`relation-flags.ts`, tested). Linked to Blocked status: an open blocker offers Mark blocked (with the existing reason dialog), all blockers done offers Unblock, and finishing a task logs "blocker done" on the tasks it held up.
3. **Teams member cards** (`39f3468`).
   - Team → Members switches between cards and a sortable list (member, status, role, load this week, open, projects); the choice is saved on the user (`prefs.teamView`).
   - Card: avatar with today's presence dot (checked in, on break with its type, on leave, offline; `modules/work/presence.ts` from attendance punches and approved leave), title and team role, this week's load bar, open/late counts, project logos (+N, only projects the viewer may see). Hover lights a slow gradient hairline; reduced motion stops it.
   - **Leave/OOO:** assignee avatars (list, board, subtasks, task panel, create dialog, Home) carry an amber dot when the person is on approved leave today. Assigning someone, or moving the due date, onto a leave day shows a non-blocking warning (task details, create dialog, quick add). Leave is read 90 days ahead with the people list.

**Checks:** `tsc` 0 errors; Vitest 1,663 tests in 176 files pass (1,607 in 172 before); ESLint on `src` and `scripts` 0 errors (21 warnings, unchanged); `next build` passes (the interception rewrite is in the routes manifest). A scratch Vitest run against `flowbit_v2dev` exercised relations (add, flags, loop refusal, search, remove) and presence (break type, leave) on real Mongo; the database was dropped afterwards.

**Assumptions:** `!!` is high and `!!!` urgent (p1 is urgent); a bare "5 baje" is 5 pm; `@person` in quick add replaces the default "assign to me"; the member card/list toggle lives on a team's Members tab; leave means approved Muster leave (pending requests do not count); flags show on list rows and board cards, not on Home or calendar chips.

**Not done:** no browser click-through (browser tools were off for this run); "local time" and skills on member cards (from the plan row) were not in this step's scope.

## v2.0 lock (Tier 1) (built 9 Oct 2026)

Tier 1 of `docs/REVIEW-8OCT-PLAN.md`. Each item is its own commit, on top of `98ada19`. The rows in `docs/REVIEW-8OCT.md` are marked "Done 9 Oct".

1. **WhatsApp behind a flag** (`9c6b3b2`).
   - **How the flag works:** `FEATURE_WHATSAPP` is the master switch and is off by default. When it is on, Console → Settings → Features can still turn WhatsApp off for every workspace. See `lib/feature-flags.ts` and `modules/features/flags.ts`.
   - **What hides while it is off:**
     - Integrations → WhatsApp (the card, and a 404 on the page)
     - the Billing wallet tab and page
     - the Profile phone opt-in card
     - the WhatsApp column in both notification grids
     - the inbox nav link, the inbox pages and their command-palette entries
     - Send on WhatsApp (invoice, quote, credit note)
     - the WhatsApp automation channel and the brief switch
     - the Console inbox and the account wallet tab
   - **Server side:**
     - every WhatsApp action refuses (`assertWhatsAppOn`)
     - `isWhatsAppConnected` answers false
     - both webhooks answer 404, so the employee bot is silent
     - every WhatsApp send is skipped as `whatsapp_off` and falls back to email
   - No WhatsApp code was deleted.
2. **Comment speed** (`f8e20cd`).
   - `addComment` saves the comment and answers.
   - Watchers, the activity row and the notifications run after the response through `after()` (`lib/after-response.ts`). Each runs on its own, and a failure is logged without affecting the others (`lib/side-effects.ts`).
   - Comment edits, deletes and reactions revalidate only the task page, not the whole `/app` layout.
   - The composer is optimistic: the comment shows as "Sending…" and is rolled back if the save fails (`lib/optimistic-list.ts`).
   - Post replies follow the same pattern.
3. **Brand theme** (`bc832e3`).
   - Brand colours now set `--grad-button-alt`, `--grad-selected` and `--grad-step`.
   - New tokens for the check-in pill stroke, the Arc glow, pill and wordmark, and the auth brand word replace the hard-coded purple gradients.
   - The progress-bar glows use `--orchid`.
   - The workspace logo replaces Flowbit's in the side panel and the phone top bar.
4. **Home quick add** (`7c27126`). The "Assign to me" card (All tab) has an inline input. The new row shows as "Adding…" until the refreshed list carries it.
5. **Break types** (`dfa27f2`).
   - Lunch, Power Nap, Tea/Coffee and Personal/Rest. Each is paid or unpaid with a daily limit, set in HR settings → Attendance rules. The defaults are those in the plan.
   - The picker opens from Take break, on the side-panel card and on the phone quick check-in. It refuses a type whose limit is used up.
   - The type is stored on the `break_start` punch, and minutes per type are stored on the day.
   - Payable minutes are worked minutes plus paid breaks, each counted up to its limit (`lib/break-types.ts`).
   - Effective vs payable hours show on the daily sheet, the register (effective h, payable h and a breaks column), Home's attendance line and the check-in card tooltip.
6. **Images and GIFs** (`1a05f95`).
   - JPEG, PNG, GIF and WebP work in posts, replies and task comments: up to 4 images, each within the upload limit.
   - Each image goes up on its own request (4 MB on Vercel) as a `comment_image` or `post_image` file.
   - A post or comment then claims the images by id. Only the same person's uploads of the right kind (and task) are accepted.
   - The files open with the task's or the post's own access rule.
   - Thumbnails show with a lightbox.
7. **Logos and colours** (`b39cb02`).
   - Projects (Settings tab) and clients (Overview) take a JPEG or PNG logo. It is resized in the browser to 256 px and capped at 1 MB on the server.
   - The client logo shows on the clients list and page, on task rows, on board cards, and in the task detail (header pill and Client field).
   - The project form has a custom colour after the presets.
8. **Clients → Import** (`fec7d24`). The button opens the Contacts and companies importer or the Folio clients importer, with a menu when both are available. Back and Done return to Clients.
9. **Version 2.0** (`ac74a70`).
   - `package.json` is now 2.0.0.
   - "Flowbit 2.0" shows at the foot of every Settings page (`lib/version.ts`; a test checks it against `package.json`).
   - `CHANGELOG.md` was added.
10. **Red "test" text.** Not found in the UI code (see Assumptions).

### Checks on 9 Oct
- `tsc`: 0 errors.
- Vitest: 1,607 tests in 172 files pass. There were 1,545 in 161 files before this step.
- ESLint on `src` and `scripts`: 0 errors and 21 warnings, the same as before.
- `NEXT_DIST_DIR=.next-s1` build passes. `tsconfig.json` was restored and `.next-s1` removed afterwards.
- A DB smoke test on `flowbit_v2dev` checked:
  - break-type punches (a bad type is refused by validation)
  - per-type minutes and payable hours
  - images on comments and posts, with the lookup by file id
  - the Console `features` switch
  - project and client logos

  The database was dropped afterwards. The `flowbit` demo database was not touched.
- **Not covered:** a browser click-through (no browser tools; no password sign-in).

### Assumptions (simplest reading)
- **WhatsApp flag:**
  - The flag is platform-wide: the env switch AND the Console switch, which defaults to on so the env switch alone decides.
  - "Workspace + platform" was read as covering the workspace app and the Console. There is no per-workspace switch.
  - Hand-written WhatsApp (wa.me "Open WhatsApp" links, the Folio manual reminder queue and the Folio "WhatsApp" reminder channel) stays visible, because it does not use the integration.
  - Historical WhatsApp rows stay in the Messages log, and the onboarding line "Phone numbers are verified later, on WhatsApp" was left as is.
- **Text required:** comments, replies and posts with images still need text. Image-only posts were not added.
- **Post images:** only new posts take images. Editing a post keeps its images.
- **Break limits:**
  - A new break of a used-up type is refused. Minutes past the limit of a running break are counted but not paid.
  - Breaks without a type (old data, the WhatsApp bot) count as unpaid "Break".
  - Limits are 5–240 minutes.
  - Payable hours are worked out when they are shown, from stored minutes per type and the current settings, so changing a setting re-prices past days too.
- **Logos:**
  - Logo resizing runs in the browser (canvas), so no new dependency was added.
  - Project and client logos are visible to every member of the workspace, like the workspace logo.
  - Client logos on tasks need `clients.read`, the same as the client picker.
- **Version:** "Flowbit 2.0" sits in the Settings footer, because no version was shown anywhere before.
- **Red "test" text:** the only "Test" labels in the UI are amber (Test mode, Test keys, Last test) or violet (automation run "Test"). None is clearly a leftover, so nothing was changed. The screenshot is still needed (row 33).

### Not in this step
- The user-manual edits from the plan (85 WhatsApp mentions, 4 MB not 10 MB) live in `flowbit-launch/manual`, outside this app.
- Glass break icons and animation (deferred by the plan).
- A Tasks tab on the client page.
- Per-workspace WhatsApp switches.

## v2 full check (8 Oct 2026)

Details are in `docs/V2-CHECK.md`. The check ran on `flowbit_v2demo` against the production build served on port 4400.

- **Static checks.**
  - `tsc`: 0 errors.
  - Vitest: 1,545 tests in 161 files pass.
  - ESLint on `src` and `scripts`: 0 errors, 21 warnings. A bare `npx eslint` now ignores every `.next-*` folder.
  - `next build` of a clean HEAD checkout passes.
- **Crawl.** The role crawl (`.local-test/crawl.mjs --db flowbit_v2demo`, updated for v2) covered:
  - every role and anonymous;
  - the v2 settings, profile and WhatsApp pages;
  - public links (`/d`, `/bill`, `/p`, `/a`, `/unsubscribe`);
  - the lead form (one valid POST and one honeypot POST);
  - unsigned webhooks and cron calls without the secret;
  - Console role gating for Admin, Sales and Accounts, and for a session before 2FA;
  - the mobile tags.

  The final run made 9,158 requests with 0 flags and no server errors. The first run raised 46 flags.
- **Fixed.**
  - `src/lib/storage` was never committed: the `.gitignore` `storage` line matched it, so a clean checkout could not build (`58b05ce`).
  - The WhatsApp settings page linked the wallet for users without `billing.manage` (`ac3e4b3`).
  - The demo seed sent "added to project" bell links to non-members, and those links opened a 404 (`dd22e44`, with a test).
- **Not covered.** Live Interakt, Razorpay and IndiaMART traffic, email delivery, visual layout, client-side errors, and server-action write flows.

## v2 step 1 (built 8 Oct 2026)

The "17 Oct" row of `docs/specs/console.md` §12.

- **One entitlements function:** `entitlements(org, now, usage?)` in `src/lib/entitlements.ts` returns account type, access, status, products, features, Muster tier, seat limit, seats used, Folio firm limit, capacity rows and reasons. `ctx` (`ctx.entitlements`), `action()`, the ~30 API routes (`isBlocked(ctx)`), the cron filters (`canWrite`), the shell banners, the subscription page, `capacityOf`/`assertCapacity`, Folio firm limits and `/platform` metrics (`orgState`, `seatLimitOf`, `mrrOf`) all read from it.
- **`isTrial()` fix:** `isTrial(org, now)` is true only while the trial runs (derived from `trialEndsAt`). An expired trial no longer counts as unlimited: no countdown, 2 Folio firms, 0 seats in `capacity()`.
- **Account types:** `subscription.accountType` (internal, test, free, trial, paid, comped) with `accountTypeOf()` resolving workspaces created before the field from the plan; `scripts/migrate-account-types.ts` stores it (dry run by default, `--apply` writes). Internal and Test are never billed or reminded, always open, unlimited, and left out of every `/platform` number. The seed marks `vistaar` as Test. `/platform` shows the type (column, filter, detail) and staff can set it ("Account type" action; Comped needs an end date).
- **Free plan:** up to 5 billable seats (the higher of logins and on-payroll Muster employees), every product, 2 Folio firms, 6 months; then read-only and blocked like an ended trial.
- **Signup:** onboarding starts with an email code (`EmailVerification`, 6 digits, 10 minutes, 5 tries, 5 codes an hour); Google, reset and invite links also mark the email verified. Team size is now Just myself / 2-5 / 6-10 / ...: up to 5 people (owner + invites included) starts Free, more starts a 15-day trial. An optional GSTIN or PAN field; one Free workspace per verified user, GSTIN or PAN. `createWorkspaceAction` is limited to 3 workspaces per user per day.
- **House leads:** every signup and demo request creates or updates a Lead in Vistaar's own Orbit when `FLOWBIT_HOUSE_ORG_SLUG` is set (owner = that workspace's owner, source website/inbound, sector other), after the response.
- **Day 0 email** to the new owner (`kind: 'onboarding'`), after the response.
- **`UsageEvent`** (kept 400 days) via fire-and-forget `recordUsage()`: login, attendance marked, invoice issued, task created and moved, lead touched, upgrade clicked, limit hit.
- Checks on 8 Oct: `tsc` 0 errors, 971 Vitest tests pass (915 before, one of them failing on the date), ESLint 0 errors (24 warnings, unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. The `flowbit` demo database was not touched; DB smoke checks ran on `flowbit_v2dev` and were cleaned up.
- **Not in this step:** UTM capture at signup, Free/trial expiry emails and Day 1/3/7 emails, enforcing Free limits beyond seats (WhatsApp, add-ons), the Console host.

## v2 step 2 (built 8 Oct 2026)

The "31 Oct" row of `docs/V2-PLAN.md` §4: the messaging hub core (email + in-app; WhatsApp plugs in later), notification preferences, team alerts by email and the personal brief builder. Spec: `docs/specs/notifications-v2.md` §0b, §1, §4, §5.

- **Message pipeline** (`src/modules/messaging/`): a `Message` model (`src/models/messaging/Message.ts`) with every §1.1 field, plus `cost`, `automationId` (unused for now) and optional DLT fields for SMS. `enqueue()` stores the message, honours the suppression list and tries to send at once; a failure is retried at 1 m, 5 m, 30 m and 2 h, then marked failed. Channel adapters behind one interface: `email` (Resend, client injected), `inapp` (the bell) and a `whatsapp` stub that answers "not connected" so a message falls back to email when it allows it (TODO names Interakt). `sendMail()` now goes through the pipeline, so every existing email call keeps working; mail with live codes (`secrets`) is masked and never retried; Folio reminders pass `retry: false` because the Folio cron retries them itself.
- **Cron and webhook:** `/api/cron/messages` every 5 minutes (retries, scheduled and quiet-hours sends, digests, recovery of sends cut off mid-run, copying old Outbox rows in batches of 500) and `/api/cron/briefs` every 15 minutes, both on the existing cron auth and lease. `/api/webhooks/resend` verifies the Svix signature with `RESEND_WEBHOOK_SECRET` and moves status forward (sent → delivered → opened, or failed on a bounce); hard bounces and spam complaints suppress the address for non-essential mail.
- **Contacts and consent (minimal):** `Suppression` (non-essential scope for unsubscribe, bounce, complaint; "all" scope ready for WhatsApp STOP, with `isStopKeyword()`), `ConsentLog` (time, source, notice version; append-only). Alerts, digests and briefs carry an unsubscribe link (public page `/unsubscribe/[token]`, HMAC token, no sign-in) and RFC 8058 one-click headers (`POST /api/unsubscribe/[token]`). Security mail, payslips and documents sent by hand ignore unsubscribe.
- **Messages log** (Settings → Messages log, `/app/settings/messages`) replaces the Email log (the old URL redirects): channel, status, type (alert group or mail kind) and date filters, a per-message timeline, "Send again", and the reason a message was skipped. Old Outbox rows are copied in by the cron, and for a workspace the first time its log opens.
- **Notification preferences:** workspace defaults (Settings → Notifications) and personal overrides (Profile → My alerts) as an event-group × channel grid (in-app, email; WhatsApp shown disabled, "Connect WhatsApp (coming soon)"); quiet hours (default 21:00–08:00 IST, workspace or personal); digest (hourly or end of day at 18:00, comments always hourly); snooze (1 hour, rest of today, until a date). Fixed rules: payslip contents never by WhatsApp; security mail always goes. `notify()` keeps its signature: it resolves each recipient's channels per event group, writes the bell (in-app stays the default) and enqueues the email (sent now, held, batched or skipped); system callers (crons) leave the sending to the messages cron.
- **Team alerts by email** with the §3 defaults: task assigned, @mention, blocked, due today and overdue (from the existing reminders cron), comments as an hourly digest, pending approvals (leave, timesheet, claims, corrections, comp-offs, bank change), decisions (leave and the rest), Orbit follow-up due, meetings with an `.ics` invite (update and cancel replace the calendar entry). Every email links back to the item, with branded alert and digest templates.
- **Brief builder** (Profile → Briefs): several briefs per person with time, days, frequency (chosen days, weekdays, weekly, monthly on the 1st), channels (in-app, email), ordered sections, filters (which tasks, priorities, projects) and skip-if-empty; role presets (owner, manager, accounts, sales, employee); "Send me a preview now". Sections are permission- and product-checked when offered and again when built: Work (due today, overdue, this week, blocked, today's meetings, timesheet), Approvals, Team (out or late today, team overdue), Money (due and overdue with top 5 clients, yesterday's receipts, this month's billing) and Sales (follow-ups, new leads yesterday, deals closing this week).
- Checks on 8 Oct: `tsc` 0 errors, 1,046 Vitest tests in 114 files pass (971 in 106 before), ESLint 0 errors (24 warnings, unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. A DB smoke run on `flowbit_v2dev` (retry then send, alert email with unsubscribe header, hourly digest, unsubscribe skip with essential mail still sent, webhook status order, Outbox copy, a due brief sent once by the cron) passed and the database was dropped. The `flowbit` demo database was not touched.
- **Not in this step:** WhatsApp sending, inbound STOP and the connect panel (step 8); approve-by-email links (§0b.14); leave-day and holiday hold; the bell filter and grouping (§5); a custom sending domain and workspace branding in emails (§1.3); the brief's Compliance section, "Workload", "Cash forecast" and running-timer lines; contact-level (client) consent screens; a browser click-through of the new screens and the 375 px check (no browser in this run).

## v2 step 3 (built 8 Oct 2026)

The "1 Nov" row of `docs/specs/console.md` §12 (`docs/V2-PLAN.md` row 3): Free limits, the Free/trial expiry flow (§4.3), Day 1/3/7 emails and export in every state.

- **Lifecycle model** (`src/lib/lifecycle.ts`, pure): `lifecycleOf(org, now)` gives the stage (free, trial, paid, comped, read_only, blocked, house, disabled, deleted), when it ends, days left, and the read-only, blocked and deletion dates (read-only 30 days after Free/trial end or the 7-day payment grace, blocked after that, deleted 90 days after blocking). `entitlements()` now carries `lifecycle` and `trialAvailable`.
- **Free seat limit:** adding a 6th billable seat (max of logins incl. pending invites and on-payroll employees) by invite, re-enable, employee create/import or giving an employee a login is refused through `entitlements()` (`modules/subscription/capacity-gate.ts`), records `limit_hit`, and the client opens an "Upgrade or start a 15-day trial" dialog (`components/subscription/limit-prompt.tsx`) instead of a toast. `ActionResult` failures can carry a `code` (`free_seat_limit`, `free_seat_limit_no_trial`).
- **Trial once, back to Free:** "Start 15-day trial" works once per workspace (`subscription.trialStartedAt`, guarded update; a signup Trial counts as used). The Free end is kept in `subscription.freeEndsAt`. A trial trimmed to 5 people inside the 6 months from signup goes back to Free ("Stay on Free" on the subscription page, or automatically by the lifecycle cron once the trial has ended). Disabling members and revoking invitations stay allowed while read-only so a team can trim.
- **Reminders and notices** (`modules/subscription/reminders.ts` + `lib/lifecycle-notices.ts`): Free ending 30/7/1 days (Free wording), trial ending 3/1 days, read-only, blocked, and deletion 30/7/1 days before; one notice at a time, keyed by threshold and date, sent once as essential email (owner + billing email) through `enqueue` and as a bell row. Day 1/3/7 onboarding emails (Work task, Muster attendance, Folio invoice) are skipped when `UsageEvent` shows the step done or the product is off; they are non-essential (unsubscribe link).
- **Deletion** (`/api/cron/lifecycle`, daily 04:30 UTC + catch-up): 90 days after blocking, `purgeWorkspace()` hard-deletes the workspace's rows in every collection of `modules/lifecycle/registry.ts` (a test fails if a model is not listed) and its stored files; keeps `SubscriptionInvoice`, a tombstone Org (`status: 'deleted'`, `deletedAt`, `purgedAt`, personal fields removed), audit and message log rows of the last year with personal data removed, and payment events without payload. Never Internal, Test, Comped before its end date, or staff-disabled workspaces. **Dry run unless `LIFECYCLE_DELETE_ENABLED=true`** (documented in `docs/DEPLOY-VERCEL.md`).
- **Workspace export** (Settings → Export, `/api/settings/export`, owner only, every state incl. blocked): a streamed ZIP (`lib/zip.ts`, deflate, no new dependency) with `workspace.json`, `json/<module>/<Model>.json`, `csv/<module>/<Model>.csv` (the shared CSV writer, formula-safe) and `files/` (up to 500 MB); token and code hashes are never included.
- **UI:** the shell banner and a panel on Settings → Subscription show the state, days left, what happens next and the actions (Upgrade, Start trial, Stay on Free, Export).
- Checks on 8 Oct: `tsc` 0 errors, 1,098 Vitest tests in 125 files pass (1,046 in 114 before), ESLint 0 errors (24 warnings, unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. A DB smoke run on `flowbit_v2dev` (export of one workspace only, dry run changes nothing, applied deletion with invoices kept, logs anonymised, files of the other workspace kept, tombstone, trial started once, Free reminder sent once as essential mail) passed and the database was dropped. The `flowbit` demo database was not touched.
- **Not in this step:** paid renewal reminders (Dec step); browser click-through of the new screens and the 375 px check (no browser in this run); moving Muster employees off payroll while read-only (trimming in read-only covers members and invites); Free limits beyond seats (WhatsApp, add-ons).

## v2 step 4 (built 8 Oct 2026)

`docs/V2-PLAN.md` row 4 and `docs/specs/notifications-v2.md` §0b.12–14, §0b.19, §1.4 and §3: public document links, payment links with automatic receipts, and the automation engine with the Money and Team recipes (email; WhatsApp actions fall back to email through the stub).

- **Public document link** `/d/<token>` (outside the app shell, no sign-in, `noindex`): the token is a random 18-byte key plus an HMAC under `APP_SECRET` (`modules/doclinks/token.ts`); the page checks the signature, then looks the key up (`DocLink`), so ids are never in the URL and links cannot be enumerated. Links can be revoked ("Turn off link") and may expire; opens are recorded once per half hour (`DocEvent`). Invoice: lines, totals, PDF, the UPI QR for the balance, "Pay now" when a Razorpay link exists, and "I've paid" with a UTR (verify task + owner alert). Quote/proforma: accept (typed name, comment, IP, time on the quote) or decline; acceptance alerts the owner and adds a convert-to-invoice follow-up. Credit note, receipt (new `ReceiptPdf`) and statement (open invoices of the client): view and PDF. The workspace's logo and primary brand colour on the dark client surfaces. Public POSTs are rate-limited per IP and per link.
- **Links in emails and the timeline:** invoice, quote and credit-note email dialogs prefill "View … online: <link>" and the email carries a "View online" button; statements carry one too. Invoice, quote, receipt and credit-note pages show "Online link and activity": copy/create/turn off the link, and sent → delivered → read → opened → accepted/declined → UTR shared → paid, built from `Message` rows and `DocEvent`s.
- **UPI QR** (`lib/upi.ts`, `uqr` 0.1.3, zero-dependency): `upi://pay?pa&pn&am&cu=INR&tn=<invoice no>` for the balance, on the invoice PDF (when the invoice's bank snapshot has a UPI ID) and the public page (falls back to the entity's default UPI ID).
- **Workspace Razorpay** (Settings → Integrations → Razorpay, `org.manage`): key id, key secret and webhook secret sealed with AES-256-GCM under `APP_ENCRYPTION_KEY` (`lib/secret-box.ts`); pages see the last 4 characters only. "Create payment link" on an invoice makes a Razorpay link for the balance with the invoice number as reference (`-2`, `-3` on a re-created link; the old one is cancelled after a part payment). The webhook `/api/webhooks/razorpay/<hookKey>` verifies `X-Razorpay-Signature` with that workspace's secret; `payment_link.paid` records a gateway receipt, allocates it to the invoice (up to the balance; any excess stays advance credit), marks the link paid, adds "Paid online" to the timeline and fires `payment.received`. Idempotent on the payment id (`PaymentEvent`, unique), and the receipt step itself reuses a receipt already recorded for that payment.
- **Reminders stop once paid:** verified (the run only reads issued/part-paid invoices with a balance); fixed the one gap: WhatsApp reminders already waiting in the Collections queue are no longer shown once their invoice is settled (`isRemindable`).
- **Automation engine** (`modules/automations`): `Automation` rules (event, date-offset or schedule trigger; conditions; message / task / in-app actions; delay; business hours Mon–Sat 09:00–18:00 IST; per-contact daily cap, default 3) and `AutomationRun` history (one run per record per rule via `dedupeKey`; every step says sent, queued, skipped or failed and why). `emitEvent(orgId, key, subject)` is called from the real paths: receipt recorded and payment link paid (`payment.received`), invoice issued, quote accepted online, UTR shared, retainer drafts created. Client messages go through `enqueue` (suppression and unsubscribe honoured; `kind: 'automation'`, `automationId` on the Message) and wait for the workspace's quiet hours; WhatsApp actions go to the stub and fall back to email. `/api/cron/automations` (every 5 minutes, `vercel.json`) runs delayed runs and the time triggers (meeting reminders each run, hour rules every 30 minutes, day rules once a day from 09:00 IST, schedules when due) and seeds recipes for every live workspace once a day.
- **Ready recipes** (seeded lazily per workspace): Money: payment thank-you with amount, invoice number and receipt link (**on**), part-payment acknowledgement (on), invoice issued → send (off), payment reminders (a bridge to the Folio reminder schedule, whose switch it shares; behaviour unchanged), overdue 30 days → owner alert + call follow-up (on), quote not accepted in 3 days → follow-up (on), quote expiring in 2 days (on), quote accepted → owner + convert task (on), retainer drafts → review (off), monthly statement on the 1st (off), UTR shared → verify task (on). Team: task overdue 3 days → project lead (off), leave pending 24 h → approver (on), 48 h → escalation approvers (on), meeting in 15 minutes → attendees (on).
- **Settings → Automations:** recipes by area with on/off switches, run history; the editor has variable chips (`{{client_name}}`…) with a live preview and typo check, channel, offset/time/day, delay, business hours, daily cap and conditions; "Test on me" sends the saved version to you with sample values; "Reset to Flowbit's wording". English defaults; Hindi is a TODO in `recipes.ts`.
- Checks on 8 Oct: `tsc` 0 errors, 1,158 Vitest tests in 130 files pass (1,098 in 125 before), ESLint 0 errors (24 warnings, unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. A DB smoke run on `flowbit_v2dev` (recipes seeded, one live link per document, tampered and revoked tokens refused, UPI QR on the page, one open per half hour, UTR → verify task, keys sealed at rest, bad webhook signature refused, part payment → receipt + part_paid + acknowledgement held for quiet hours then sent, replay recorded nothing twice, full payment → paid + thank-you with the receipt link, quote accepted once with name/IP, convert task, cron run) passed and the database was dropped. The `flowbit` demo database was not touched.
- **Not in this step:** WhatsApp sending and pay-in-WhatsApp (step 8); Cashfree; Sales, People and compliance recipes; creating custom rules from scratch in the UI (recipes are edited, not added); Work tasks as the "create task" action (tasks are Folio follow-ups for now); Hindi wording; workspace branding inside emails (§1.3); browser click-through and the 375 px check (no browser in this run); a rendered check of the QR inside the PDF (react-pdf only loads inside the Next build).

## v2 step 5 (built 8 Oct 2026)

`docs/V2-PLAN.md` row 5 and `docs/specs/console.md` §7–§9 ("Mid Nov" in §12): the Flowbit Console on its own host, staff with roles and 2FA, accounts, health score, support access, the importer framework with undo and consent, and the handover checklist.

- **Console host** (`src/proxy.ts`, `lib/console/host.ts`): `console.useflowbit.com` (`CONSOLE_HOST` overrides) serves everything under `/console`; product pages and product APIs answer 404 there (only `/api/console/*`, invoice PDFs and import templates pass). On the product host `/platform` and `/console` redirect to the Console host; on loopback hosts (`127.0.0.1:4100`) `/console` works in place. `src/app/platform` and `modules/platform` moved into `src/app/console` and `modules/console`; `lib/platform.ts` keeps only `elevated()`/`systemDb`.
- **Staff and sessions:** `Staff` (own email, password, role Admin/Sales/Accounts, founder flag) replaces `User.isPlatformAdmin` (removed from the schema, the shell menu and the sign-in paths). `StaffSession` with its own cookie `__Host-fb_console` (host-only, httpOnly, SameSite=Strict, 12 hours, token rotated after 2FA); nothing reads `fb_session` in the Console or the staff cookie in the product. Sign-in: password → TOTP (`lib/console/totp.ts`, RFC 6238 implemented and tested against the RFC vectors, ±30 s drift, a code never accepted twice) or one of 10 single-use recovery codes. First sign-in enrols with a QR code (`uqr`); the secret is sealed with `APP_ENCRYPTION_KEY`. Rate-limited per IP, email and staff member. Setup links (`/console/login/setup?token=`, 48 h, once) for new staff and resets.
- **Roles** (`lib/console/roles.ts`, spec 7.1): Admin everything; Sales views accounts, extends a trial once by up to 15 days (the count lives on the account), requests support access, runs imports and the handover; Accounts views accounts, invoices and cancels invoices. Every Console server action goes through `consoleAction(perm, …)`, which checks the role on the server; pages use `requireStaff(perm)`. Only the founder may open an Internal workspace.
- **Per-staff audit:** `StaffAudit` row for every Console action (Console → Audit, Admin), and actions on a workspace also land in its own audit log as "Asha (Flowbit Sales)" instead of "Flowbit support".
- **Pages:** Home (signups this week, Free · Trial · Paid, in setup, habit formed, conversions this month, Free ending in 30 days, overdue amount and accounts, "Call today", Sales alerts, signups chart, recent payments, demo requests; Internal and Test left out). Accounts (filters: type, status, health, salesperson incl. "My accounts", days left; sort by days left). Account detail: contact, type and plan, seats used vs limit, health signals, salesperson, notes, handover checklist, support access, and a Timeline tab merging signup, usage per day (30 days), plan changes, payments, messages and imports; role-gated actions (extend trial, end trial, plan, type, status, disable/restore). Setup (accounts with a running handover). Staff (add with emailed setup link, role, disable, reset sign-in; at least one Admin is kept). Settings (`ConsoleSettings`: prices, limits, templates, help links). Billing and Messages say "Arrives with the billing step".
- **Health score:** `/api/cron/health` (nightly 01:30 IST, catch-up 04:30 IST) aggregates `UsageEvent` per IST day/kind/person and scores Green/Amber/Red with the §7.3 thresholds (`modules/console/health.ts`), stored on `ConsoleAccount`. "Call today": Red accounts with more than 5 seats and Free accounts in their last 30 days. A limit hit or an Upgrade click raises a `StaffAlert` for the assigned salesperson (or all Sales/Admin when unassigned), once per workspace, kind and day; the nav shows the unread count.
- **Support access** (spec 8): staff request read-only (1–72 h) or import-only (7 days) access; the owner gets an email and a bell alert and approves or declines in Settings → Support access; while it runs everyone sees a banner, the grant and every support-view visit are in the workspace audit log, and the owner gets an email when it starts. The read-only support view masks salary, bank and PAN for Sales and Accounts (`lib/console/mask.ts`).
- **Importer framework** (`modules/imports`): template (CSV) → upload (CSV or XLSX; `lib/xlsx-read.ts`, no new dependency) → preview with row errors and a Free seat warning → confirm (the file is checked again; seats enforced through `assertCapacity`/`entitlements`) → `ImportBatch` (created ids, plus the previous state of changed attendance days and overrides) → undo within 7 days (only that batch's ids in that workspace; pending invites only) → history. Importers: team members/invites with role, title and department; Muster employees and attendance and Orbit leads (the existing importers now share their core and record a batch, also from their own pages); Work projects and tasks; Orbit contacts and companies; Folio clients (GSTIN/PAN/state checks) and items. Self-serve in Settings → Import for every workspace (each importer checks its product and permission; undo needs the same right, read from the stored batch). Staff path in the Console only after the owner accepted the DPA (`/legal/dpa`, version and time on the Org) and approved 7 days of import-only access; checked again on every call; the workspace history says "Imported by the Flowbit team".
- **Handover checklist:** data, roles, PM invited, kickoff, training, live, ticked in the Console; the customer sees a "Setup guide" card on Home (owners and admins, while a handover runs or for the first 30 days, until "Go live"), with help video links from Console settings (placeholders `#` hidden until set).
- **Migration:** `scripts/migrate-staff.ts` (dry run by default; `--apply`, `--founder=`) turns every `isPlatformAdmin` user and every `PLATFORM_ADMIN_EMAILS` address into an Admin, keeping their password hash or printing a setup link, then unsets `isPlatformAdmin`. `setup-prod` creates the first owner as the founding Admin; the seed makes the demo owner a founder Admin.
- Checks on 8 Oct: `tsc` 0 errors, 1,259 Vitest tests in 137 files pass (1,158 before), ESLint 0 errors (warnings unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. A DB smoke run on `flowbit_v2dev` (staff-run import context, preview writes nothing, confirm, batches recorded, Free seat limit refused with nothing written and a Sales alert raised, team invites with departments, undo isolation and no double undo, invites removed on undo, nightly health job Green, one Upgrade alert per day, migration dry run then `--apply`) passed and the database was dropped. The `flowbit` demo database was not touched.
- **Not in this step:** Billing and the WhatsApp inbox (placeholders); prices, limits and templates are stored in `ConsoleSettings` but the product still reads `lib/plans`/`lib/account-types` (pure, used in ~50 places); read-write support access (only read-only and import-only); the 5-a-week cap on free staff setups is a stored number, not enforced; Muster salary structures and leave balances import; the importer UI on Muster's and Orbit's own pages is unchanged (Settings → Import offers all of them); announcements banner; browser click-through and the 375 px check (no browser in this run).

## v2 step 6 (mobile) (built 8 Oct 2026)

`docs/V2-PLAN.md` row 6 and `docs/V2-AUDIT.md` §4: the mobile pass. Every change is scoped to phones, touch or coarse pointers; desktop (hover + mouse, 640 px and up) renders as before.

- **Touch variants** (`globals.css`): `touch:` = `@media (hover: none)`, `coarse:` = `@media (pointer: coarse)`, and a `hit-area` utility (an invisible centred `::before` of at least 44 x 44 px on coarse pointers, so the button looks the same).
- **Kanban** (`ui/kanban.tsx`; tasks, deals, leads): `PointerSensor` → `MouseSensor` (6 px) + `TouchSensor` (200 ms press, 8 px tolerance). Cards lost `touch-none`, so a finger scrolls the board both ways and a press-and-hold picks a card up; no text selection or iOS link preview on the hold. `noDrag` (mouse, touch and pointer down) replaces the old `onPointerDown` stop on card links and the task card menu.
- **Hover-only controls:** every `opacity-0 group-hover:opacity-100` (task card menu, task calendar add, checklist remove, folder actions, folder reorder handle, whiteboard card tools, Orbit activity delete) and the dimmed ones (space and project menus, task list row actions, milestones) are fully visible on `touch:`. The folder reorder handle also shows on keyboard focus now. Task cards make room for the always-visible menu on touch.
- **Agenda views:** `lib/agenda.ts` `groupByDay` (tested) and `ui/agenda-list.tsx`. Below 640 px the task calendar lists tasks by due day (add button per day), and large `MonthCalendar`s (leave calendar, a person's attendance tab) list the marked days with their label; the leave calendar shows who is off as chips. Below 768 px the meetings week view is a day-by-day list (every day, meetings by start time).
- **Timesheet:** below 768 px the 760 px grid becomes a day form (`modules/work/time/day-form.ts`, tested): 7 day chips with totals, one 44 px time field per row (16 px text, no iOS zoom), the same save-on-blur action and future-day rule. Time approvals' day breakdown is 4 columns on phones, 7 from 640 px.
- **Shell:** notification popover `w-[min(360px,calc(100vw-24px))]`. Quick check-in in the top bar below 1024 px (`shell/quick-check-in.tsx`): one tap to check in, check out or resume, with a state dot; it and the side-panel card share `shell/use-punch.ts` (same `punchAction`), and the quick button refreshes the shell so the drawer card agrees. `viewportFit: 'cover'`; safe-area padding on the top bar, main area, bottom bar and the phone toast offset. Whiteboard height subtracts the phone bars.
- **Dialogs:** below 640 px every `Dialog` (and so every `ConfirmDialog`) is a bottom sheet: full width, rounded top, at most 90 dvh with the body scrolling, home-bar padding, slide-up animation. Changed once in `ui/dialog.tsx`.
- **Touch targets:** `IconButton` has `hit-area` (all ~79 icon buttons), as do the dialog and sheet close buttons, the folder handle, task calendar add, reaction buttons, plan-picker steppers and the approvals expand chevron. Attendance register cells grow to 36 x 40 px on coarse pointers.
- **v2 screens** (Settings → Messages, Notifications, Automations, Import, Export, Support access; Profile → My alerts, Briefs; `/d/[token]`; the Console): reviewed by code. Their tables already scroll inside their cards, grids stack below 640 px, the notification grid has its own phone layout and the Console nav scrolls sideways below 1024 px; no changes needed.
- **PWA:** `app/manifest.ts` (Flowbit, standalone, `start_url` `/app`, `#171717`), icons from `public/brand/flowbit-mark-gradient.svg` rendered with `sharp`: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (indigo `#210B5D` tile, mark inside the safe zone), and `app/apple-icon.png` (180 px). `appleWebApp` metadata. **No service worker:** nothing offline, so no authenticated page or API response is ever cached on a device.
- Checks on 8 Oct: `tsc` 0 errors, 1,273 Vitest tests in 139 files pass (1,259 before), ESLint 0 errors (warnings unchanged), `NEXT_DIST_DIR=.next-deploy npm run build` passes. The build served on port 4300 with `MONGODB_DB=flowbit_v2dev` returned the manifest and the `viewport-fit=cover`, manifest and apple-touch-icon tags; the server was stopped and `flowbit_v2dev` dropped. The `flowbit` demo database and port 4100 were not touched.
- **Not in this step:** the 375 px screenshots (the headless browser run was not permitted in this session, so `docs/design/mobile-v2/` is empty; layouts were checked by code review); a service worker and offline page; push notifications; swipe gestures; a native share target.

## v2 step 7 (Console billing and WhatsApp A) (built 8 Oct 2026)

`docs/V2-PLAN.md` row 7 and `docs/specs/console.md` §10–11. Flowbit now bills its own customers before they pay, takes the money several ways, and can reach owners on WhatsApp from its own number.

### Part A: Flowbit's own billing (`modules/billing`)

**Invoice series.** Tax invoices are numbered per supplier GSTIN (`modules/billing/series.ts`):
- The counter is `fb-invoice:<GSTIN>:<FY>`, printed `FB/<FY>/0001`.
- Without a GSTIN the old `fb-invoice:<FY>` counter stays in use, and the first GSTIN series of a year continues from it, so no number is printed twice and old numbers keep their meaning.
- A new GSTIN needs a new `FLOWBIT_INVOICE_PREFIX`.
- Each invoice stores its `seriesKey`.
- Due bills use `FBB/<FY>/…` and credit notes `FBC/<FY>/…`. Every number is at most 16 characters, as GST requires.

**Due bills.** `SubscriptionInvoice` has the status `due`, with a due date, the plan it buys, a Razorpay payment link (Flowbit's keys, amount computed on the server) and a public link `/bill/<signed token>` with its PDF.
- Sales and Accounts create a bill or a proforma from the Console account page (**Create bill**).
- It is emailed with the PDF, the link and a Pay button, and sent on WhatsApp (`bill_with_pdf`).
- On payment (`payment_link.paid` on the existing Flowbit webhook, or a verified bank transfer) the same document becomes the GST tax invoice: the tax number, the payment date, the plan applied in the same transaction, and the receipt by email and WhatsApp.
- The time-of-supply question stays open in CA-QUESTIONS Q11.
- Idempotency comes from the payment id (`receipts.paymentId` is unique) and the BillingEvent. A second payment for a paid or cancelled bill raises a Console alert.

**Autopay** (Razorpay Subscriptions, UPI Autopay / e-mandate):
- Settings → Billing → **Set up autopay** creates the plan and subscription (first debit at renewal) and opens the mandate link.
- Webhooks move a state machine (`autopay-state.ts`): created → authenticated → active ⇄ pending → halted / cancelled.
- `subscription.halted` now keeps the 7-day grace from the first failure instead of expiring at once.
- The pre-debit notice goes 24–48 h before each debit, and yearly debits above ₹15,000 get the approval (AFA) note.

**Offline payments.** UTR, amount, date, mode and a screenshot, from Settings → Billing (customer) or the Console (Accounts).
- Activation is provisional for 7 days (`subscription.provisionalUntil`, read by `entitlements()` through `accessLevel`).
- Duplicate UTRs are refused: the UTR is normalised and has a unique key.
- Maker-checker: the staff member who recorded a payment cannot verify or reject it.
- Verifying applies the money (tax invoice, unlock); rejecting or 7 days without verification ends provisional access.

**TDS.** A bill can carry "customer deducts 2%": the link then asks for the total less 2% of the taxable value.
- A bill is settled when at least 98% has arrived and TDS is declared.
- The certificate status (awaited, received, matched in 26AS, mismatch) and the Form 16A upload are tracked on Console → Billing → TDS.

**Credit notes and refunds.**
- `FlowbitCreditNote` is GST-split and kept on workspace deletion, like invoices.
- A refund goes only to the original Razorpay payment (mocked client).
- Monthly downgrades are refused, as they apply from the next cycle. Yearly plans are refused except a billing error or a duplicate payment.

**Reminders.** `/api/cron/billing` runs daily (03:45 UTC, catch-up 06:45). It sends due-bill and renewal reminders 15, 7, 3 and 1 days before, on the day, and 1, 3 and 7 after: email first, then WhatsApp where opted in.
- It also sends the pre-debit notice and expires unverified offline payments.
- Internal, Test and Comped accounts are excluded. Free and Trial endings stay with the lifecycle reminders.
- After the last reminder the lifecycle (read-only, blocked) takes over.

**Screens.**
- **Settings → Billing** (new, open even when blocked): due bills with Pay now, invoices to download, autopay status (set up or cancel), "Paid offline?" (UTR and screenshot), and the transfers reported.
- **Console → Billing** replaces the placeholder: due bills and links, Verify payments, Overdue, Invoices (credit note and refund), TDS and Credit notes.
- New staff permissions: `bill.create` (Sales, Accounts), `payment.record`, `payment.verify`, `credit_note.issue` and `tds.manage` (Accounts), and `inbox.reply` (all). Every money action writes a per-staff audit row.

### Part B: WhatsApp A (`modules/whatsapp`)

**The Interakt adapter.** It replaces the stub for the platform sender: `POST https://api.interakt.ai/v1/public/message/` with Basic auth.
- Template sends carry `bodyValues`, a PDF document header with `fileName`, URL button suffixes and `callbackData` (our Message id).
- There are two senders: verification codes go from the OTP account (`INTERAKT_OTP_API_KEY`), everything else from the messages account (`INTERAKT_API_KEY`).
- Without a key, or after a permanent failure, the pipeline falls back to email where the message allows it.
- Each send records its cost in paise from the Console rate card (Interakt Growth: utility ₹0.15, authentication ₹0.128).

**Webhook** `/api/webhooks/interakt`. Interakt documents no signature we could confirm, so it is authenticated by `?token=<INTERAKT_WEBHOOK_SECRET>`; an HMAC-SHA256 `interakt-signature` header is also accepted.
- Sent, delivered, read and failed update `Message` (forward only).
- Inbound messages go to the Console inbox.
- **STOP** suppresses the number at once on WhatsApp, for Flowbit and for every workspace of the people using it, and turns their opt-in off.

**Console → Messages** replaces the placeholder:
- an inbox list and thread view;
- assignment to staff;
- a reply box that allows free text only inside 24 h of the person's last message (otherwise it says a template is needed);
- an auto-reply pointing to email, at most once a day, while a conversation is unassigned;
- a delivery log of billing messages with their cost.

**Recipients.** Only active owners and admins, with a number verified by a WhatsApp OTP and an opt-in (Settings → Profile → WhatsApp from Flowbit). Customers' employees never get one.

**Templates.**
- The registry (name, language, variable order) and the rate card are in `ConsoleSettings.whatsapp`, editable in Console → Settings.
- The text to paste into Interakt is in **`docs/WHATSAPP-TEMPLATES.md`**: five utility templates and one authentication template. Marketing goes by email only.
- The `WhatsAppProvider` interface stays ready for WhatsApp B (out of scope).

### Checks on 8 Oct

- `tsc`: 0 errors.
- Vitest: 1,329 tests in 141 files pass (1,273 before; the new tests are in `modules/billing/billing.test.ts` and `modules/whatsapp/whatsapp.test.ts`).
- ESLint: 0 errors, no warnings in the new files.
- `NEXT_DIST_DIR=.next-deploy npm run build` passes.
- A scratch Vitest smoke run against MongoDB `flowbit_v2dev` (Razorpay and Interakt mocked, no network) covered:
  - bill → link webhook twice → one tax invoice `FB/2026-27/0004`, continuing a legacy counter at 3 under the GSTIN series, and the workspace unlocked;
  - a yearly TDS proforma → offline record → duplicate UTR refused → the recorder's verification refused → the second staff member's verification → paid;
  - a credit note, with the refund refused for an offline invoice;
  - autopay setup and `subscription.authenticated`;
  - the billing cron, run twice;
  - inbound STOP, suppressed for Flowbit and both workspaces.

  `flowbit_v2dev` was dropped afterwards. The `flowbit` demo database and port 4100 were not touched.

### Not in this step

- Real Razorpay and Interakt calls, which wait on the keys, the approved templates and Meta verification.
- A Razorpay refund status webhook: refunds show the status Razorpay returned at the time.
- Bank-statement import: offline verification is manual.
- ~~The 50% first-year yearly discount~~: built in fix round B (11 Oct), see "First-year yearly discount" below.
- Custom-plan bills from the Console: "Current plan" or Suite; Admin sets other shapes with Change plan first.
- WhatsApp B.

## v2 step 8 (WhatsApp B and the wallet) (built 8 Oct 2026)

`docs/V2-PLAN.md` row 8 and `docs/specs/notifications-v2.md` §0b, §2.2–2.5 and §5. A workspace can now send from **its own** WhatsApp number, pay for messages from a wallet, and answer customers in its own inbox. The Interakt White Label / partner deal is not signed yet, so the sender has two modes behind one `WhatsAppProvider` interface (`modules/whatsapp/provider.ts`):

- **Bring your own Interakt account** (works today): the workspace pastes its own Interakt API key (Growth plan or higher; Starter has no API). Flowbit sends with the same adapter as WhatsApp A. Interakt bills the workspace for Meta; Flowbit's wallet charges the platform fee from Console → Settings (₹0 by default).
- **Flowbit-managed** (later): the adapter is a stub that answers "not available yet", so every send falls back to email. The wallet would charge the full rate card. The screen shows it as "Coming soon"; `MANAGED_MODE_AVAILABLE` flips it with the real adapter.

### Connect panel (Settings → Integrations → WhatsApp, `org.manage`)

- Mode cards (BYO active, managed "Coming soon"). BYO form: API key and webhook secret (sealed with `secret-box` under `APP_ENCRYPTION_KEY`, last 4 shown, blank keeps), display name and number (normalised to E.164).
- **Webhook** `/api/webhooks/whatsapp/<random key>?token=<the workspace's secret>` (or an HMAC `interakt-signature`). The key picks the workspace; every lookup after that is scoped to it. Ticks, inbound and STOP reuse the step 7 parsing.
- **Test connection** sends any text template to a number the admin types.
- **Template mapping** per workspace (name, language, category, variable order) for the Flowbit pack. The text to paste, English and Hindi, is in **`docs/WHATSAPP-TEMPLATES-CUSTOMER.md`**: invoice, quote, credit note, receipt/thank-you, reminders before/on/after the due date, statement, task alert, approval pending, morning brief, meeting reminder, leave decision, payslip ready (no amounts), and the hello/follow-up (marketing).
- **Status:** last 30 days sent/delivered/read/failed/held, Flowbit's charge, an estimate of Interakt's bill, the last failed sends, and **Disconnect** (wipes both secrets and retires the webhook URL; the mapping is kept).

### Wallet (`modules/wallet`, provider-agnostic)

- `Wallet` (one per workspace) and an append-only `WalletLedger`: recharge, bonus, promo, debit (linked to the message), free (allowance), refund, expiry. Integer paise only.
- **Two balances**: promo (bonus and free credit, no GST) is spent first, then paid.
- **Atomic debit:** one guarded update (the filter checks the balance and both caps, an update pipeline takes promo first) in the same transaction as the ledger row, whose key is unique per workspace (`debit:<message>:<attempt>`). Concurrent sends cannot overdraw and a repeated key cannot charge twice. A refused or failed send (including a later "failed" tick) is refunded once (`refund:<debit row>`).
- **Free allowance** per plan in Console → Settings (Free 0, Trial 0, Custom 300, Suite 1,000 a month by default), used before the wallet.
- **Caps and alerts:** daily and monthly spend caps; a low-balance alert (₹200 by default) and an empty alert, once each until the next recharge, to everyone with `billing.manage`.
- **At zero or at a cap:** the message falls back to email when it carries one (automations, briefs); otherwise it is held, tried again every 30 minutes, and failed after 24 hours with the reason (`messaging/deliver.ts`).
- **Expiry:** paid credit expires 12 months after its recharge, oldest spent first; `/api/cron/billing` runs it daily, idempotent per recharge.
- **Recharge** through Flowbit's Razorpay: packs ₹500, ₹1,000, ₹2,500 (+5%), ₹5,000 (+10%), ₹10,000 (+12%) or a custom amount from ₹500; GST 18% on the credit only, rounded to the rupee as the invoice rounds. The link's notes carry the credit; the existing Flowbit webhook (`payment_link.paid`) credits the wallet and issues a **GST tax invoice** in the `FB/` series (`issueInvoice`, kind `wallet_recharge`) in one transaction, idempotent per payment id; a payment that does not match its quote is flagged to Accounts, not credited. The bonus is a ₹0 line. SAC: `FLOWBIT_WALLET_SAC` (falls back to `FLOWBIT_SAC`; **CA to confirm**, CA-QUESTIONS Q1). Locally without Razorpay keys, a recharge is simulated.
- **No cash-out, no transfers:** there is no code path for either. Terms are shown on the wallet page.
- **Auto top-up:** the setting is stored and shown, but nothing is charged automatically. TODO: a wallet autopay mandate, like step 7's `modules/billing/autopay`.
- **Screens:** Settings → Billing gets tabs; **WhatsApp wallet** shows the balances, free messages left, spend today/this month, recharge, caps, auto top-up, the ledger (with invoice PDFs) and the credit terms. **Console → account → WhatsApp wallet** shows the connection, balances and ledger; Admin (new `wallet.grant` permission) grants promo credit with a reason, written to the ledger and both audit logs.

### Sending (everything through `enqueue`)

`enqueue` gained `sender: 'workspace'`; the WhatsApp channel routes those messages to the workspace's number and wallet, and everything else to Flowbit's number as before. Suppression (STOP), quiet hours (alerts), cost and fallback all apply.

- **Send on WhatsApp** next to Email on invoices, quotes/proformas, credit notes, receipts and statements: the number prefilled from the billing contacts (WhatsApp, then phone), editable and normalised (+91 default), the template preview with values, the PDF as the document header and the public link as the button, and the cost. Logged in the client's message log and on the document timeline (sent, delivered, read ticks).
- **Collections reminder dialog:** when connected, WhatsApp sends the before/on/overdue template from the workspace number; otherwise the wa.me flow stays.
- **Automatic reminders:** the Folio run sends the WhatsApp channel from the workspace number when connected (same once-per-offset slot as email), else queues it for wa.me as before.
- **Automations:** a WhatsApp action really sends when connected, with the email copy as fallback. Recipes mapped to templates: payment thank-you and part payment (receipt), invoice issued, quote follow-up/expiring, monthly statement. Other recipes go by email.
- **Orbit:** the WhatsApp button on a contact or lead sends the hello/follow-up template when connected (logged as a DM activity), otherwise opens wa.me.
- **Team alerts:** the WhatsApp column of both notification grids turns on once the workspace is connected (personal cells also need a verified, opted-in number, reusing step 7's profile OTP). Approvals, decisions, meetings, tasks and the rest map to their templates. **Payslips:** only "payslip ready" with no amounts and no PDF; other payroll events carry no figures; security and Flowbit-account notices never go from a workspace number. The morning brief's WhatsApp copy uses the short brief template.

### Inbox (`/app/whatsapp`, nav link only when connected)

- Inbound messages land in a per-workspace `WaThread`, matched by phone to a client (or its billing contact), a lead or a member. An unknown number becomes an **Orbit lead with source WhatsApp** (the source is added to the workspace's list when missing).
- Assign to a member, open/assigned to me/closed views, unread counts, and a bell alert to the assignee (or owners and admins).
- Free replies only inside 24 hours of the person's last message; after that a "Send follow-up template" button.
- **STOP** suppresses the number for that workspace only (Flowbit's own number and other workspaces are untouched) and confirms once; **START** lifts it.

### Checks on 8 Oct

- `tsc`: 0 errors.
- Vitest: 1,370 tests in 143 files pass (1,329 in 141 before; new tests in `modules/wallet/wallet.test.ts` and `modules/whatsapp/whatsapp-b.test.ts`, updated `messaging/preferences.test.ts` and `lib/console/roles.test.ts`). Interakt and Razorpay are mocked; nothing reaches the network.
- ESLint: 0 errors (23 warnings, none in the new files).
- `NEXT_DIST_DIR=.next-deploy npm run build` passes; `tsconfig.json` reverted afterwards.
- A scratch Vitest smoke run against MongoDB `flowbit_v2dev` (fetch mocked) covered: 50 concurrent ₹0.25 debits against ₹5 → exactly 20 charged, balance 0; promo first; the daily cap; a repeated key charging once; refund once; the free allowance taken atomically (3 of 5) and given back; a recharge webhook delivered twice at once → one credit, one bonus, one `FB/` tax invoice (₹2,500 + ₹450 IGST, SAC from env), a mismatched amount flagged; a promo grant; expiry of a 13-month-old lot (only its unspent ₹300); keys sealed at rest; a BYO send with the workspace's own key, charged its fee, then refunded on a "failed" tick from its own webhook while the other workspace's webhook could not touch it; an inbound from a known client matched, the same number in another workspace made a WhatsApp lead (source added), STOP suppressed only that workspace and blocked the next send; disconnect wiped both secrets and retired the hook. `flowbit_v2dev` was dropped afterwards; the `flowbit` demo database and port 4100 were not touched.

### Assumptions (simplest reading of the spec)

- One opt-in covers WhatsApp from Flowbit (owners/admins) and team alerts from the workspace's number; Profile shows the card to anyone once the workspace is connected.
- Promo and bonus credit do not expire; only paid credit does (12 months, FIFO).
- Recharge invoices share the `FB/` series with subscriptions (CA Q12) and show the bonus as a ₹0 line (CA Q3).
- The free allowance is keyed by account type and plan (Free, Trial, Custom, Suite), not per workspace; there is no per-workspace override yet.
- Recipes keep email as their default channel; a workspace switches a recipe to WhatsApp in the editor.
- Inbox replies need `clients.write`, `activities.write` or `collections.write`; reading needs `clients.read`.
- International numbers are accepted with a + and a known country code (Gulf, South Asia, SEA, UK, EU, US, AU); everything else is read as Indian.

### Not in this step

- Flowbit-managed mode (Interakt partner deal), Embedded Signup and coexistence, template sync from Meta, pay inside WhatsApp, quick-reply actions (§2.5), canned replies and attaching documents from the inbox.
- A real auto top-up (needs a wallet autopay mandate), a monthly wallet statement, a per-workspace allowance override in the Console, a per-automation cap.
- Brief editor: the WhatsApp toggle on briefs stays off in the UI (sending is wired).
- Browser click-through and the 375 px check (no browser in this run).

## v2 step 9a (built 8 Oct 2026)

`docs/V2-PLAN.md` row 9 (except the Console sales and finance reports) and `docs/specs/notifications-v2.md` §0b.14, 0b.17, 0b.18, 0b.20, §2.4, §2.5, the §3.2 Sales, People and Business compliance tables, the §4 Compliance brief section and the §5 bell and holiday items.

### Approve from email and WhatsApp (`modules/actionlinks`)

- **Signed one-time links** (`/a/<token>`): 18 random bytes plus an HMAC under `APP_SECRET`, checked timing-safe before any lookup; only a SHA-256 of the key is stored (`ActionToken`, gone 30 days after expiry). Each link is bound to the approver's member and user (and, on WhatsApp, their number and workspace), lives 7 days, and is claimed atomically then spent: a used, expired, foreign or busy link fails safely with a plain message.
- **Approval emails** (leave, timesheet, claim, attendance correction, bank change) carry Approve / Reject (bank change: Verify) buttons; task alerts carry Mark done / Snooze 1 day. Digest and quiet-hours copies keep no buttons.
- **The landing page decides nothing**: it shows the request and asks to confirm, so mail scanners cannot act. Confirming runs the app's own decision function (now in `leave/decide.ts`, `attendance/correction-decide.ts`, `claims/decide.ts`, `work/time/decide.ts`, `payroll/bank-verify.ts`) through `runChecked()`, the same gate as `action()`: permission, product, read-only, approval stage, own-record rule, month lock. A refusal releases the link and says why. A rejection asks for the note the app asks for. A signed-in viewer must be the person the link was sent to.
- **WhatsApp quick replies**: the pack templates gained quick-reply buttons (Interakt `buttonPayload`, payload `fb1:<action>:<token>`): Approve / Reject on `fb_approval_pending`, Mark done / Snooze on the new `fb_task_due`, Accept on `fb_quote_share`, "I've paid" on the invoice and reminder templates. The workspace webhook resolves a press to the same action; Reject asks for the reason in the next message; "I've paid" asks for the UTR and runs the online page's UTR flow (verify task + owner alert); Accept accepts the quote as the public page does. Both template docs list the buttons.

### Employee WhatsApp bot (`modules/whatsapp/bot`)

- Off until an admin turns it on (Settings → Integrations → WhatsApp, BYO mode only). It answers only active members whose number is verified and opted in; anyone else's message stays an inbox chat.
- English and Hindi (Devanagari and Hinglish) keywords or menu numbers: menu, check in (asks for a location share; the punch stores `geo` and `source: 'whatsapp'` on the attendance day), check out, leave balance, a guided leave application (type → dates → reason → confirm, then the app's own `requestLeave`), and payslip (`/p/<token>`: no amount anywhere, the PDF opens only after a 6-digit code sent to the work email, for 15 minutes). `exit` stops a step; `stop` and `cancel` still opt out.

### Lead sources (Orbit → Settings → Lead capture, `modules/orbit/capture`)

- **Website form**: `/api/public/leads/<random key>` (HTML form or the `embed.js` script), origin allow-list (Origin or Referer, `*.domain` allowed), honeypot field, 10 posts per IP per 15 minutes and 300 per form per hour, UTM fields and tags stored on the lead.
- **Lead webhook**: `/api/webhooks/leads/<random key>` with a sealed token (`?token=`, header or HMAC): flat Zapier-style JSON, Meta lead ads `field_data`, JustDial's lead push. Repeats with the same lead id are acknowledged once.
- **IndiaMART (beta)**: CRM key sealed with `secret-box`; `/api/cron/lead-sources` every 15 minutes pulls at most every 5 minutes per key (IndiaMART's limit), dedupes by `UNIQUE_QUERY_ID` (unique index on `externalSource` + `externalId`). Endpoint and fields checked against IndiaMART's public help page on 8 Oct; verify with a real key. `INDIAMART_API_URL` can point it elsewhere.
- **Click-to-WhatsApp**: an unknown number whose message carries Meta's ad `referral` becomes a lead with source "WhatsApp ad" and the ad headline; other unknown numbers keep source WhatsApp. Both now go through capture.
- **Assignment and alert**: a fixed owner or round-robin over a pool (atomic cursor; inactive people skipped); the assignee is alerted at once on the channels their settings choose, and `lead.created` is raised for automations.

### Automations

- A trigger catalog (`automations/catalog.ts`) holds every event and time source with its variables, condition fields, recipients, product and alert group; recipes, the editor and the new validator read it.
- **Sales**: new lead (alert + welcome email to the lead), not contacted in 2 h (nudge) and 24 h (sales managers), deal idle 7 days, deal won (team + owners). **People**: attendance not marked by 10:30 and forgot to check out at 19:30 (working days, not on leave), birthday and work anniversary (in-app and email; WhatsApp only when the person turns it on themselves, as a marketing template), new joiner welcome the day before (personal email first) plus manager alert, weekly joining-document reminder until complete, probation ending in 15 days (on), document expiring in 30 days (on), payslip-ready note (no amounts). **Compliance**: due date in 3 days to accounts.
- Messages can now go to clients, leads and employees; alerts to HR, sales managers, accounts and the whole team as well.
- **New automation**: a builder for rules from scratch (event, before/after a date, or a schedule; conditions; message, alert or follow-up task), validated the same way on both sides; custom rules can be deleted.
- New fields: `Employee.probationEndDate` (people form) and `EmployeeDocument.expiresOn` (file-a-document dialog).

### Compliance calendar (Settings → Compliance calendar, `modules/compliance`)

- FY 2026-27 rules as data: GSTR-1 (11th, QRMP 13th after the quarter), GSTR-3B (20th, QRMP 22nd/24th by state), PMT-06 (25th), TDS deposit (7th, March 30 April), TDS returns (31 Jul, 31 Oct, 31 Jan, 31 May), PF and ESI (15th), professional tax (state default day, editable, or off), advance tax (15 Jun, Sep, Dec, Mar).
- Per workspace: filer type, state, which items apply, the PT day, and per-occurrence overrides when the government extends a date (marked "Extended"). A verify-before-relying note on the page and in every reminder. The brief gains "Statutory dates in the next 7 days".

### Bell, holidays, branding, inbox

- **Bell**: All / Unread and grouping by object ("3 updates on 'Homepage copy'"); opening a group marks it read. Mark all read stays.
- **Leave days and holidays**: a non-urgent alert's email and WhatsApp copy wait until 09:00 on the person's first working day back when they are on approved leave or it is a company holiday; the bell shows it at once; security mail always goes.
- **Branded client email**: invoices, quotes, statements, reminders and automated client/lead/employee messages show the workspace's logo (a public URL keyed by a random value), name and primary colour.
- **Inbox**: saved replies (Settings → Integrations → WhatsApp, insert from the reply box) and "Send document": an open invoice or sent quote of the matched client, as its approved template with the PDF and the public link.

### Checks on 8 Oct

- `tsc`: 0 errors.
- Vitest: 1,454 tests in 152 files pass (1,395 in 146 before). New: `actionlinks/actionlinks.test.ts`, `whatsapp/bot/bot.test.ts`, `orbit/capture/capture.test.ts`, `automations/recipes-v9.test.ts`, `compliance/compliance.test.ts`, `messaging/away-bell.test.ts`. Interakt, IndiaMART and Resend are never called.
- ESLint: 0 errors (23 warnings, unchanged).
- `NEXT_DIST_DIR=.next-deploy npm run build` passes; `.next-deploy` removed and `tsconfig.json` reverted.
- A scratch Vitest smoke run against `flowbit_v2dev` on a separate, temporary local MongoDB (port 27027; the usual server was not running) covered: an action link claimed once by 10 parallel claims, a refused decision releasing it, three parallel presses running once, a non-member refused; round-robin across two people, sources added, UTM stored, an IndiaMART repeat dropped, a JustDial push stored; a compliance extension found by the 3-days-before window; an alert to someone on approved leave held until their return while a colleague's went at once; the public form refusing a foreign origin, swallowing a honeypot post and storing a real one with CORS for the listed site. The database and the temporary server's files were deleted. The `flowbit` demo database and port 4100 were not touched.

### Assumptions (simplest reading of the spec)

- Bank changes have no "reject" in the app, so their link offers Verify only. Comp-off requests carry no buttons (not in the list).
- "Snooze 1 day" moves the task's due date one day past today (or past its current due date), through the same task edit rules.
- WhatsApp quick replies reuse the existing pack template names; a workspace that created them before step 9a adds the buttons in Interakt (a press without a payload gets "open Flowbit").
- Payslip links open the stored payslip PDF after an email code; they are reusable until they expire (7 days), each opening needing a new code.
- The bot treats a location shared without a question as a check-in; check-out needs no location.
- "Team post" for a won deal is an in-app/email alert to every active member, not a Work post.
- The new-lead built-in alert is skipped while the "New lead" recipe is on (the recipe alerts instead), so nobody is alerted twice.
- The compliance page lives under Settings (any workspace, not only Folio); owners, admins and holders of `folio.settings` can open and edit it; reminders go to accounts (`folio.settings`, which includes owners).
- Professional tax defaults exist for a few states (KA, MH, WB, TS, AP, GJ, MP, OD, AS) and are editable; other states start untracked.

### Not in this step

- Console sales and finance reports (row 9, built in step 9b).
- Hindi wording for recipes and a selfie on bot check-in; geofence checks on the shared location.
- Interakt's button-press webhook field and `buttonPayload` request shape are read defensively but unverified against a live account (beta); IndiaMART likewise.
- Browser click-through and the 375 px check (no browser in this run).

## v2 step 9b (built 8 Oct 2026)

The last v2 build step: `docs/V2-PLAN.md` row 9 (Console reports) and row 10 (DPDP), the Console settings read-through, the review leftovers of `docs/V2-REVIEW.md`, and Hindi wording for automations.

### Console reports (Console → Reports, `modules/console/reports`)

- **Who sees what:** Admin sees every section; Sales sees the funnel and only its own Team row; Accounts sees the money (`sectionsFor`, new permission `reports.view` for all roles). The CSV route checks the same rules.
- **Funnel:** signups in the last 30 days, 90 days, 12 months or all time → on Free or Trial (with the split) → in setup (a handover or an import) → habit formed (Green health) → paid. Each step counts accounts that reached it or a later one. Shows the rate from the previous step and from signup, where unpaid accounts stall, and the longest-stalled live accounts.
- **Money:** MRR and ARR (from the plans, as on Home); new, expansion, contraction and churned MRR for a month, worked out from paid plan invoices (yearly ÷ 12, with the 7-day payment grace so a late renewal is not churn); renewals due in 30 days (autopay marked); overdue bills (balance) and plans past their renewal date; collections by month (plans and wallet recharges, GST included, test payments left out); TDS certificates pending; wallet recharges and the message margin (paid credit used, less refunds, less the provider cost in Flowbit-managed mode).
- **Team:** per salesperson, accounts held by type, Green accounts, signups and first payments in the period, conversion and MRR.
- **Marketing:** signups by first-touch UTM source, medium or campaign, with paid count, conversion and MRR.
- **UTM capture (left over from step 1):** the proxy keeps the first landing's `utm_*` tags and an outside referrer's host for 30 days (`fb_utm`, `lib/utm`); creating the workspace stores them on `Org.signupUtm` and on the house Orbit lead.
- **Exclusions and export:** Internal and Test workspaces are dropped when the data is loaded, so no section, total or CSV can include them. Each section downloads as a formula-safe CSV (`/api/console/reports/<section>`, audited).

### Console settings read-through (`lib/plan-config`, `modules/console/settings-query`)

- The settings document is read at most once per request (React `cache`; a cron reads it once and passes it on) and falls back to the `lib/plans` defaults when missing, out of range or unreadable.
- **Prices:** quotes, checkouts, plan changes, autopay amounts and new due bills price at the Console's prices. Subscriptions, scheduled changes, pending checkouts and bills store the unit prices they were sold at (`unitPrices`), so renewals keep the subscriber's price and an issued invoice never changes. The plan picker shows the Console's prices.
- **Limits:** Free seats in `entitlements()` and every capacity check (invites, employees, imports, the Console list), signup's Free-or-Trial choice and the "stay on Free" check; Free months and trial days for new workspaces and trial starts; the Sales trial extension maximum.
- **Weekly setup cap (console spec 9), enforced:** starting a free setup (or ticking its first step) needs a yearly paid or comped plan and a free slot in the IST week (Monday 00:00); Internal and Test are exempt; a setup already running is never refused.
- **Templates:** the first line of the trial-ending, Free-ending, welcome and due-bill emails (`{days}`, `{date}`, `{name}`, `{number}`, `{amount}`); an unknown placeholder stays visible.
- **WhatsApp:** the wallet rates and free allowance were already read; Admins can now set one workspace's free messages a month (Console → account → WhatsApp wallet → Free messages; blank = the plan's, 0 = none; audited).

### Review leftovers (`docs/V2-REVIEW.md`)

- **T3:** the export streams every collection through a cursor in parts of 5,000 rows or about 8 MB, holding one part at a time, and leaves out Message `html`/`text`.
- **C9:** Sales' one trial extension is a conditional `$inc` claimed before the trial moves.
- **P4:** the "Paid online" DocEvent is an upsert on the payment id (partial unique index).
- **M-L1:** a verified offline payment that cannot be applied is flagged with a note and a Console alert.
- **M-L4:** credit-note prefixes follow the invoice prefix of the GSTIN series and continue the pre-GSTIN counter.
- **M-L5:** a partial unique index allows one due bill per workspace.
- **P2 (rest):** inbound WhatsApp ids are claimed in `WaInboundClaim` (unique per scope) before anything is stored.
- **M-M3 (rest):** after a part payment the bill's Razorpay link is re-created for the balance and the old one cancelled; every screen and reminder shows the balance.
- **C6:** `migrate-staff` is founder-only by default (`--all` adds others), never carries a password, and Console → Staff → "Send setup links" emails the rest.
- **M-M1 (TDS 98% rule):** unchanged, as decided; the suggested alternative is in the owner checklist.

### DPDP (`modules/privacy`, Settings → Privacy, Console → Incidents)

- **A person's data:** export (JSON) or erase a client contact, lead or member from the contact or lead page, or find them by email or phone in Settings → Privacy (owners and admins). Export covers the record, messages sent to them (no bodies), consent rows, opt-outs, WhatsApp threads and messages, bot sessions, lead activities and stage history, deals, and a member's alerts, briefs and settings. Erasure removes the record (a member's record stays, without job details; active members must be disabled first), their WhatsApp threads, and who messages went to; unlinks activities and deals; and keeps invoices, payroll, the audit log and the opt-out itself. Every query is workspace-scoped; the audit entry names only the record id.
- **Retention:** the daily lifecycle job prunes message, delivery, automation, WhatsApp chat and payment-webhook logs older than 395 days in batches (date indexes added); a dry run unless `RETENTION_PRUNE_ENABLED=true`.
- **Breach:** `docs/BREACH-RUNBOOK.md` (roles, the 6-hour CERT-In and 72-hour workspace clocks, steps, templates), and Console → Incidents (Admin, `breach.notify`): an essential email and bell alert to every active owner of the listed workspaces, logged in each workspace's audit log and the staff audit.
- **Consent:** a WhatsApp-capable number given to a client contact, client or billing recipient writes a consent row with source `admin` and the notice version (members already log their own OTP-verified opt-in).

### Hindi wording (`modules/automations/recipes-hi`)

- Hindi text for every recipe that writes to clients, leads or employees, plus the employee alerts, marked `review` for the owner. The editor's "Use Hindi wording" fills a recipe with it; channel, recipient and timing never change, and English stays the default. A test checks every Hindi text uses exactly the English variables.

### Checks on 8 Oct

- `tsc`: 0 errors.
- Vitest: 1,543 tests in 160 files pass (1,454 in 152 before). New: `lib/plan-config.test.ts`, `lib/console/setup-cap.test.ts`, `lib/utm.test.ts`, `modules/lifecycle/export-stream.test.ts`, `modules/billing/leftovers.test.ts`, `modules/console/reports/reports.test.ts`, `modules/privacy/privacy.test.ts`, `modules/automations/recipes-hi.test.ts`; updated WhatsApp, export, roles and staff-migration tests. Razorpay, Interakt and Resend are never called.
- ESLint: 0 errors (23 warnings, unchanged).
- `NEXT_DIST_DIR=.next-deploy npm run build` passes; `.next-deploy` removed and `tsconfig.json` reverted.
- A scratch Vitest smoke run against `flowbit_v2dev` on the usual MongoDB covered: Console prices and limits read through; a second due bill refused by the index; one paid DocEvent from three deliveries; 10 parallel inbound claims → 1 (another workspace's still claims); 6 parallel Sales extensions → 1, Admin adds another; the export of one workspace without message bodies or the other workspace's rows; reports leaving an Internal workspace and its invoice out and grouping by UTM; a lead exported and erased in one workspace while the same person in another stayed; a number's consent row written once; retention counting in a dry run and deleting when enabled. `flowbit_v2dev` was dropped afterwards. The `flowbit` demo database and port 4100 were not touched.

### Assumptions (simplest reading of the spec)

- MRR movements come from paid plan invoices (upgrades count from the next renewal); headline MRR is the plans' MRR, as on Home.
- "In setup" in the funnel means a handover started or an import done; "habit formed" means a Green health score now.
- Marketing groups signups by first-touch UTM; house Orbit lead sources are not reported separately.
- The weekly setup cap counts handovers started in the IST week (Monday); a race between two staff clicking at the same moment could exceed it by one. Staff imports are not counted (they already need the owner's approval).
- The marketing site (pricing page, calculator, FAQ, legal copy) keeps the code's prices and trial length; only the product and billing read the Console values.
- Erasure keeps the opt-out row (so the person is never messaged again) and the member record (other records point at it); the person's Flowbit login is theirs to delete.
- Retention is 395 days (a year plus a month) and covers only logs; audit logs, invoices, billing events and document timelines are kept.
- The Hindi wording is offered as a button, not stored as a language on the rule.

### Not in this step

- Browser click-through and the 375 px check of the new screens (no browser in this run); layouts use the existing cards and scrolling tables.
- A Console screen for MRR history before the first paid invoices (movements read invoices only).
- Erasing a person's own Flowbit login (outside any one workspace), and Muster employee records (kept by law).
- The marketing site reading Console prices.

## What is built

### Core (shared by all products)

- **Marketing site:** landing page, pricing with a monthly/yearly toggle, calculator and compare table (every price comes from `lib/plans`), four product pages, contact form (stored as demo requests), terms, privacy, and a refunds policy, plus OG images.
- **Auth:** email and password sign-in, sign-up, forgot and reset password, invite acceptance, and Google sign-in when it is configured. Sessions are httpOnly cookies with a hashed token and a 30-day sliding expiry. Auth routes are rate limited.
- **Onboarding:** two steps. Step 1 is the workspace name, a live slug check, team size and invites. Step 2 picks project or personal mode. A new workspace starts a 15-day trial of everything.
- **App shell:** gradient nav rail driven by the catalog, side panel with the workspace switcher, search (⌘K command palette), contextual sections and the check-in widget, a top bar with breadcrumb, notification bell and avatar menu, and synthesized sound effects that can be switched off.
- **Settings:** general, profile, security (password and sessions), appearance, members (invite, role, disable, resend, copyable invite link when no email provider is set), roles (built-in plus custom roles from a permission matrix), modules, subscription (plan picker, checkout, billing history with GST invoices from Flowbit), integrations, audit log, and email log.
- **Subscription:** trial, active, past due (7 days of full access), read-only and blocked states. Checkout uses Razorpay, or test mode with "Simulate payment". There is a Razorpay webhook, seat and capacity limits, and Flowbit's own GST invoices with a global `FB/{FY}/NNNN` series.
- **Flowbit Console (`console.useflowbit.com`, was `/platform`):** all workspaces with plan, status, seats, MRR, health and salesperson; role-gated staff actions; see "v2 step 5". Only Console staff with 2FA can reach it; customer sessions never open it.
- **Notifications:** the bell polls every 30 seconds, and there is a notifications page.

### Flowbit Work

- **Home dashboard:** greeting, workday timeline, Arc card, three stat cards with sparklines, project overview ring chart, an "Assign to me" table with tabs, and an attendance bar with a calendar.
- **Tasks:** list, board (drag between columns) and calendar views, filters, saved views, bulk actions and quick add. Task detail has subtasks, checklist, comments with @mentions, attachments, activity, watchers and time logged. Personal tasks are supported.
- **Spaces** (folders and lists) and **projects** (health score, progress, milestones, files, activity, settings).
- **Teams** with workload, **meetings** (list and week calendar, RSVP, notes, action items that become tasks), and **posts** (categories, pinning, audience, read receipts, replies, reactions).
- **Time tracking:** server-side timer, manual entries, weekly timesheet, submit week, and approval by the direct manager.
- **Whiteboards:** Excalidraw boards with autosave, a version check, image upload and thumbnails.
- **Reports:** throughput, overdue, by assignee, project health and time by project, with CSV export.
- **Arc:** workspace search, plus Outline a project, Break down a task and Progress update. Arc uses Claude when `ANTHROPIC_API_KEY` is set and templates otherwise. Every suggestion is applied only on an explicit click.

### Muster

- **People:** list, add, edit, CSV import with a preview, and profile tabs (Profile, Job, Documents, Nominees, Bank & statutory, Remarks, Attendance, Leave, Letters, Payslips). There are 13 lifecycle statuses, and HR verifies bank changes.
- **Attendance:** month register grid, HR override, month lock and reopen with a reason, corrections, comp-off, and CSV export.
- **Leave:** apply, then manager → HR approval routing, calendar, balances, HR adjustments, and comp-off credit.
- **Claims:** categories with ceilings, claim forms, the public `/c/[slug]` form (work-email OTP, receipt upload), a review queue (approve, approve reduced, reject, bulk approve), send to payroll, and mark paid.
- **Payroll:** the 8-stage workflow (attendance locked → claims closed → generated → HR reviewed → finance approved → locked → released → payslips published). It has salary components and structures, dated PF/ESI/PT/LWF rates by state, holds, exclusions, adjustments, payslip PDFs and email.
- **Letters:** 20 templates, numbered references (`VW/HR/2026/NNNN`), PDF, email and revoke. Issued letters are never deleted.
- **Reports** (CSV and preview): employee master, attendance, leave, salary register, statutory, payroll journal, claims and gratuity.
- **Self-service (`/app/me/*`):** profile, attendance, leave, payslips, claims, letters and documents. It always reads the signed-in person's own record.

### Orbit and Clients

- **Leads:** table and board, CSV import, and a stage machine with guards (outreach → reply → meeting booked → meeting done → convert to client and deal).
- **Deals:** board with drag, won and lost with reasons, and a Folio card on won deals ("Create quote" and "Create invoice").
- Contacts, activities (today, overdue, upcoming), reports (cold vs warm conversion, by source, by owner, won/lost reasons) and settings lists.
- **Shared Clients pages:** list, new and detail, with tabs Overview, Contacts, Projects, Deals, Invoices, Ledger and Activity. Tabs for products the workspace does not have show a lock card.

### Folio

- **Invoices:** draft → issue, with a number series per entity and financial year. GST is CGST+SGST within a state and IGST across states. Non-GST entities issue sale invoices. Reverse charge leaves GST out of the total. Invoices have a PDF, email, void with a reason, write-off and duplicate.
- **Quotes and proformas** that convert to invoices, **credit notes** (full or by line), **receipts** with allocation across invoices (unallocated money stays as an advance), and **retainers and billing plans** that create drafts.
- **Client ledger** with PDF and CSV, a **dashboard** (receivables, overdue, collected, aging, top debtors), **reports** (aging, GST summary, collections, revenue; CSV), and **settings** (entities, banks, number series, tax, terms, signatory, services, reminders).
- **Daily job** (`npm run cron:folio`): overdue reminders and retainer drafts. Each reminder is sent at most once, even when runs overlap.

### Owner feedback round (2 Oct 2026)

Built from the owner's review with a service-business owner, then integrated and checked (see "How it was verified", step 5).

- **Folio firm filter.** A "Combined · Vistaar WebX · Vistaar Solutions" switch (`?firm=<code>`, hidden with one firm) on the dashboard, invoices, receipts, collections, reports, expenses, P&L and forecast. Every dashboard KPI, the aging, top debtors and the six-month trend follow it, and dashboard links keep it.
- **Periods in words.** Every Folio number says its window ("Outstanding as of 2 Oct 2026", "Collected in FY 2026-27 · from 1 Apr 2026"). A period picker (This month · Last month · This FY · Last FY · Custom, `?period=`) sits on the dashboard, invoices, receipts, reports, expenses and P&L.
- **Billing forecast.** Expected billing for the next 3 and 6 months from active retainers and billing-plan milestones, by month, firm and client: a dashboard card, `/app/folio/forecast` and a CSV.
- **Expenses.** `/app/folio/expenses` (list, new, detail and edit), with firm, category, vendor, amount with GST and input-tax flag, mode, bank or cash, a receipt upload (file kind `expense_receipt`), monthly repeats copied forward in one click, and CSV. Categories are edited in Folio settings → Expenses (11 defaults). New permissions `expenses.read` and `expenses.write` (owner, admin, finance through "all of Folio"), so the sales role cannot see vendor payments.
- **Profit and loss.** `/app/folio/pnl` and a dashboard card: income (taxable value of issued invoices less credit notes), expenses by category net of claimable GST, salaries (employer cost of released Muster payroll months, Combined view only) and net profit by month, with a chart, table and CSV, under a "management view, not statutory accounts" note.
- **Folio firms on the plan.** Folio includes 2 firms; each extra firm is ₹199 a month. Pricing, the calculator, the subscription picker and the capacity rows show it; Folio settings shows "N of 2 firms on your plan", and adding or reactivating a firm beyond the plan is refused (`assertFirmCapacity`).
- **Attendance.** A range chart (Today · 1M · 6M · 1Y · Custom, `?range=`) on the HR dashboard and in a Trends tab, with present %, late, absent, on leave and WFH following the range. New statuses Work from home, Sick leave and Half day (paid). A **daily view** (the default tab on `/app/hr/attendance`): one row per person, tap a status, a reason when changing a recorded day, "Mark remaining N present". **CSV import** with a template and a row-by-row preview (locked months refused), and a date-range export.
- **Joining documents.** HR settings → Joining documents sets the mandatory documents and the threshold (default 60%). Profiles and `/app/me/documents` show "Onboarding N% complete" with what is missing, and employees upload their own. Below the threshold a person cannot be made active; an HR admin can start them anyway with a reason, which is audited.
- **Remarks.** Types Performance note, Concern, One-on-one and General. General and One-on-one show in the employee's self-service (a one-on-one notifies them); the form says "Visible to <name>" or "HR only".
- **Bank payment file.** For a locked or released payroll month: CSV in Generic, HDFC-style or ICICI-style layout with the debit account, mode and value date. It needs payroll lock or release rights plus sensitive access, and is audited.
- **Letters.** The covering email is drafted from the template and can be edited with a live preview before sending. "Rebuild from template" and "Save draft" no longer lose or duplicate wording.
- **Gratuity tenure** is exact (completed years and months from the join date, with month-end and leap-year cases tested). The report shows "2y 3m".
- **Platform.** Sign-out works from the user menu and lands on /login. Absolute links come from `APP_URL` (a warning is logged when it is missing or local in production). The login page shows the four products. A product the workspace has not bought opens a **preview page** (sample dashboard marked "Preview · sample data", what it does, the price, Start trial / Add to plan for owners, "Ask your admin" for others). The workspace logo and name show in the shell, with "Powered by Flowbit" kept small. **Brand colours** (primary, secondary, accent) in Settings → Appearance for owners and admins on Suite or trial, with a live preview, a contrast check against the dark surfaces and reset; they apply to the whole shell for everyone.

## First-year yearly discount (fix round B, 11 Oct 2026)

Console spec §2: "50% off the first year, on yearly plans only. Monthly plans pay the list price." It replaces the old "2 months free".

- **Prices.** Yearly list = 12 × monthly (`YEARLY_MONTHS = 12` in `lib/plans`). A workspace's **first** yearly plan invoice gets the discount; yearly renewals and every monthly invoice pay the list price. "First" means no earlier paid yearly plan invoice for the workspace (cancelled invoices, due bills and upgrade invoices do not count; older invoices without a stored cycle count as yearly when their period is 300+ days).
- **Setting.** Console → Settings → Limits, "First-year discount on yearly plans (%)": a whole number 0–90, default 50; 0 switches it off. Saved with the other settings, and the audit row records the before and after.
- **Maths** (`lib/first-year-discount`): discount = round(yearly list × percent / 100) in paise; taxable value = list − discount; GST 18% on the taxable value (worked out once on the discounted value); the total is rounded to the rupee as before.
- **Where it shows.** The plan picker (new checkouts only; a plan change of an active subscriber pays list), the summary, Razorpay checkout (the plan is the full yearly price; the first year is one up-front add-on and the plan's own charges start a year later), Console due bills, the public bill page, and the GST invoice PDF as a separate "First-year discount" line plus "Gross value / Less: first-year discount / Taxable value". A plan bought at a discount keeps its list amount for renewals and proration.
- **Copy.** Pricing page, calculator, plan cards, FAQ, manual (10-start, 60-admin) and the Free/trial-ending emails all say "50% off your first year"; the public site shows the default 50 (it is static).

## How it was verified

1. **Typecheck, lint and unit tests.** `tsc --noEmit`, `npx eslint src --quiet` and `npx vitest run` were run after every integration step and again at the end. The tests cover pure domain logic: GST and invoice pricing, numbering, settlement and ledger math, aging, the payroll engine and entry builder, leave days and accrual, the attendance register, lead and deal stage machines, Orbit metrics, plans and billing maths, permissions, rate limits, the form-data parser, safe redirects and CSV safety.
2. **Production build.** `npm run build` passes.
3. **Role crawl** (`.local-test/crawl.mjs`, against `npm run start`). For each seeded role (anonymous, owner, admin, hr_admin, hr_exec, finance, manager, sales, member, and the custom BD executive role), the crawler mints a session and requests every catalog page, every dynamic route with real ids, every GET API and a set of fuzzed ids. It then follows every link each role is shown, three levels deep. It checks each response against the role's permissions: no 5xx, no error pages, no data the role should not see, no wrong refusals, and no links to pages the role cannot open. The final run made 7,825 requests with 0 flags, and the server log had no errors. One flag from the first final run was fixed: the attendance page linked hr_exec to HR settings, which hr_exec cannot open.
4. **Browser flows** (Playwright, headless, 1440×900; scripts in `.local-test/flows/`). These ran on 1 and 2 Oct, area by area. Screenshots were checked against SPEC section 3.
   - **Auth, shell and marketing:** the marketing site, sign-up through onboarding, sign-out and sign-in, password reset through the Outbox link, and invite acceptance.
   - **Work:** the dashboard, tasks across all views (drag, filters, saved views, bulk actions, detail, @mentions), and the other Work areas. Time tracking ran through submit and approval.
   - **Muster:** add, edit and import people; attendance override and lock; leave apply and approve; claims through the public form with OTP and receipt, then review and pay. September payroll ran through all 8 stages.
   - **Orbit and Clients:** a lead through every stage guard, conversion, the deal board, won and lost, and every client tab.
   - **Folio:** same-state, inter-state and non-GST invoices; issue, PDF and email; receipts allocated across two invoices with an advance left; credit notes, quotes, ledger, reports and settings.
   - **Settings and platform:** general settings and logo, profile, security, appearance, members (invite, accept, role, disable), custom roles, modules, subscription checkout in test mode, and platform admin actions.
5. **Owner-feedback round (2 Oct 2026).** After integration (catalog pages and nav for Expenses, Profit & loss and Forecast; the new expense permissions; the firm limit wired into Folio entity creation), `tsc`, Vitest, ESLint, a clean reseed, `npm run build` and the full role crawl were re-run. The crawler now also covers the expense, P&L and forecast pages and CSVs, the attendance day, trends and import views, the range export and import template, the bank file for every payroll month, the product preview pages, the appearance page, and fuzzed `?firm`, `?period` and `?range` values. Browser flows (`.local-test/flows/feedback-*.mjs`, sessions minted per role) clicked through each feature once:
   - **Folio** (26 checks): firm switch changes the numbers and filters the invoice list; an expense booked with a receipt is stored in paise and its receipt opens for finance but not for sales; the VWX P&L matches invoices less credit notes and expenses net of input GST computed straight from MongoDB, and the Combined view includes released salaries; the forecast renders; a third firm is refused with the plan message.
   - **Muster** (40 checks): range chart and range switch; daily marking (WFH with a reason, "Mark remaining present"); CSV import (unknown code flagged, locked September refused, an October half day written) and the range export; the document gate (hr_exec cannot start Riya Kapoor, hr_admin is refused without a reason); remark visibility (the employee sees the one-on-one and is notified, never the concern); the bank CSV download; letter email edited and sent into the Outbox; rebuild and save of a draft letter; gratuity tenure against the join dates.
   - **Platform** (18 checks): sign-out from the user menu, the login product strip, the Orbit preview page for a member and an owner (Orbit taken out of the plan for the check), the workspace logo in the shell, and brand colours applied for the owner and members, then reset.
   - Fixed during this step: the bank-file dialog closed before the browser submitted its form, so the CSV never downloaded ("Form submission canceled because the form is not connected"); it now closes after the submit. A type error in `plans.test.ts` (the subscription `quantities` type) was fixed. The crawler now expects `/app/locked` to forward into a product the workspace already has.
6. **Review.** Four read-only reviews covered tenancy and security, permissions, money and dates, and code quality. They produced 82 findings. Every confirmed critical and high finding was fixed, including prototype pollution in the form parser, record takeover through link/invite, signup and Google pre-hijack, rate-limit bypass, file-download access per kind, PAN/UAN exposure, own-record checks, reverse-charge totals, retainer re-billing, payroll reopen, fractional leave, the whiteboard save race, missing indexes, people search and an open redirect. Medium findings were fixed where the change was small.

7. **Redesign integration (3 Oct 2026).** Steps: a clean reseed (`npm run db:seed -- --reset`; the only "QA" strings left are the seeded "QA Engineer" title and the task "Cross-browser QA pass"), then `tsc`, Vitest (768 tests), `npx eslint src --quiet` and `npm run build`. The role crawl of `npm run start` was clean for every role. The final gallery in `docs/design/after/` was compared screen by screen with the Figma captures (no page errors, no sideways overflow), and the two fixes listed under Design were made. After those fixes, tsc, the tests, the build and the crawl were run again, and all were clean.

Machine note: all of this ran on an 8 GB Mac with one heavy process at a time. Flow runs often waited for memory or load to drop, and two reboots interrupted the work. Every interrupted step was re-run.

## Design (Figma redesign, 3 Oct 2026)

The visual spec is `docs/DESIGN.md`. It was measured from the Figma captures in `docs/design/figma/` and the brand kit PDF, and it overrides SPEC §3 where they differ. The redesign changed the shared token layer (`src/app/globals.css`), the glass recipe, the logo components, motion and the shell, then each product area page by page.

**Screens as built:** `docs/design/after/` holds 14 captures at 1728×1080 (the mobile sign-in at 393 wide): `01-login-dark`, `02-login-mobile`, `03-onboarding-step1`, `04-onboarding-step2`, `05-home`, `06-tasks-board`, `07-hr-dashboard`, `08-payroll-cycle`, `09-orbit-deals-board`, `10-folio-dashboard`, `11-invoice-detail`, `12-folio-pnl`, `13-settings-subscription` and `14-landing`. They were taken with seeded data on Saturday 3 Oct, so the owner has not checked in, the workday bar is empty and "this month" Folio figures are near zero. To re-take them, start the dev server and run `node .local-test/gallery.mjs [name ...]`.

### What matches the Figma
- **Sign-in (desktop and mobile)** and **onboarding steps 1 and 2** match their frames (`login-desktop-b`, `login-mobile-dark`, `onboarding-a`, `onboarding-b`). That covers layout, card sizes, the brand mesh panel, the ribbons around the card, field and button shapes, the "Selected" tag and gradient stroke on the chosen mode card, the step bars and the vertical "workspace" word.
- **Home** follows `dashboard-dark` card for card: the workday timeline, the Arc card, three stat cards with sparklines and corner glow, the project overview ring and details, the "Assign to me" table with tabs, and "My attendance" with the bar and calendar. The shell matches too: the gradient rail with the white active tab, the side panel sections, the check-in widget and the top bar.
- **Tokens:** neutral charcoal surfaces (`#171717` / `#1A1A1A`), white text, the Figma status colours (mint, amber, coral, violet), chip-active `#56397D`, the gradients (mesh, Sign in button, rail, workday fill, wordmark), and radii capped at 16. Glass is a translucent fill with a backdrop blur, a lit 1 px hairline and an inner highlight, with no coloured borders and no drop shadows. Icons are Lucide at 1.5 px.
- **Internal pages** (Tasks, HR, Payroll, Orbit, Folio, Settings and the rest) are built from the dashboard's parts as DESIGN §12 describes: the page header with a gradient primary pill, stat cards with the corner wash, tables styled like "Assign to me", and section labels in caps.
- **Logo:** the mark and wordmark are the brand-kit vectors (`public/brand`). The app icon (`src/app/icon.svg`) is the mesh tile with the white mark and no centre dot, as in the `checkin-*` captures.
- **Motion:** the brand mesh drifts slowly, primary buttons shimmer on hover, the workday fill has a sheen, ribbons float, and charts draw once on mount. All of it animates only transform or background-position and stops under reduced motion.

### Deliberate differences
- **Dark only.** The light frames (`dashboard-light`, `login-desktop-a`, `login-mobile-light`, `onboarding-c/d`) are reference only and were not built.
- **Readability over exact colour.** "Flowbit" in the sign-in heading uses a brighter wordmark gradient than Figma's low-contrast lavender. The links on mobile sign-in (Forgot password, Terms, Privacy) use orchid instead of Figma's near-invisible navy.
- **Real data instead of mock values.** Home shows the viewer's real counts, sparklines from real daily series, the real attendance split and real assignees (initials when there is no photo). Empty states (no check-in yet, no dates, "No record") replace the Figma's filled-in numbers.
- **Things the Figma doesn't show:** a disabled Google button with "Google sign-in is not configured on this server" when it isn't set up, a Back link on onboarding step 2, the four-product line on the sign-in panel, a "Create an account" link, the grey checked-out clock, and hover, focus, pressed and empty states (DESIGN §12 and §14).
- **Scroll reveal on the landing page:** sections lower down start dimmed (never hidden) and lift in as they scroll into view.

### Estimated, because only raster captures were available
The Figma API was not available. The frames were screenshotted from the Figma file in a browser (2x PNG tiles in `docs/design/figma/`, taken with `.local-test/figma-repl.mjs`) and measured with a pixel sampler, so effect settings could not be read directly. DESIGN.md marks 24 values **(est.)**:
- the glass blur radius, fill opacity and inner highlight, which were worked back from the colour they produce
- most card and control radii, read from anti-aliased corners (stat cards 8, Arc and attendance cards 10, the "Assign to me" card 12, project overview and option cards 14, the app icon corner about 24)
- the sparkline glow, the Add Member button height, and some type sizes and letter-spacing (the arc.ai wordmark and section labels)
- the stroke-gradient stops on the Google button and the selected option card

The logo-direction frames (`logo-17466…17473`) were not captured, because the presentation view kept showing the brand swatch. The mark and wordmark therefore come from the brand kit PDF and were checked against the logos on the auth, dashboard and onboarding frames. The Moodboarding page was not captured.

### Fixed in the final pass
- Finished tasks no longer say "14d overdue" on the board, the list or subtasks. They show "Due 19 Sep" in grey (`components/work/tasks/task-bits.tsx`).
- On a phone, Home was 183 px wider than the screen because the "Assign to me" table set the width of the whole grid. The dashboard grids now start from one shrinkable column, and the table scrolls inside its card (`app/app/page.tsx`). The desktop layout is unchanged.

### Left for a designer
- At 1728 px the task detail's Details card leaves some empty width on the right.
- The project overview stat cards (Total, Completed, In progress, Overdue) have the corner wash but no sparkline, because there is no per-day series to draw.
- Notifications mark unread rows with a slightly lighter fill, not a dot.

## Known gaps and limitations

### Product gaps

- **Owner-feedback leftovers:**
  - The firm filter is not on quotes, credit notes or ledgers. The "Follow-ups due" count stays workspace-wide and says so.
  - Muster payroll is not split by firm, so salaries appear only in the Combined P&L; a single-firm P&L says it leaves them out.
  - The P&L is cash-and-invoice based: no accruals, depreciation or income tax.
  - The day view lists only people who have joined by that day; days before a mid-month join show as not applicable in the month grid.
  - The product preview page shows only for a product the workspace lacks. The seeded workspace is on Suite, so to see it, take a product out of the plan (as the flow does) or use a non-Suite workspace.
  - The bank file is a GET form: if the server refuses it (for example a month that was reopened meanwhile), the browser shows the plain-text message instead of a toast.
- **Leave on attendance.** Approved leave is written to `AttendanceDay` with status `leave`, but without `source: 'leave'` or `leaveRequestId` (muster spec §3.8). Employees without a Flowbit login get no leave marks on the attendance sheet.
- **Payroll:**
  - Payroll can still be HR-reviewed, approved or locked after attendance, salary structures, adjustments or holds change. No freshness check invalidates the cycle.
  - Released months can no longer be reopened, and there is no "release held pay" path for entries on hold in a released month. Held salary has to go into the next month.
  - The ESI contribution-period rule is not applied. A mid-month salary revision applies to the whole month instead of per segment.
  - `publishPayslips` sends one at a time and re-emails people who were already emailed. Bulk claim approval also runs one claim at a time.
  - October 2026 payroll cannot be run end to end before the month ends. This is by design: attendance locks only after month end, and the seeded October statutory rates are an unconfirmed proposal.
- **Folio:**
  - Two concurrent retainer runs can create duplicate drafts. The fix needs a unique period key index and a migration.
  - A draft invoice keeps its old tax treatment at issue, even though the client and entity details are refreshed.
  - CSV money is written as a plain number (67000, not 67000.00), which differs from folio.md §6.18.
  - The VOID watermark on PDFs is faint.
- **Subscription:**
  - The renewal GST invoice can differ from what Razorpay actually charged after a refused downgrade.
  - Subscription periods are anchored to the payment instant, not IST midnight, so a mid-day purchase shows "2 Oct – 2 Nov".
  - Seat counts disagree: Members and Subscription count people including employees without a login (24/25), while `/platform` counts active members (16/25).
- **Platform:** the workspace list and KPIs load at most 2,000 workspaces into memory.
- **Arc:** progress updates can name projects the viewer cannot open, and show hours logged on them (low severity).
- **Orbit:** closed (lost or disqualified) leads still offer Log activity and Schedule follow-up.
- **Members:** a member who is disabled while signed in lands on "Create your workspace" with no note saying their access was turned off.
- **hr_exec can no longer fix work-email typos.** Since the security fixes, changing a work email needs `people.read_sensitive` or `members.manage`. Confirm this is wanted.

### Demo data gaps

- The extra demo workspaces in platform spec §14 are not seeded: one on trial, one read-only, one on a custom plan, one canceled, one disabled, and one with a scheduled plan change. So `/platform` lists only Vistaar WebX, and the trial, read-only and canceled banners cannot be seen with seed data. Vistaar WebX is on an active Suite plan, so trial reminders do not show either.
- No disabled member is seeded in Vistaar WebX.
- No seeded claim or expense has a receipt file, so claim-receipt and expense-receipt downloads were tested only through the browser flows, not with seed data.
- Seeded invoice VWX/2026-27/0009 has 45-day payment terms, but its printed terms text says "Payment due within 15 days" (the entity's default text). It is demo data only.
- The custom "BD executive" role uses `tasks.manage` and `work.reports` where the spec named two permission keys that do not exist.

### Code-quality leftovers

- ESLint shows 21 warnings: 13 `react-hooks/set-state-in-effect` and 5 `react-hooks/purity` (React Compiler rules), 2 unused names (`_drop` in the onboarding wizard, `loadEntry` used only as a type in `payroll/payslips.ts`), and 1 `jsx-a11y/role-supports-aria-props` (the attendance day sheet's "More" chip is a radio that also opens a menu). None are errors, and none break anything at runtime.
- Some async click handlers have no try/catch, so a network failure can leave a spinner stuck or show the error page. Examples: the deal form dialog, board rename, slug checks, notification bell, sound preference, quick complete, week grid and quick add.
- A few raw-collection reads swallow errors instead of reporting them: orbit `outstandingByClient`, `people/foreign.ts`, shell `data.ts` and the folio tabs.
- Some lists are capped at 200 rows with no pagination.

### Layout notes (kept by design)

- The deals board's Won and Lost columns and wide Folio report tables need horizontal scroll at 1440px. Folio's invoice table needs it at about 1100px.
- On a 900px-tall screen, people with many projects and teams have to scroll the side panel to reach the TOOLS section.
- In Work reports, "This month" draws zero bars for the days still to come.

### Operational limits

- On Vercel, uploads are capped at 4 MB (`MAX_UPLOAD_MB`); larger files would need direct-to-bucket uploads. See "Deploying to Vercel" below.
- Without `RESEND_API_KEY`, nothing is emailed. Invites, resets, payslips and claim OTPs are only stored in the Outbox.
- Daily jobs (task and follow-up reminders, Folio reminders and retainer drafts, trial reminders) run from Vercel Cron, or on a self-hosted server from `npm run cron:folio` / the `/api/cron/*` routes.

## Deploying to Vercel

The step-by-step guide for the owner is [`docs/DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md): MongoDB Atlas (Mumbai), Cloudflare R2 for files, Resend for email, optional Google sign-in and Razorpay, then Vercel (region `bom1`, set in `vercel.json`), the domain, moving the local data and files, and `npm run setup:prod`.

- Files go to a private S3-compatible bucket (`STORAGE_DRIVER=s3`); nothing is kept on Vercel's disk. `npm run storage:migrate` copies the local `storage/` folder into the bucket.
- Daily jobs run from Vercel Cron (`vercel.json`): task reminders, Orbit follow-ups, Folio reminders and retainer drafts, trial reminders, each with a catch-up run three hours later for any workspaces left when a run reached its 4-minute budget.
- A production build on Vercel stops (`scripts/check-env.ts`) when a required variable is missing or wrong, so the live deployment keeps serving. The server checks again at start. `/api/health` reports the database, file storage and email mode.
- Production servers do not build MongoDB indexes themselves: run `npm run setup:prod` once, and again after a deploy that adds a model or an index.
- When moving local data, restore it into an empty Atlas database before `setup:prod` and before anyone signs in (guide, (f) step 6).
- `.vercelignore` keeps `storage/`, `.env*` files and `*.local.md` logins out of `npx vercel` uploads.

Environment variables (all listed with comments in `.env.example`):

| Variable | Needed |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Yes: the Atlas connection string; `flowbit` |
| `APP_SECRET` | Yes: `openssl rand -base64 48` (hex works too) |
| `APP_URL` | Yes once the domain works (`https://app.yourdomain.in`); until then the project's `….vercel.app` address is used |
| `CRON_SECRET` | Yes: `openssl rand -hex 32` |
| `STORAGE_DRIVER`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes: `s3` and the bucket values |
| `S3_ENDPOINT` | For R2 (`S3_REGION=auto`); empty for AWS S3 |
| `RESEND_API_KEY`, `MAIL_FROM` | Yes for real use: without them nothing is emailed (the build and server log warn) |
| `SUPPORT_EMAIL` | Recommended |
| `PLATFORM_ADMIN_EMAILS` | Only for `scripts/migrate-staff.ts` (turns those emails into Console Admins) |
| `CONSOLE_HOST` | No: defaults to `console.useflowbit.com` (add that domain in Vercel) |
| `MAX_UPLOAD_MB` | No: 4 on Vercel when unset; above 4 stops the build |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional (Google sign-in, on `APP_URL` only) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | For subscription payments |
| `FLOWBIT_LEGAL_NAME`, `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE`, `FLOWBIT_SAC` | For subscription GST invoices |
| `ANTHROPIC_API_KEY` | Optional (Arc drafts with Claude) |
| `APP_ENCRYPTION_KEY` | For payment links and Console 2FA: `openssl rand -base64 32`; encrypts workspaces' Razorpay keys and staff TOTP secrets. Never change it once set |
| `S3_FORCE_PATH_STYLE`, `STORAGE_DIR` | Leave unset on Vercel |

## Decisions waiting on the owner

1. **Duplicate breadcrumbs.** About 65 pages pass `breadcrumb=` to their page header, so a second, smaller trail appears right under the top bar's breadcrumb, and two elements are labelled "Breadcrumb". Options: remove the page-level trail everywhere, or keep it only on deep detail pages. Left as is.
2. **HR stepping in at the manager approval stage.** hr_admin holds `approvals.escalated`, so she can sign the manager stage for someone who does not report to her. The request then moves to the HR stage and she approves again. The code allows "management can step in at any stage" so requests never get stuck. Muster spec §1.3 says only the actual reporting manager signs the manager stage. Choose one.
3. **Attendance daily view.** Built in the feedback round (daily marking with reasons, "Mark remaining N present", alongside the month grid). Nothing left to decide.
4. **Flowbit's legal details for subscription invoices.** These are needed before real billing: registered legal name, GSTIN, PAN, address, state, support email and phone, and the SAC code (998314 or 997331; confirm with the CA). Until `FLOWBIT_GSTIN` is set, these PDFs carry a DRAFT watermark.
5. **Refund policy.** The live `/legal/refunds` page uses the suggested default: no refunds for part-used monthly or yearly periods, cancel any time, and double charges or charges after cancelling refunded in full. Confirm or replace the wording.
6. **Folio users above 3.** Folio is ₹399 per workspace and includes 3 users and 2 firms (each extra firm is ₹199 a month, decided in the feedback round). Today a 4th user with any Folio permission is refused with "Folio includes 3 users. Move to Suite for more." The alternative is a per-user add-on price.
7. **Past-due grace length.** Today a failed renewal keeps full access for 7 days (`PAST_DUE_GRACE_DAYS` in `src/lib/plans.ts`), then 30 days read-only, then blocked. A Razorpay `subscription.halted` event makes the workspace read-only straight away. The terms page says the same. Confirm 7 days and the halted rule.
8. **Whether marketing names Claude.** The marketing pages call the assistant "Arc" and do not name Claude or Anthropic. The privacy page lists Anthropic as a service provider, used only when the Arc AI provider is switched on. Decide whether the product and pricing pages should say Arc uses Claude.
9. **Expense permission for custom roles.** Expenses now need `expenses.read` / `expenses.write`. Existing custom roles do not have them until an admin ticks them in Settings → Roles. Confirm that finance-style custom roles should get them.
10. **Brand colours outside Suite.** Brand colours are allowed on Suite and during the trial; Custom plans see the plan note and cannot save. Confirm, or open it to every paid plan.
11. **Yearly list price after the first year.** Built as yearly = 12 × monthly, with 50% off the first yearly invoice (console spec §2 replaces "2 months free"). So a renewing yearly customer pays the same as twelve monthly payments. If yearly should stay cheaper after year 1 (for example 10 × monthly), change `YEARLY_MONTHS` in `src/lib/plans.ts`; the discount still applies on top. Also: a monthly subscriber who switches to yearly through Change plan pays the list price (Razorpay moves the plan at the cycle end); the discount applies to new checkouts and Console bills.
