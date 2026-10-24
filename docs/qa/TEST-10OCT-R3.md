# Flowbit 2.0 QA, reviewer 3 of 3 (10 Oct 2026): robustness, security and data

**Scope:** angles 21–30.

**How this review was done**
- It was read-only. No code was changed, nothing was written to any database, there were no builds and the full suite was not run.
- The only runtime checks were:
  - safe GET requests against the demo at `127.0.0.1:4500` (`flowbit_v2night`), using the minted member and owner sessions (tokens never printed);
  - small scratch `node`/`tsx` snippets run against pure functions.
- `check-in-widget.tsx` and the clock files were not touched.
- Findings already marked fixed or accepted in `V2-REVIEW.md`, `V2-NIGHT-CHECK.md` and `V2-RECHECK-10OCT.md` are not repeated here.

**Totals:** 0 CRITICAL, 2 HIGH, 10 MEDIUM, 27 LOW.

## Fix round B status (11 Oct 2026)

| # | Sev | Status |
|---|---|---|
| H1 | HIGH | Fixed 4056c0c. Key rebuilt server-side from the file id; strict key regex; `safeKey()` in the local, S3/R2 and presign paths. |
| H2 | HIGH | Fixed a927e5e, a526413. 16-character limit checked when a series is saved and when a number is issued; short FY option; new defaults fit; e-invoice refuses instead of clipping. Migration note: `docs/migrations/2026-10-folio-16-char-numbers.md`, script `scripts/folio-long-series.ts`. |
| M1 | MEDIUM | Fixed 4056c0c |
| M2 | MEDIUM | Fixed 0e9cb31 (invite-only teams; existing teams stay open until a manager ticks it) |
| M3 | MEDIUM | Fixed d9401fb, c32b605 |
| M4 | MEDIUM | Fixed ca53c47 |
| M5 | MEDIUM | Fixed 4fb3614 |
| M6 | MEDIUM | Fixed ca53c47, cd78258 |
| M7 | MEDIUM | Fixed 900767b, b2676be. The Resend SDK takes no timeout option, so it is not wrapped (a race wrapper could send twice). |
| M8 | MEDIUM | Fixed 17a4586, cbdb207 |
| M9 | MEDIUM | Fixed e827405 |
| M10 | MEDIUM | Fixed 11c64ea |
| L-21a | LOW | Fixed 58f8ba0 |
| L-21b | LOW | Fixed 521b14e |
| L-21c | LOW | Fixed 53a6bc9 |
| L-21d | LOW | Fixed e7bed9f |
| L-23a | LOW | Fixed 560c575 |
| L-23b | LOW | Fixed 1136e5f |
| L-23c | LOW | Fixed 3ba9331 |
| L-23d | LOW | Fixed 07e08b7 |
| L-23e | LOW | Fixed f33c62f |
| L-23f | LOW | Fixed c767778 |
| L-23g | LOW | Fixed 97f3b7a, 5400951 |
| L-24a | LOW | Fixed d6c7791 |
| L-25a | LOW | Fixed 8be1c80 |
| L-25b | LOW | Fixed a794118 |
| L-25c | LOW | Sec 34 warning fixed 8be1c80. Credit-note e-invoice (CRN) Deferred: needs a new payload, IRN fields on CreditNote, GSP calls and UI. |
| L-26a | LOW | Fixed e683ab5 |
| L-26b | LOW | Fixed 32ef3b2 |
| L-27a | LOW | Fixed 2f80d5d |
| L-27b | LOW | Fixed 56ccca8 |
| L-27c | LOW | Fixed faf2427 |
| L-27d | LOW | Fixed 5a6d270 |
| L-28a | LOW | Fixed faf2427 |
| L-28b | LOW | Fixed 0ca0ffe |
| L-28c | LOW | Fixed 11c64ea, b952827 |
| L-30a | LOW | Fixed a77a459 |
| L-30b | LOW | Fixed 5400951 |
| L-30c | LOW | Fixed c8ff322 |

**Verification:** every finding below was confirmed in the code at the line given. For H1, N1, N2, N3, N4 and N5, the lead reviewer also re-read the code and re-ran the evidence.

---

## Summary table

