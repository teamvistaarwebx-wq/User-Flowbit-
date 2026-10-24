# Flowbit recheck (10 Oct 2026)

This recheck covers the 40 commits from `48a7ad2` (the last full check, `docs/V2-NIGHT-CHECK.md`) to `0d3a63b`, and the fixes it led to (`c396aa5` to `12cf845`). An earlier attempt died when the Mac restarted and left no commits, so this one started from scratch.

**Setup**
- **Database:** `flowbit_v2night` only. The `flowbit` and `flowbit_v2demo` databases were not touched. One probe ran in a scratch database (`flowbit_recheck_scratch`), which was dropped straight after.
- **Server:** `next start` on 127.0.0.1:4500.
  - Run 1 used the existing `.next-night4`.
  - Run 2 used `.next-night5`, built from the fixes and served with the new `.local-test/serve-night5.sh`.
- **Not used:** `.next`, `.next-v2` and `.next-check*`.
- **Machine:** the Mac had just rebooted, with a 1-minute load of 28–35. Every heavy step waited until the load was 12 or lower. That took about 5 minutes; after that the load stayed between 2.7 and 13.
- **Limits:** one heavy job at a time, Vitest on 2 workers, crawl concurrency 1 with a 40 ms delay.
- **Not used:** no browser, and no password sign-in.

## Static checks

| Check | At `0d3a63b` | After the fixes (`12cf845`) |
| --- | --- | --- |
| `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit` | 0 errors | 0 errors |
| `npm test` (`--pool=forks --maxWorkers=2`) | 2,326 tests in 258 files pass | 2,332 tests in 261 files pass (3 new test files, 2 extended) |
| `npx eslint src scripts` | 0 errors, 22 warnings (the known kinds) | unchanged |
| `next build` (`NEXT_DIST_DIR=.next-night5`, 3 GB heap) | – | passes. `tsconfig.json` was restored afterwards. |

## The crawler (`.local-test/crawl.mjs`, git-ignored)

### What was added for this recheck

**How it calls actions**
- Server actions are now called the way the browser calls them:
  - a `Next-Action` header;
  - arguments encoded with React's `encodeReply`, so `FormData` and `File` arguments are real;
  - action ids read from the served build's `server-reference-manifest.json` (`--dist`).
- Each call is judged on the `{ ok, error }` result it returns.
- A role without access must get the permission refusal.
- A role with access must get past the gate. A random id gets "removed meanwhile" rather than a write.
- Every refused write is checked against a snapshot. The snapshot covers the org's signatories, logo and profile, the fixture webhook, the attendance corrections and the employees' biometric ids. Each must be unchanged.

**New fixtures** (`.local-test/v2-setup.mts`, removed again with `--cleanup`)
- A signatory whose signature and seal are real stored PNGs (kinds `company_signature` and `company_seal`).
- A webhook endpoint.
- The owner's `tasks+` address and a teammate's email.
- Two live sequence enrolments, with a valid, a forged and a cross-enrolment reply address.

**Company profile** (`/app/settings/company` is in the catalog crawl for every role)
- Signatory actions (`saveSignatory`, `setDefaultSignatory`, `removeSignatory`, `savePayslipSignature`):
  - Refused for every role except owner and admin.
  - Owner and admin pass the gate.
  - Removing the real fixture signatory is refused and changes nothing.
- `saveCompanyProfile`, `removeCompanyLogo` and `setMailToTaskTeammates` are refused without `org.manage`.
- For owner and admin:
  - A GSTIN from another state is refused.
  - An SVG logo with a `<script>` is refused by its bytes, both as `logo.svg` and when it claims to be `image/png`.
  - An SVG signature is refused the same way.

**Signature and seal files**
- Their ids return 404 (401 or `/login` when signed out) from all of these:
  - `/api/files/<id>` and `?download=1`, for anonymous and every role
  - `/portal/<slug>/files/<id>`, for a portal contact
  - `/api/console/files/<id>`, for every Console role
- The ids never appear in the HTML of `/app`, `/app/me`, `/app/settings/company`, `/app/folio/settings`, `/app/hr/settings` or `/app/hr/letters`, for any role.

**Public endpoints**
- `/status` (anonymous and every role) shows a state. It contains no connection string, local address, stack trace, environment-variable name, bucket or storage driver.
- `/api/health` is checked the same way.

**Klipy**
- `/api/work/gifs` returns 404 for everyone, signed out included. No key is set.
- `attachPostGif` is refused without `posts.write`. With it, the action says GIFs are not set up, even for a `169.254.169.254` URL.

**Webhook edit (`updateWebhook`)**
- Refused without `org.manage`.
- With `org.manage`:
  - A `127.0.0.1` URL is refused by the SSRF check.
  - The same values give "Nothing changed".
  - An unknown id is not found.