| # | Sev | Angle | Finding | Where |
| --- | --- | --- | --- | --- |
| H1 | HIGH | 24 | Path traversal in the recording upload key: a member can read and delete another workspace's files (local storage driver) | `modules/work/meetings/ai/actions.ts:66-71`, `lib/files.ts:68-70` |
| H2 | HIGH | 25 | Folio document numbers can exceed 16 characters, and the e-invoice payload silently clips them | `folio/engine/numbering.ts:31`, `folio/einvoice/payload.ts:80` |
| M1 | MED | 24 | Presigned recording upload: no real size limit, and the recorded size is whatever the client says | `meetings/ai/actions.ts:50-71`, `lib/storage/presign.ts` |
| M2 | MED | 21 | Any member can self-join any team, which opens team-targeted posts, polls and policies to everyone | `work/teams/actions.ts:127-138` |
| M3 | MED | 26 | Hinglish "raat 12/1/2/3 baje" resolves to the afternoon or noon | `work/tasks/quick-parse-dates.ts:37`, lines 98–107 |
| M4 | MED | 27 | The notetaker pick-up is marked done before the download, so any failure loses the recording for good | `meetings/ai/bot.ts:99-121` |
| M5 | MED | 29 | A Resend API error on inbound mail answers 200 "ignored", so the task or sequence reply is lost | `connectors/email/adapter.ts:122-123`, `api/inbound/email/route.ts:28-29` |
| M6 | MED | 27 | A double "Send notetaker" books two Recall bots; one is orphaned and records the meeting | `meetings/ai/bot.ts:59-80` |
| M7 | MED | 29/28 | Most provider calls have no fetch timeout, so one hung call holds the cron lease | Razorpay, Recall, Sarvam, IndiaMART, Resend inbound, Google sign-in (list below) |
| M8 | MED | 30 | The workspace tombstone keeps the company profile (PAN, CIN, legal name, email, phone), signatories, office geofences, UTM and DPA signer | `lifecycle/purge-store.ts:21` |
| M9 | MED | 30 | DPDP erase of a client contact leaves their `PortalContact` (email, name), which can still sign in to the portal | `privacy/core.ts:85-88`, `privacy/store.ts:31` |
| M10 | MED | 30 | Deleting only the transcript makes the recording exempt from retention purge forever | `meetings/ai/actions.ts:200`, `meetings/ai/purge.ts:16,26` |

The LOW items are listed under each angle.

---

## 21. Authorisation matrix

**What was checked**
- Every exported function in the 131 `'use server'` files, with its resolved `perm` / `anyPerm` options (including shared constants). Every action without a permission was then read by hand.
- `action()` in `lib/actions.ts` (2FA, blocked, product, feature, permission, read-only) and `consoleAction` (staff permission).
- The Console billing, accounts, CRM, import, staff, wallet and breach actions.
- Company profile and signatories (`org.manage` plus `canManageSignatories`).
- Biometric import (`attendance.manage` plus `visibleEmployeeIds`).
- Folio: bank, Tally, e-invoice and reports.
- Custom domains, sequences (`editableSequence`, `leadAccess`), posts, polls, kudos, acks and replies (all through `loadPost`).
- The portal (`portalCanReadFile`), reports routes, Slack, inbound email, outbound webhooks, MCP consent, apply and undo, Meetings AI (`assertParticipant`), and the public claim form.

**Demo probes (member session)**
- 403 on settings export, audit export, privacy export, Tally, people export, leads export, P&L CSV, Work reports and attendance export.
- 401 on Console reports.
- `/api/work/gifs` returns 404.
- Anonymous requests got 401 on every report and export route tried.

**Findings**

**M2. MEDIUM. Authorisation (audience bypass). Any member can join any team.**
- Where: `src/modules/work/teams/actions.ts:127-138`. `joinTeam` has no permission check and only refuses inactive teams.
- Post audiences of type `groups` read the current Team membership (`work/posts/audience.ts:51-55`, `access.ts:17-24`).
- So a member can join "Leadership" and at once read every past and future announcement, policy and poll aimed at it. They can also vote, ack, reply, and open its images through `/api/files` (`post_image` → `loadPost`).
- Self-join predates audiences (`docs/specs/work.md:567`).
- Fix, one of:
  - add a `joinable` / `private` flag per team and refuse self-join on private teams;
  - count only members added by `teams.manage` for post audiences;
  - at minimum, warn in the composer that team audiences are self-joinable.

**LOW findings**
- **L-21a. Integrity: an Orbit activity's `contactId` is not checked against its client** (`src/modules/orbit/related.ts:27`).
  - Deals check the contact (`deals.actions.ts:36-40`, `assertContact`); activities don't.
  - So a member can attach an activity to another client's contact in the same workspace, and it shows on that contact's timeline.
  - Fix: in `resolveRelated`, accept the contact only when `Client.exists({_id: rel.clientId, 'contacts._id': contactId})`.
- **L-21b. Scheduled posts are published by the cron without re-checking anything at publish time** (`src/modules/work/posts/publish.ts:53-71`).
  - It does not check workspace state (the same gap T1 fixed for automations).
  - It does not check that the author is still active.
  - It does not check that the author still holds moderator rights for announcement and policy posts.
  - So a removed or demoted author's scheduled announcement still goes out and notifies everyone.
  - Fix: before publishing, load the org and the author. Skip or fail the post when either is no longer valid.
- **L-21c. Sensitive file access (possibly by design): Folio entity signatures can be downloaded** (`src/modules/files/access.ts:110-112`).
  - The `folio_signature` kind opens for `folio.read`, `quotes.write` or `folio.settings`, so Sales and any Folio reader can download the raw signature image.
  - Company signatures and seals return `false` here.
  - Fix: return `false`, or require `folio.settings` if the settings preview needs the image.
- **L-21d. Data exposure policy: every `member` can bulk-export the client list as CSV**
  - Where: `src/app/api/orbit/clients/export/route.ts:20`, which needs only `clients.read`, held by the base member role (`lib/permissions.ts:87`).
  - The export has up to 10,000 rows, with GSTIN, PAN, email, phone and primary contact.
  - Demo: the member session got 200 `text/csv`. The leads export is refused for the same member.
  - Fix: require `clients.write` or a `clients.export` permission, or confirm this is intended.

---

## 22. Tenancy isolation

**What was checked**
- Every `find`, `findOne`, `findById`, `updateOne` and `aggregate` call that is not made through `ctx.db` and does not include `orgId`.
- The ones reachable from user input, webhooks, crons, imports, exports, MCP, the portal and DocLinks were read by hand.

**Results**
- Unscoped reads are system collections: RateLimit, CronLock, and tokens or links looked up by hash. A few re-read a record already loaded under scope.
- The cron and webhook paths re-scope with `forOrg(orgId)` or `scoped()`:
  - the sequence runner and the reply handler;
  - the outbound webhook endpoint lookup (`orgId: delivery.orgId`);
  - meetings purge;
  - WhatsApp ticks.
- Client-supplied ids are checked against the org:
  - bank account against its entity;
  - invoices against the transaction's entity;
  - signatory ids within `ctx.org.signatories`;
  - mentions and featured members through `assertActiveMembers`;
  - images through `claimImages`;
  - task relations through `createTaskRecord`.
- Slack installs are unique per `teamId`, and a team already owned by another org is refused.
- Custom domains have a cross-workspace check on verified hosts.
- The export (`lifecycle/export-source.ts`) and the privacy store filter by `orgId`.
- **Exception:** the storage key path in **H1** (angle 24) breaks isolation at the file layer.

No further findings.

---

## 23. Input handling

**What was checked**
- **zod on actions.** v2 actions use the `objectId` zod type: posts, polls, kudos, sequences, e-invoice, bank, biometric, signatories, domains, webhooks, Slack and GIF. The unwrapped exported actions run `safeParse`. Routes check ids with `isValidObjectId`.
- **`dangerouslySetInnerHTML`.** There are only three uses:
  - FAQ JSON-LD, with `<` escaped;
  - the manual HTML, which is static build-time content;
  - `themeCss`, built from hex-validated values.
  Posts, comments and replies render as React text.
- **Email.** `emailLayout` escapes its content, automation `{{vars}}` land in escaped paragraphs, sequences escape the body, and the Gmail MIME builder strips CR/LF from headers.
- **CSV.** Every export uses `formulaSafe`, `PAPA_SAFE` or a guarded `csvCell`, except L-23f.
- **Tally XML.** `xmlEscape` handles `& < > " '` and removes invalid control characters. Lone surrogates and U+FFFE/U+FFFF are not stripped (negligible).
- **ReDoS.**
  - Quick-add and Hinglish parsing split words and use anchored `\d{1,2}`.
  - The biometric `DAT_LINE` and `TRAILING_TIME` patterns are linear.
  - Input is capped: 3 MB, 50,000 rows, and 40 MB inflated XLSX.

**LOW findings**
- **L-23a. Lead-capture `website` is not URL-validated** (`src/modules/orbit/capture/map.ts:97`).
  - It comes in through the public form or webhook and is rendered as `<a href>` (`components/orbit/lead-details-form.tsx:45,53`).
  - React 19 blocks `javascript:`, so this is defence in depth.
  - Fix: `isWebUrl(normaliseUrl(v))`.
- **L-23b. A meeting link accepts any scheme** (`src/modules/work/meetings/actions.ts:18`).
  - zod `z.string().url()` accepts `javascript:` and `data:`.
  - The link is rendered at `meeting-card.tsx:47` and `activity-row.tsx:85`, and also goes into invite emails and the Google Calendar location.
  - Fix: `.refine(u => /^https?:\/\//i.test(u))`, as `attachment-actions.ts:41` does.
- **L-23c. Email `href` attributes are not escaped**
  - Where: `src/lib/mail.ts:133`, `messaging/templates.ts:60`, `briefs/render.ts:16`.
  - Today every href is built by the app, so this is latent.
  - Fix: `escapeHtml(absoluteUrl(...))`.