- The stored webhook never changes.

**Biometric import**
- `checkBiometricImport` passes for `attendance.manage` and writes nothing. `runBiometricImport` and `saveBiometricMapping` are refused for every other role.
- End to end for the owner:
  1. The template import check still works: one row is ready, and `25:30` is refused there.
  2. A night shift (22:00, then 01:30 and a repeat at 01:31) previews as one day, 2026-08-03, out `25:30`, with 3 punches.
  3. The import writes it: the member's day has punches at 22:00 and 01:30 the next morning IST, and 210 worked minutes.
  4. Undo removes it.

**Email to task** (signed `POST /api/inbound/email`)
- These are rejected:
  - a teammate mailing the owner's address while "allow teammates" is off;
  - SPF failing;
  - DKIM or DMARC failing (from an `Authentication-Results` header).
- These each create exactly one task:
  - the owner mailing their own address;
  - the teammate, once "allow teammates" is on.

**Reply addresses**
- A forged signature, or another enrolment's signature, is rejected and changes no enrolment.
- The valid address stops only its own enrolment.
- A repeat reply gets "already ended".

**Rate limits in normal use**
- After 3 bad MCP tokens, 35 good MCP calls in a row all return 200.
- `/oauth/revoke` still answers 200.
- 20 loads of `/app/work/posts` in a row all succeed.

## Crawl totals

| Role | Requests (run 2) | OK | Denied | 404 | 5xx | Flags run 1 → 2 |
| --- | --- | --- | --- | --- | --- | --- |
| anonymous | 354 | 84 | 0 | 6 | 0 | 1 → 0 |
| member | 853 | 486 | 201 | 62 | 0 | 2 → 0 |
| hr_exec | 1,073 | 799 | 132 | 58 | 0 | 2 → 0 |
| finance | 1,223 | 1,034 | 61 | 82 | 0 | 2 → 0 |
| hr_admin | 1,152 | 890 | 125 | 59 | 0 | 2 → 0 |
| manager | 1,203 | 928 | 138 | 61 | 0 | 2 → 0 |
| admin | 1,229 | 1,120 | 2 | 74 | 0 | 1 → 0 |
| sales | 1,013 | 678 | 170 | 68 | 0 | 2 → 0 |
| custom:BD executive | 998 | 646 | 181 | 70 | 0 | 2 → 0 |
| owner | 1,262 | 1,156 | 0 | 76 | 0 | 1 → 0 |
| console:admin / sales / accounts | 90 | 36 | 0 | 33 | 0 | 0 → 0 |
| console:admin_mfa | 14 | 0 | 0 | 0 | 0 | 0 → 0 |
| portal | 12 | 1 | 0 | 4 | 0 | 0 → 0 |
| MCP grants (10: one per role, plus owner read-only) | 81 | 81 | – | 0 | 0 | 0 → 0 |
| **Total** | **10,557** | **7,939** | **1,010** | **653** | **0** | **17 → 0** |

**About the runs**
- Run 1 had 10,505 requests and was on `.next-night4` (the code at `0d3a63b`). Run 2 was on `.next-night5` with the fixes, after a fresh fixture setup.
- Run 2 includes 311 recheck results. 119 of them are server-action calls.
- Both runs had 0 server errors and 0 error pages.

**About the counts**
- The 404s are expected:
  - random and malformed ids;
  - Console pages a role may not open;
  - WhatsApp pages, because the flag is off;
  - records outside a role's scope;
  - the signature and seal ids.
- 260 results are "scoped": either outcome is acceptable. They are listed in `.local-test/crawl-result.json`.

### Every flag, with cause and fix

| Run | Flag | Cause | Outcome |
| --- | --- | --- | --- |
| 1 | `/app/settings/company` redirects to `/app/settings/profile` where the catalog expects `/app/denied` (7 roles without `org.manage`) | **App inconsistency.** The page did its own redirect. The catalog and every other admin settings page refuse through `requireMember({ perm })`. | **Fixed** in `744ccd5`. Test: `src/app/app/settings/company/page.test.ts`. Run 2 is clean. |
| 1 | `/status` "shows an internal detail" (anonymous and 9 roles) | **Crawler mistake.** The page's canonical and `og:url` carry `APP_URL`, which is `127.0.0.1:4500` on this server. Nothing internal is shown. | The check now ignores the server's own origin. Run 2 is clean. |

## Review findings by severity

The review read every source change in `48a7ad2..0d3a63b`. Each finding was checked against the code, and where possible against the running build or a scratch database, before it was acted on.

### CRITICAL / HIGH
None found.

### MEDIUM