- **L-23d. Header injection: the people export reflects `status` into `Content-Disposition` without quoting**
  - Where: `src/app/api/muster/people/export/route.ts:20,38`, `filename="people-${status}.csv"`.
  - A crafted link can rename an HR user's download. CR/LF throws, so there is no header splitting.
  - Fix: whitelist `status`, or use `contentDisposition()`.
- **L-23e. The claim reviewer's note is double-escaped** (`src/modules/muster/claims/decide.ts:32`).
  - `escapeHtml(note)` is passed into `emailLayout`, which escapes again, so `&` shows as `&amp;amp;`.
  - Fix: drop the inner escape.
- **L-23f. The HR reports CSV formula guard misses a leading tab or CR**
  - Where: `src/modules/muster/reports/csv.ts:9` uses `/^[=+\-@]/`.
  - Fix: reuse `formulaSafe` from `lib/csv-safe.ts`.
- **L-23g. Some arrays in action inputs have no count cap**
  - `webhooks/actions.ts:30` and `connectors/slack/actions.ts:17`: `events` arrays with no max.
  - `work/posts/actions.ts:27-38`: `listOf` targets, mentions and featured members with no max.
  - The ~11 MB body cap bounds them.
  - Fix: add `.max()` and dedupe.

---

## 24. Files and uploads

**What was checked**
- Every `saveUpload` call has an `accept` list with no SVG or HTML. The size is checked before buffering, and `saveFile` has a 25 MB ceiling.
- Company logo, signature and seal are sniffed.
- `/api/files/[id]` and the Console force a download for svg, html, xml and js. Every file response sends `nosniff`, and `contentDisposition()` strips quotes and CR/LF.
- The portal always downloads. The public brand logo serves PNG and JPEG only, by a random key.
- Server-built keys have the form `<orgId>/<yyyy-mm>/<id>-<safeName>`.

**HIGH finding**

**H1. HIGH. Path traversal and cross-tenant file read/delete in `finishRecordingUpload`.**
- **Where:**
  - `src/modules/work/meetings/ai/actions.ts:66-71`: the key is a client-supplied `z.string().min(10).max(400)`.
  - `src/lib/files.ts:68-70` (`registerUploadedFile`).
  - `src/lib/storage/local.ts:17-21`.
- **Evidence:**
  - The key is checked only with `startsWith(orgId + '/')` and `includes('/' + fileId + '-')`.
  - `normaliseKey` (`storage/types.ts:28`) only flips backslashes and strips leading slashes.
  - The local driver's `resolve` only keeps the path inside the storage root, not inside the org's own folder.
  - Re-run by the lead reviewer: `<orgA>/2026-10/<newId>-x/../../../<orgB>/2026-09/<fileId>-payslip.pdf` passes both string checks and resolves to `root/<orgB>/2026-09/<fileId>-payslip.pdf`.
- **What an attacker gets:**
  - The new `StoredFile` row (org A, kind `meeting_recording`) points at org B's bytes.
  - `/api/files/<newId>?download=1` serves them to the attacker, who is a participant in their own meeting.
  - The bytes are also sent to the transcription provider.
  - `deleteMeetingAiData` and the retention purge then delete org B's file.
- **Preconditions:**
  - Meetings AI is enabled and `STORAGE_DRIVER` is local (the default, used by single-server hosting and this demo).
  - `finishRecordingUpload` never checks the driver.
  - The attacker needs the victim's org id, month and file id. `exists()` acts as a guessing oracle.
- **S3/R2:** this case was not verified. Keys are usually literal, but whether the SDK or the edge normalise `..` was not checked.
- **Fix:**
  - Never accept the key from the client. Rebuild it as `storedFileKey(orgId, fileId, name)`, or HMAC-sign `{fileId, key}` in `prepareRecordingUpload`.
  - Refuse `..`, `\` and `//`, and match `^<orgId>/\d{4}-\d{2}/<fileId>-[A-Za-z0-9._-]+$`.
  - Refuse unless the driver is s3.
  - In `localDriver.resolve`, also refuse any key whose normalised form differs from the input.

**MEDIUM finding**

**M1. MEDIUM. Presigned recording upload has no size enforcement.**
- Where: `src/modules/work/meetings/ai/actions.ts:50-71` and `src/lib/storage/presign.ts`.
- The PUT URL signs only `host` with UNSIGNED-PAYLOAD and is valid for 15 minutes, so any size can be uploaded.
- `registerUploadedFile` stores the client's `input.size` without a HEAD check.
- So the 200 MB cap can be bypassed, storage can be run up, size accounting is wrong, and oversized files go to the transcription provider.
- Fix: HEAD the object, refuse and delete it when it is over the cap, and store the real size. Or use a presigned POST with `content-length-range`.

**LOW finding**
- **L-24a. The Folio entity logo and signature trust the browser's MIME type**
  - Where: `src/modules/folio/settings/entity-actions.ts:22,54,153`.
  - There is no `sniffPdfImage`, unlike `company-actions.ts:33`. The bytes are embedded in PDFs as `data:image/png` (`components/folio/pdf/assets.ts:10-15`).
  - A bad file may break that firm's PDFs. This needs `folio.settings`, so it is self-inflicted.
  - Fix: sniff the bytes.

---

## 25. Money maths

**What was checked**
- Paise integers:
  - `lib/money.ts` `parseRupees` (Math.round, strict regex);
  - Folio `engine/money.ts` and payroll `money.ts`;
  - no `parseFloat` on amounts anywhere;
  - invoice rates are limited to 2 decimals.
- GST engine (`engine/totals.ts`):
  - per-line tax;
  - CGST levelled to equal SGST, so they sum exactly;
  - one round-off;
  - TDS on the taxable value;
  - reverse charge excluded from the total.
- Supply type comes from the entity's state, and the entity GSTIN must match that state.
- Gapless numbering per entity, kind and FY, taken inside the issue transaction, with a unique `(orgId, entityId, number)` index.
- Flowbit's own series is per GSTIN and FY.
- Bank TDS tolerance.
- The wallet debit is one guarded pipeline in a transaction with a unique ledger key, so it cannot go negative or double-charge.

**HIGH finding**

**H2. HIGH. GST compliance and e-invoice correctness: document numbers over 16 characters.**
- **How the numbers are built:**
  - `src/modules/folio/engine/numbering.ts:31` builds `${prefix}/${fy}/${seq}` with the full FY label "2026-27".
  - Entity codes may be 2–10 characters (`models/folio/Entity.ts:66`), and series prefixes up to 12 (`folio/settings/schemas.ts:12`).
  - The default credit-note prefix is `${code}-CN` (`folio/counter.ts:37`).
- **What that produces:**
  - Any entity code of 4+ characters gives invoice numbers of 17+ characters, e.g. `ACME/2026-27/0001`.
  - Every default credit-note number is 18+ characters.
  - CGST Rule 46(b) and the IRP cap document numbers at 16.
- **The e-invoice payload clips them:**
  - `src/modules/folio/einvoice/payload.ts:80` sends `No: clip(inv.number, 16)`.
  - So `ACME/2026-27/0001` and `ACME/2026-27/0002` both go out as `ACME/2026-27/000`: a duplicate rejection, or an IRN on the wrong number.
  - The `DOC_NO` check (line 143) runs on the clipped value, so it never fires.
- Flowbit's own series already enforces 16 characters (`billing/series.ts`); customer Folio series do not.
- **Fix:**
  - Validate `prefix + fy + padding + 2 <= 16` when the entity and series are saved, or use the short FY "26-27".
  - Shorten the default credit-note prefix.
  - Make `buildIrnPayload` add a problem instead of clipping.

**LOW findings**
- **L-25a. Credit-note round-off can make a full credit impossible** (`src/modules/folio/credit-notes/service.ts:70-81`). Low to medium.
  - Each note is rounded to whole rupees on its own.
  - Scratch run of `computeInvoice`: on a ₹1,180 invoice, a ₹0.42-taxable note rounds to ₹1. Crediting the rest then prices at ₹1,180 against ₹1,179 outstanding and is refused.
  - The reverse case strands ₹1.
  - Fix: in full mode, set the round-off so the note's total equals the outstanding amount.
- **L-25b. Issue doesn't re-check place of supply** (`src/modules/folio/invoices/lifecycle.ts:67-71`).
  - Issue refuses only GSTIN changes. If an unregistered client's state, or a billing-profile place of supply, changed after the draft was saved, the CGST/SGST vs IGST split can be stale.
  - Fix: recompute `clientStateCode` at issue.
- **L-25c. Compliance gap: credit notes have no e-invoice (CRN) path and no Sec 34 time-limit warning**
  - Where: `src/modules/folio/einvoice/*`, `createCreditNote`.

---

## 26. Dates and time

**What was checked**
- The `lib/dates.ts` IST helpers and `addPeriod`.
- Announcement expiry stored as 23:59:59+05:30.
- Month locks on leave, corrections, imports and holidays.
- Retainer generation `asOf` in IST.
- Every `vercel.json` schedule against its IST intent: reminders 08:00, follow-ups 08:15, Folio 09:00, billing 09:15, trials 09:30, lifecycle 10:00, health 01:30, each with a +3 h catch-up.
- `cron.ts` `asOf = todayIST()`.
- The Hinglish parser uses the IST "now" for aaj, kal, parso, weekdays, "12am", "5 baje" and "shaam 6".

**MEDIUM finding**