| # | Finding | Status |
| --- | --- | --- |
| M1 | **A split suggestion could never be confirmed.** `suggestSplits` offers invoices whose balances add up to the deposit within ₹1, either way. When the balances were up to ₹1 *over* the deposit, Confirm sent every full balance, and `confirmSplit` refused because the total was more than the deposit. | **Fixed** in `c396aa5`. The newest-due invoice now takes the shortfall, so the allocations never exceed the deposit. Under the deposit, balances are paid in full and the rest is advance, as before. Test in `bank.test.ts`. |
| M2 | **A large biometric import could fail.** It may write up to 15,000 person-days in one transaction. `writeMarks` upserted each linked member's day with its own round trip inside that transaction. On a remote database that can pass MongoDB's 60-second transaction limit. The template import (at most 5,000 rows) shares the path. | **Fixed** in `b0da24a`. The days are upserted in one ordered `bulkWrite`, scoped to the workspace like `ctx.db`. This was checked on a scratch replica set (upserts, `upsertedIds`, timestamps and `orgId` inside a transaction) and end to end in the crawl, including the import and its undo. Test: `marks.test.ts`, which also covers a 25:30 out flowing into the day's punches and worked minutes. |

### LOW

| # | Finding | Status |
| --- | --- | --- |
| L1 | The Company profile page refused without `org.manage` by redirecting to Profile, unlike its catalog entry and the other admin pages (crawl flag). | **Fixed** in `744ccd5`, with a test. |
| L2 | **Biometric dates with spaces were dropped.** `parseDay` reads "01 Oct 2026", but `parseStamp` split the cell at its first space, so such a date column or stamp was skipped as unreadable. | **Fixed** in `7d5246c`: the time is split off the end instead. Test in `formats.test.ts`. |
| L3 | **No limit on attaching a GIF.** Klipy search is limited to 60 a minute, but `attachPostGif`, a server-side download of up to the upload limit, had no limit. | **Fixed** in `12cf845`: 20 a minute per member. Test: `image-actions.test.ts`. |
| L4 | The GIF route's comment said the person's address never reaches Klipy. In fact the picker's previews load from Klipy's CDN; posts still never hotlink. | **Fixed** (comment only) in `1bfcb6d`. Accepted as normal GIF-picker behaviour. |
| L5 | `isRateLimited` peeks differently in memory (blocked at the limit) and in MongoDB (blocked past it). Across several instances, one extra bad token per IP per window can be looked up. | Open, accepted: the effect is negligible. |
| L6 | **Biometric limits.** A night shift whose out punch is after the latest cutoff (06:00) splits into two days. A lone after-midnight punch becomes the day before's in time, and is marked late. Both are flagged as warnings in the preview. | Open, by design. Documented in the preview warnings. |
| L7 | **Not every webhook route caps its body.** Only Slack, inbound email and Recall stream-limit it (L13 on 9 Oct). The lead, Razorpay, Resend, Interakt, WhatsApp, OAuth register and whiteboard routes still buffer the whole body first. These routes predate this range, and Vercel caps bodies at 4.5 MB. | Open. A follow-up task was suggested in the session. |
| L8 | **A lost bank claim could leave an orphan receipt.** If a claim is lost after the receipt was recorded *and* cancelling that receipt then fails, the receipt stays while the row returns to the queue. | Open (two failures in a row). The receipt can be cancelled by hand. |
| L9 | **A Folio entity's own signature can be ignored.** An entity with a signature image but no signatory name falls back to the company's default signatory. | Open. The entity form does not yet require a name with the image. It only shows when someone uploads a signature without a name. |

### Checked and correct

**Signature and seal privacy**
- Their kinds fall through to "no" in `canOpenFile`, and the portal and Console file routes never reach them. The crawl confirmed this for every role.
- They are read only server-side, into PDF data URIs. Pages pass only booleans (`hasSignature`, `hasSeal`).
- A replaced image is kept, so issued letters reprint the same.

**`org.manage` and roles**
- Every company action needs `org.manage`. Signatory changes also need owner or admin (`canManageSignatories`).
- Letter-type defaults and the Form 130 signer only *pick* an existing signatory, which is HR's call by design.

**Uploads**
- The server sniffs the logo, signature and seal bytes (PNG or JPEG only, 1 MB).
- The browser rasterises SVG and WebP through an `<img>` and a canvas, so no script survives.
- Older logo kinds still never accept SVG, and every file response sends `nosniff`.

**Klipy proxy**
- HTTPS on Klipy's hosts only, with `redirect: 'error'`, a 10-second timeout, a GIF content type and a byte cap while streaming.
- The key goes only to Klipy, never to the browser or the logs.
- Search results are cached privately for 60 seconds. A hashed customer id is sent instead of the member.

**`postal-mime`**
- The request is cut off at 4 MB while streaming, and the raw message is capped at 4 MB.
- Nesting is capped at 20, with the library's header-size cap.
- Unreadable mail is ignored.