**M3. MEDIUM. Parsing: "raat 12/1/2/3 baje" resolves to the afternoon.**
- `src/modules/work/tasks/quick-parse-dates.ts:37` gives `raat` and `night` `{pm: true}`, and `matchTime` (lines 98–107) adds 12 to any hour below 12.
- Scratch run of `parseWhen` (shared by Slack, quick-add, inbound email and MCP):
  - "raat 1 baje" → 13:00;
  - "kal raat 1 baje" → tomorrow 13:00;
  - "raat 12 baje" → 12:00 noon.
- "midnight" is not recognised.
- Fix:
  - With raat or night, 12 means 00:00 on the next day, and 1–4 mean early morning (the next day when the day is "aaj").
  - Add "midnight".
- By design (LOW): at 00:30 IST, "kal" is the next calendar day. Consider showing a hint.

**LOW findings**
- **L-26a. Some exports print the UTC calendar day for an instant**, so 00:00–05:30 IST shows the day before.
  - `src/modules/console/reports/csv.ts:46` (renewals `periodEnd`).
  - `src/modules/muster/reports/builders.ts:63` (leave "decided on").
  - Fix: `isoDateIST()`.
- **L-26b. Health windows include the IST day that has only just begun** (`src/modules/console/health.ts:47`).
  - The cron runs at 01:30 IST and scores "as of" today, so each "last N days" window is about 1.5 hours plus N−1 full days. That biases scores toward Amber and Red.
  - Fix: score as of yesterday.

---

## 27. Concurrency and idempotency

**What was checked**
- Import and MCP undo use an atomic `done→undone` claim.
- MCP apply uses an atomic `appliedAt: null` claim.
- Policy ack uses a conditional `$push`.
- Poll votes use an `updatedAt` optimistic lock.
- The sequence daily cap is an atomic `$inc` with the cap in the filter, backed by a unique `(orgId, memberId, day)` index.
- Enrolments are claimed per row, posts publish is claimed on `published: false`, and briefs are claimed on `lastSentFor`.
- The Razorpay BillingEvent and PaymentEvent unique keys.
- The lead webhook dedupes on `externalId`.
- The Sarvam callback is guarded by status ≠ done.
- The Recall webhook is Svix-verified and botId-matched.

**MEDIUM findings**

**M4. MEDIUM. Data loss: a notetaker recording is lost if any step after the claim fails.**
- Where: `src/modules/work/meetings/ai/bot.ts:99-121`.
- `notetaker.fetchedAt` is set and `status` becomes `done` *before* the audio is fetched. The audio fetch (line 112) has no timeout and no try/catch, and is followed by `saveFile` and `startTranscription`.
- Nothing retries after a failure:
  - the cron requires `'notetaker.fetchedAt': null` (`meetings/ai/job.ts:37`);
  - the manual button answers "already" (line 95).
- Also, `res.arrayBuffer()` buffers up to 200 MB before the size check.
- Fix:
  - Use a transient `fetching` claim with an expiry, and mark it done only after the transcription has started. Release the claim on error.
  - Add a timeout and a Content-Length pre-check.

**M6. MEDIUM. Race and privacy: a double "Send notetaker" books two Recall bots.**
- Where: `src/modules/work/meetings/ai/bot.ts:59-80`.
- The guard is a read (line 59). `provider.schedule()` and the consent mail both run before the `$set` (line 79).
- Two concurrent submits:
  - both book bots and both send the consent email;
  - the first bot still joins and records, but its webhooks are ignored because the botId no longer matches;
  - `cancelNotetaker` cannot cancel it.
- If the mail step throws after `schedule()`, the bot also stays booked with nothing stored.
- Fix:
  - Claim atomically first (`notetaker.status: 'booking'`), then book.
  - Cancel the bot if a later step fails.

**LOW findings**
- **L-27a. Duplicate tasks from Slack modal submits or inbound-email retries**
  - Where: `connectors/slack/service.ts:133-137`, `connectors/email/service.ts:101-110`.
  - The `McpIdempotency` row is checked, then the task is created, then the row is written. So two concurrent deliveries both create a task.
  - Fix: insert the claim row first, and treat duplicate key 11000 as a duplicate.
- **L-27b. A double click can send the policy-ack reminder twice** (`work/posts/engage-actions.ts:55-61`).
  - The `ackRemindedAt` check is a read, followed by an unconditional `$set`.
  - Fix: a conditional update, and notify only when `modifiedCount` is 1.
- **L-27c. Sequences: the Gmail send path is not idempotent** (`orbit/sequences/delivery.ts:42-48`, `runner.ts:85,143`).
  - If the step does not advance after a Gmail send that succeeded (a timeout, a function kill, or a throw in `Activity.create`), the lead gets the same email again after the claim or retry delay.
  - The daily-cap slot is not returned on the throw path.
  - Fix:
    - Mark "sending step N" before calling Gmail.
    - Advance first, and write the Activity best-effort.
- **L-27d. Minutes are never drafted after one failure** (`meetings/ai/pipeline.ts:89-100`).
  - The transcript flips to done first, so neither the callback redelivery nor the stuck-transcript cron retries the draft.
  - Fix: a `minutesDraftedAt` marker and a sweep.

---

## 28. Background jobs

**What was checked**
- Every `vercel.json` path, including the 7 `?resume=1` entries, maps to a route under `src/app/api/cron/*` that uses `cronHandler`, with `maxDuration = 300` and the node runtime.
- `cron-auth.ts` fails closed (503 without `CRON_SECRET`) and compares in constant time.
- The lease (`lib/lease.ts`) is a conditional upsert with 11000 handling, and `LEASE_MS` (15 min) is longer than `maxDuration`.
- `eachOrg` has a 240 s budget and resumes from saved progress. Messages, automations and briefs have 200 s budgets.
- Destructive jobs default to a dry run: `LIFECYCLE_DELETE_ENABLED`, `RETENTION_PRUNE_ENABLED` and `MEETINGS_PURGE`.
- There is no `while(true)` anywhere in `src`.
- `/api/folio/cron` is correctly not in `vercel.json`, and is HMAC-authenticated in constant time.

**LOW findings**
- **L-28a. Time budget: the sequences cron has none** (`orbit/sequences/runner.ts:126-148`, `api/cron/sequences/route.ts`).
  - It runs up to 300 enrolments plus the Gmail reply check, with no deadline, unlike the other 5- and 15-minute jobs.
  - Fix: a `TIME_BUDGET` check in the loop.
- **L-28b. Error handling: `/api/folio/cron` has no try/catch** (`src/app/api/folio/cron/route.ts:14-18`).
  - A throw returns Next's bare 500.
  - Fix: reuse the `cronHandler` body.
- **L-28c. Time budget: per-org loops without a deadline**
  - The IndiaMART loop (`orbit/capture/indiamart-job.ts:68`) and the meetings purge (`meetings/ai/purge.ts:21`) have no deadline. Together with M7, one slow provider can use up the function's time.

---

## 29. Integration failure modes

**What was checked**
- Klipy, Google API, Slack, Vercel domains and email attachment fetches have timeouts and catch non-JSON responses.
- The GSP client has a 30 s absolute deadline and handles a duplicate IRN (2150).
- All three Razorpay clients use `res.json().catch()`.
- `ProviderError` is not a `UserError`, so users see a generic message. Only Razorpay's `description` text reaches users.
- No logs of auth headers, keys or tokens were found.
- Interakt is behind its flag.

**MEDIUM findings**

**M5. MEDIUM. Lost webhook: a Resend API error drops inbound mail silently.**
- Where: `src/modules/connectors/email/adapter.ts:122-123` returns `null` on a non-2xx response, and `src/app/api/inbound/email/route.ts:28-29` then answers `200 {status:'ignored'}`.
- So Resend never redelivers after a 429 or 5xx. The email-to-task request is lost, and so is a sequence reply. The sequence then keeps emailing a lead who already replied.
- The fetch has no timeout.
- Fix:
  - Throw, or return an "upstream unavailable" result, so the route answers 5xx and Resend retries. Keep 200 "ignored" only for wrong event types.
  - Add `AbortSignal.timeout(10_000)`.

**M7. MEDIUM. Timeouts: most provider calls have no fetch timeout.**
- **Where:**
  - Razorpay: `subscription/razorpay.ts:18`, `billing/razorpay-client.ts:28`, `payments/razorpay-links.ts:42`
  - Recall: `meetings/ai/recall.ts:79,99`
  - Sarvam: `meetings/ai/sarvam.ts:19,73,93`
  - the notetaker audio download: `bot.ts:112`
  - IndiaMART: `orbit/capture/indiamart-job.ts:39`, via `whatsapp/platform-sender.ts:17`
  - Resend inbound: `adapter.ts:122,125`
  - Google sign-in: `lib/auth/google.ts:28,42`
  - the Resend SDK: `messaging/store.ts:32`
- **Evidence:**
  - There is no `AbortSignal` and no global dispatcher, and undici's default timeouts are about 300 s, the same as `maxDuration`.
  - The time-budget checks run only between rows, so one hung call runs until the function is killed.
  - The lease then stays held for 15 minutes, which blocks the next 2–3 runs of the 5- and 15-minute jobs.
- **Fix:** one shared `fetchWithTimeout` helper (8–15 s) for every provider client.

**Unverified:** whether `MeetingTranscript.error`, which holds up to 200 characters of a provider response, is shown in the UI.

---

## 30. Data lifecycle and privacy