**M6 and M7**
- Only the address owner may send, unless an admin allows teammates. Reported SPF, DKIM and DMARC must pass.
- Reply addresses carry an HMAC of the enrolment id, compared in constant time. A reply stops only that enrolment.

**L5 (token families)**
- Every issued refresh token joins the family table. Reuse of any of them, or two uses at once, revokes the grant.
- A code replay revokes every grant the code made, including one made in a race.

**L9 (portal host cache)**
- Unknown hosts are answered from the 30-second verified set, without a database read.
- Slugs sit in a bounded map, and pending domains claim nothing.

**Multi-invoice bank match**
- Amounts are in paise. Allocations may not exceed the deposit; TDS is not counted as money received.
- `recordReceipt` re-checks each invoice's balance. TDS tolerance is ₹1 or 0.2% of the balance, and the TDS takes up the rounding.
- One client per split, at most 20 invoices, no duplicates.

**Biometric import**
- **Time zone:** device wall time is read as IST, and zoned stamps are converted to IST.
- **Night shifts:** punches before the cutoff (04:00 by default, 06:00 at most) belong to the day before. Out times of 24:00–29:59 become next-morning instants, so status, worked minutes and payroll (which reads status) are right.
- **Repeats:** punches within 2 minutes of the last kept one are dropped.
- **Single punches:** warned as a missing out.
- **Device ids:** compared without leading zeros. A clash is refused on the employee form, the CSV import and the mapping.
- **Scope:** visibility and the own-record rule apply. The run step re-reads the file and never trusts the preview.

**PDF builders**
- **Header:** legal name, trading name, address, CIN or LLPIN, GSTIN or "Not registered under GST", PAN, email, phone and website.
- **Signature block:** never split across pages, with the seal beside it.
- **Footer:** the "computer-generated, no signature needed" line prints only when there is no signature block.
- **Colours:** brand colours are darkened to 4.5:1 for headings and 3:1 for accents on white.

**Company profile validation**
- The GSTIN state must match the address state, and the PAN must be the one inside the GSTIN.
- CIN and LLPIN are checked by pattern.
- "Not registered" unsets the stored GSTIN.

**Folio entity fallback**
- Logo, email, phone, website and signatory each fall back to the profile only when the entity leaves them blank.

**Password reset script**
- `.local-test/reset-demo-logins.mts` is git-ignored, imported by nothing under `src/`, and refuses any database except `flowbit` on the local replica set.

**`/status`**
- It shows only working or not working, cron ages and labels.
- It has no hostnames, versions, drivers or errors. `/api/health` adds only the version, commit and storage driver name.

**Regressions**
- Invoice, quote, credit note, ledger, receipt, payslip, letter and Form 130 PDFs all render in the crawl.
- The template attendance import still checks rows, end to end.
- Posts keep composer types, polls, acknowledgements, scheduling, audiences, pins, reactions, mentions and the image lightbox. The redesign changed only layout, the media grid, text folding and the composer shortcuts. `/app/work/posts` and its links crawl clean for every role.

## What still needs real keys or a human with a browser

**Real keys**
- **Klipy:** no `KLIPY_API_KEY` on this server, so real search results, the picker and copying a GIF were not exercised.
- **Inbound email providers:** whether Resend's inbound payload carries SPF, DKIM and DMARC verdicts. If it does not, the owner-only rule rests on the `From` header plus the secret `tasks+` token. The same applies to a generic MIME provider's real `Authentication-Results`.
- **Biometric devices:** real eSSL and ZKTeco exports. The formats come from public docs and field samples; firmware column orders vary.

**A human with a browser**
- **Company profile:** uploading an SVG or WebP logo and a photographed signature (canvas conversion, "Remove background"), and how they look on printed PDFs.
- **Posts:** the redesigned feed, composer shortcuts, media grid and Read more on a phone.
- **Biometric:** the column-mapping UI.
- **Bank:** the split dialog's live totals.
- **Settings:** the 2FA Set up button.

**Specialist review**
- Form 130 signer wording and PDF legal text need a CA's review.

## Left running

- **Port 4500:** `next start` of `.next-night5` against `flowbit_v2night`, from `.local-test/serve-night5.sh`, left up for the owner's demo.
- **Removed:** `.next-night4` and `.next-night`.
- **Fixtures:** removed with `v2-setup.mts --db flowbit_v2night --cleanup`. Afterwards there were no crawl sessions, signatories, signature files, tasks, enrolments, August attendance or biometric ids left. The audit rows the crawl wrote were removed too.
- **Not touched:** port 4400, the `flowbit` and `flowbit_v2demo` databases, and `.next`, `.next-v2` and `.next-check*`.