**What was checked**
- The registry test (`lifecycle/registry.test.ts`) catches every `defineModel` under `src/models`. Every model file uses `defineModel`, and the v2 collections are all listed.
- Exported and non-exported flags are right for secrets: webhook, Slack and Google tokens, OAuth and portal hashes.
- TTL indexes for the short-lived collections. The retention prune covers message and processing logs at 395 days, as a dry run by default.
- The meetings purge is a dry run by default.
- Per-person erase for leads, contacts and members.
- Consent and suppression: sequences check suppression and carry RFC 8058 headers.
- Audit coverage:
  - company actions 7 of 7;
  - domains, webhooks, e-invoice and Slack audited;
  - bank import, match, split, expense and undo audited;
  - `ignoreTxn`, sequence `unenrollLead` and `markReplied` not audited (minor).
- The demo password-reset script is git-ignored and imported by nothing under `src/` (checked in the recheck, unchanged).

**MEDIUM findings**

**M8. MEDIUM. DPDP and retention: the deletion tombstone keeps v2 personal and business data.**
- Where: `src/modules/lifecycle/purge-store.ts:21`.
- `ORG_PERSONAL` unsets the logo, theme, address, GSTIN, PAN and billing. It does **not** unset these, all on the Org (`models/Org.ts:217-218` and the fields below them):
  - `profile`: legal name, trade name, printed PAN, CIN/LLPIN, email, phone, website;
  - `signatories`: names and designations;
  - `attendanceGeo.offices`: office latitude and longitude;
  - `signupUtm`;
  - `dpa.acceptedBy`;
  - `security`, `breakTypes` and `brandKey`.
- The purge docs promise a tombstone with "no personal data" (`purge.ts:27`).
- Fix:
  - Add these fields to `ORG_PERSONAL`.
  - Add a test that fails when a new Org field is neither in an allowlist nor in the unset list.

**M9. MEDIUM. DPDP: erasing a client contact leaves their portal account.**
- Where: `src/modules/privacy/core.ts:85-88`, with the store model map at `privacy/store.ts:31`.
- `PortalContact`, which holds email, name and `lastSignInAt`, is not among the erasure steps.
- Portal contacts can only be revoked, never deleted (`portal/agency-actions.ts:86`).
- After an "erase", the person's email stays and, if the contact is still active, they can still sign in to the portal.
- The per-person export (`searchPersonalData`) also misses `PortalContact`, `SequenceEnrollment` and `MeetingTranscript` speaker names.
- Fix:
  - Add a `PortalContact` step, matched by email: delete it, plus its `PortalSession` and `PortalCode` rows.
  - Include it in the per-person export.

**M10. MEDIUM. Retention: a recording survives forever once its transcript is deleted.**
- `deleteMeetingAiData(what: 'transcript')` (`src/modules/work/meetings/ai/actions.ts:198-200`) deletes the transcripts and unsets `ai.transcriptId`, but keeps the recording.
- The purge job then misses that recording in two ways (`meetings/ai/purge.ts`):
  - it only walks orgs with transcripts (`MeetingTranscript.distinct('orgId')`, line 16);
  - it only selects meetings with `'ai.transcriptId': {$ne: null}` (line 26).
- The bot's consent notice promises "kept for N days and then deleted" (`bot.ts:70`).
- Fix:
  - Walk orgs with any `ai.recordingFileId`.
  - Select meetings with `$or: [{'ai.transcriptId': {$ne: null}}, {'ai.recordingFileId': {$ne: null}}]`.

**LOW findings**
- **L-30a. Export completeness: the workspace export omits the v2 Org data** (`src/modules/lifecycle/export-source.ts:9`).
  - `WORKSPACE_FIELDS` leaves out `profile`, `signatories` (and their file ids), `attendanceGeo`, `breakTypes`, `security` and `meetingsAi`.
  - Fix: add them.
- **L-30b. Secret in the audit log: removing a webhook logs its full URL** (`src/modules/webhooks/actions.ts:99`).
  - The summary is `Removed webhook ${row.url}`. Create and update log only the host (`edit-rules.ts:22-37`).
  - Webhook URLs often carry tokens (Zapier, Slack incoming hooks), and the audit log is exported and visible to `audit.read`.
  - Fix: log `new URL(row.url).host`.
- **L-30c. Retention: `ImportBatch.restore` keeps full copies of documents forever**
  - Where: `src/models/imports/ImportBatch.ts`. `restore.docs` (attendance days, superseded corrections) is never cleared after `undoUntil` (7 days). Nothing prunes it.
  - Fix: unset `restore` once `undoUntil` has passed, in the lifecycle cron.

---

## Not verified here
- Whether the S3 or R2 SDK and edge normalise `..` in keys, which decides whether H1 also applies on S3.
- Whether @react-pdf throws or skips a non-image that claims to be PNG (L-24a).
- Every Console billing and incidents schema line by line; these were sampled only.
- Server-side double-submit dedupe for invoice, kudos and post creation. No idempotency token was seen; the UI pending state was assumed.
