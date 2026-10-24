# Flowbit night build final check (9 Oct 2026)

This is step 9, the last step of the overnight build. It checks the 55 commits from `98ada19` to `5a4cdec` (the v2.0 lock, v2.1 steps 2–6 and v2.2 steps 7–8) and the fixes it led to.

**Setup**
- **Database:** a fresh `flowbit_v2night`, seeded with `npm run db:seed -- --reset` (`SEED_ALLOW_DB=flowbit_v2night`). Indexes were built with `npm run setup:prod -- --allow-local`, which only builds indexes when no owner email is given.
- **Seed logins:** `seed-logins.local.md` was backed up first and restored byte for byte afterwards (same SHA-1). The night seed's logins are in `seed-logins.v2night.local.md`, which is git-ignored.
- **Server:** the production build in `.next-night`, served on 127.0.0.1:4500 with `.local-test/serve-night.sh`. That script sources `.local-test/check.env`, which holds test-only secrets, so webhook refusals are checked against a configured secret.

**What was not touched:** the `flowbit` and `flowbit_v2demo` databases, `.next`, `.next-v2`, `.next-check*`, and the servers on 4300 and 4400. Nothing was listening on 4100.

**Machine rules:** one heavy job at a time, Vitest on at most 2 workers, crawl concurrency 1. The 1-minute load stayed between 2.4 and 10.5. There was no browser and no password sign-in.

## Static checks

| Check | Before the fixes (HEAD `5a4cdec`) | After the fixes |
| --- | --- | --- |
| `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit` | 0 errors | 0 errors |
| `npm test` (Vitest, `--pool=forks --maxWorkers=2`) | 2,139 tests in 228 files pass | 2,158 tests in 233 files pass (19 new tests: 5 new test files, 5 extended) |
| `npx eslint src scripts` | 0 errors, 22 warnings (known kinds) | 0 errors, 22 warnings (unchanged) |
| `next build` (`NEXT_DIST_DIR=.next-night`, 3 GB heap) | passes | passes |

The Google font fetch was **not** blocked: both builds reached Google Fonts. `tsconfig.json` was restored after each build. `next build` appends `.next-night` type paths to it.

## The crawler (`.local-test/crawl.mjs`, git-ignored)

### How it runs
- **Database:** `--db flowbit_v2night` is now accepted, and only when passed explicitly.
- **Fixtures:**
  - `.local-test/v2-setup.mts --db flowbit_v2night` writes `night-fixtures.json` and cleans up with `--cleanup`.
  - The crawler refuses fixtures made for another database.
  - Two fixture modules (payslip link, WhatsApp connection) no longer load under the `react-server` condition, because they now import client navigation. They are skipped, and the crawl skips the payslip-link checks. This is a tooling limit, not an app bug: inside Next they load normally.
- **Sessions:** minted directly in the database for every role (`fb_session`), every Console role (`fb_console`), a portal contact (`fb_portal`) and an MCP grant per role. There is never a password sign-in.

### New checks
- **Settings and product pages:**
  - Every catalog page is crawled per role, with pass or refusal decided by the app's own `pagePermitted`. That covers:
    - Connected apps, Webhooks, Google, Slack, Security (2FA) and Profile (language)
    - My tax, Salary tax and the tax worksheet
    - Bank, Export (Tally) and Folio settings (E-invoice tab)
    - Domains, Appearance (themes) and Compliance
  - New dynamic routes: the tax worksheet and sequences. Sequences only run when the seed has them; this seed has none.
  - Odd-query fuzz on the same pages.
- **Public pages:** `/manual`, all 9 manual chapters, `/security` and `/compare-v1-v2` load for anonymous visitors and every role.
- **Client portal:**
  - Anonymous `/portal/<slug>` lands on `/portal/<slug>/login`.
  - The portal session sees its own client's shared project and never the other client's project or name.
  - Another record's file, and a bad id, are 404 for the portal session. A file request with no cookie is 401.
  - The portal cookie never opens `/app`, `/app/work/tasks`, `/app/settings/profile`, `/app/clients` or the product APIs.
  - Every role's app session on the portal lands on the portal sign-in and gets 401 on portal files.
- **MCP:**
  - The three `.well-known` documents return JSON.
  - `POST /mcp` without a token gets 401 with `WWW-Authenticate: … resource_metadata=…`. A bad token gets 401 `invalid_token`, and `GET /mcp` gets 405.
  - For each role's grant (all scopes): `tools/list` returns the tools, `flowbit_whoami` names the workspace, and a never-allowed tool name is refused.
  - `work_create_task`, `folio_draft_invoice` and `orbit_move_deal` are refused wherever the role (or the token's scope) does not allow them, and the tasks, invoices and deals in the database are byte-identical afterwards.
  - An owner grant with only `work.read` is refused every write, refused `flowbit_undo_batch`, and does not get Folio or Orbit data from `flowbit://workspace/context`.
  - OAuth endpoints: a garbage code, a malformed Basic header, a `javascript:` redirect registration and a garbage revoke all answer 4xx. An unknown client's authorize never redirects to the given URI.
- **Unsigned webhooks are refused** (4xx, nothing accepted):
  - Slack commands (unsigned, and with a bad signature) and Slack interactions
  - inbound email (unsigned, and with a bad Svix signature)
  - Recall (unsigned)
  - Sarvam (no token, and a wrong token)
  - the earlier lead, Razorpay (workspace and Flowbit) and Resend checks
- **WhatsApp off** (`FEATURE_WHATSAPP` unset):
  - `POST /api/webhooks/interakt` and `POST /api/webhooks/whatsapp/<hook>` return 404.
  - Every WhatsApp page and the wallet are 404 for roles that could otherwise open them.
  - A Console WhatsApp conversation is 404.
- **Cron:** every route under `src/app/api/cron` now comes from the folder (14, including `meetings`, `posts` and `sequences`). Each returns 401 without the secret, with a wrong secret and with a near-miss secret. `POST /api/folio/cron` also returns 401.

## Crawl totals

There were three runs against the night build. Run 1 was on the build before the fixes. Runs 2 and 3 were on the rebuilt `.next-night` with the fixes.

| Role | Requests (run 3) | OK | Denied | 404 | 5xx | Flags run 1 → 2 → 3 |
| --- | --- | --- | --- | --- | --- | --- |
| anonymous | 332 | 71 | 0 | 5 | 0 | 1 → 0 → 1 |
| member | 801 | 444 | 196 | 57 | 0 | 3 → 2 → 0 |
| hr_exec | 1,021 | 756 | 128 | 53 | 0 | 5 → 2 → 0 |
| finance | 1,196 | 1,015 | 58 | 77 | 0 | 4 → 2 → 0 |
| hr_admin | 1,099 | 845 | 122 | 54 | 0 | 4 → 2 → 0 |
| manager | 1,176 | 910 | 134 | 56 | 0 | 3 → 2 → 0 |
| admin | 1,202 | 1,098 | 2 | 69 | 0 | 5 → 1 → 0 |
| sales | 962 | 637 | 165 | 63 | 0 | 3 → 2 → 0 |
| custom:BD executive | 946 | 604 | 176 | 65 | 0 | 3 → 2 → 0 |
| owner | 1,211 | 1,110 | 0 | 71 | 0 | 6 → 0 → 0 |
| console:admin | 28 | 17 | 0 | 4 | 0 | 1 → 0 → 0 |
| console:sales | 28 | 10 | 0 | 11 | 0 | 1 → 0 → 0 |
| console:accounts | 28 | 9 | 0 | 12 | 0 | 1 → 0 → 0 |
| console:admin_mfa | 14 | 0 | 0 | 0 | 0 | 14 → 0 → 0 |
| portal | 10 | 1 | 0 | 2 | 0 | 0 → 0 → 0 |
| MCP grants (10: one per role, plus owner read-only) | 46 | 46 | – | 0 | 0 | 35 → 0 → 0 |
| **Total** | **10,100** | 7,573 | 981 | 599 | **0** | **89 → 15 → 1** |

The single run 3 flag was a **crawler mistake**. The lead-form check expected exactly one `crawl-lead@` lead, but run 2 had already left one on the same fixtures. Each POST creates exactly one lead. The check now compares with the count just before the POST. The v2 and night phase (275 requests: public tokens, webhooks, cron, Console, portal, MCP and WhatsApp-off) was then re-run on its own with `--roles owner --no-links` against the same fixtures: **0 flags**. In all three runs: 0 server errors, and 0 error pages after the fixes. (Run 1 had one 500, the `/oauth/token` Basic header bug.)

The 404s are expected: random and malformed ids, Console pages a role may not open, WhatsApp pages with the flag off, and records outside a role's scope. 260 results are "scoped", meaning either outcome is acceptable; they are listed in `.local-test/crawl-result.json`.

## Every flag, with cause and fix

| Run | Flags | Cause | Outcome |
| --- | --- | --- | --- |
| 1 | `/oauth/token` with a malformed Basic header → **500** (1) | **App bug.** `decodeURIComponent` threw a `URIError`. | Fixed in `ce5d1a5`: it now answers `invalid_client`. With a regression test; 4xx on runs 2 and 3. |
| 1 | `/api/muster/tax/24q` linked on Salary tax, **403** for hr_exec (1) | **App bug.** The page showed the 24Q buttons to roles without `people.read_sensitive`, and the route refuses them. | Fixed in `e062090`: one shared rule (`can24qExport`) for the page and the route, with a test. |
| 1 | `/api/muster/tax/form130/<id>` linked on Salary tax, **409** (5 roles) | **App bug.** A person without a salary structure has no worksheet, but got a PDF link anyway. | Fixed in `e062090`: the link shows only for people with a structure or paid payroll this year ("No worksheet" otherwise). With a test. |
| 1 | All 35 MCP checks got 401 | **Crawler mistake.** The fixture's tokens used the prefix `fbat_`; the server only accepts `fba_`. | Fixture corrected. Every MCP check passes on runs 2 and 3. |
| 1 | WhatsApp pages and the wallet are 404 where the catalog says "ok" (21) | **Crawler mistake.** The flag is off on this server. | The crawler now expects 404 once the role passes the permission check. |
| 2 | The same WhatsApp pages are `/app/denied` for roles without the permission (15) | **Crawler mistake** (the run 1 fix was too broad). The app checks the permission before the flag, which is correct. | Expectation reordered. |
| 1 | `/app/settings/automations/[id]`: no seeded record (9) | **Data.** A fresh seed has no automation rows (they are made on first save). | Optional in the night crawl; covered on `flowbit_v2demo` in the 8 Oct check. |
| 1 | `/console/messages/<conv>` → 404 for every Console role (3) | **Crawler mistake.** It is a WhatsApp conversation, and WhatsApp is off. | Expected 404 when the flag is off. |
| 1 | The pre-2FA Console session lands on `/console/login` (14) | **Crawler mistake.** The 10-minute pre-2FA session had expired, and the TTL index deleted it before the phase ran, so extending it did nothing. | The crawler now re-creates it (same token) right before use. It lands on `/console/login/verify` on runs 2 and 3. |
| 3 | Lead form POST "did not create exactly one lead" (1) | **Crawler mistake.** Run 2 had already left a lead on the same fixtures. | The check compares with the count just before. The v2 and night phase was re-run on its own: 0 flags. |

## Security review: findings by severity

The review was a read-through of tonight's high-risk code, split three ways:
- MCP OAuth and plan/apply
- portal, 2FA, domains, themes, location and public pages
- webhooks, SSRF, bank import and GSP

Every finding below was checked against the code before it was acted on.

### CRITICAL
None found.

### HIGH (all fixed)

| # | Finding | Fix |
| --- | --- | --- |
| H1 | **XLSX zip bomb.** The guard summed the *declared* sizes, and each entry was capped separately. A crafted file under 3 MB (about 1,000 entries pointing at one 40 MB part) could exhaust memory on Folio → Bank or any data import. | `2a85135`: counts the bytes actually unpacked, caps the output across all entries, refuses more than 1,000 parts and refuses reused offsets. Test: `src/lib/xlsx-read.test.ts`. |
| H2 | **GSP credential exfiltration.** A `folio.settings` user could change the GSP base URL while keeping the stored secret and password. The next IRN call would send both to their server. | `9af0ee8`: changing the address or environment needs both secrets entered again, and the audit entry records the address. Test: `einvoice/settings-rules.test.ts`. |
| H3 | **Cross-workspace 2FA reset.** 2FA is stored on the user, so an admin of any workspace the person had joined could turn it off everywhere. | `5dcdbc0`: refused when the person belongs to another workspace (support handles it). Test in `two-factor.test.ts`. |

### MEDIUM

| # | Finding | Status |
| --- | --- | --- |
| M1 | **MCP resources skip the scope check.** `flowbit://me/today` and `workspace/context` served work, sales and Folio data to a token with no scope for them, without redaction. | **Fixed** `ce5d1a5`. Each section needs its product's scope, my-day follow-ups need `orbit.read`, and output is redacted. Tests in `rules.test.ts`. The crawl also checks it. |
| M2 | **`flowbit_undo_batch` had no checks.** It had no scope, write or role check and was not tied to the connection. A read-only token for the same person could delete or roll back AI-made records. | **Fixed** `ce5d1a5`. It now requires the same grant, the write scope and role for every record type, and a writable workspace. Tests, plus a crawl check. |
| M3 | **Reset and sign-out left MCP grants alive.** Password reset and "sign out everywhere" did not revoke MCP grants (refresh tokens rotate indefinitely). | **Fixed** `163e57a`, together with: the reset link is now claimed atomically, and a reset now forgets remembered 2FA devices. Test: `reset.test.ts`. |
| M4 | **"Require 2FA for admins" only covered pages and actions.** It did not cover MCP (consent, token, calls), Slack or email to task, the workspace export or files. | **Fixed** `c635c0e`. Test in `rules.test.ts`. |
| M5 | **Outbound webhooks had only an idle timeout.** A slow-drip endpoint held a delivery for the whole cron, and stale recovery put it back at the front of the queue. | **Fixed** `d2917ba`: an absolute 10-second deadline, and recovered rows count as a try and wait 15 minutes. Test: `webhooks/http.test.ts` (a local slow-drip server). |
| M6 | **Email to task trusts `From:`.** Any member's address can be spoofed by an outsider who learns a personal `tasks+` address. | **Fixed 9 Oct** `be8c3f2` (owner decision). Only the address owner may send; an admin can turn on "allow teammates to email my address" (Settings → Security). When the provider reports SPF, DKIM or DMARC, each must pass. Tests in `email.test.ts`. |
| M7 | **The reply inbox is one address per workspace.** A lead who receives a sequence mail knows it, and a forged `From:` can stop another lead's sequence and log a fake reply. | **Fixed 9 Oct** `c9f04fc`. Each enrolment gets its own signed address, `reply+<enrolment>-<hmac>@…`; a reply stops only that enrolment, and the old workspace inbox is refused. Tests in `replies.test.ts`, `replies-job.test.ts`. |

### LOW

| # | Finding | Status |
| --- | --- | --- |
| L1 | Portal sign-in told strangers apart from contacts ("Request a code first" vs "did not match"). | **Fixed** `48fe6d0`, with a test. Send-time difference (mail is awaited) remains. |
| L2 | Bank undo deleted booked expenses with only `receipts.write`. | **Fixed** `f53bd81`, with a test. |
| L3 | Malformed Basic auth caused a 500 at `/oauth/token`. | **Fixed** `ce5d1a5`, with a test and a crawl check. |
| L4 | A remembered 2FA device survived a password reset. | **Fixed** `163e57a` (device epoch bumped). |
| L5 | Refresh-token reuse detection covers one generation only. A code replay racing the grant link revokes nothing. | **Fixed 9 Oct** `be252e7`: an `OAuthRefreshToken` family table (reuse of any old token, or two uses at once, revokes the grant); grants remember their code and a replay revokes them even mid-exchange. Tests in `oauth.test.ts`. |
| L6 | The planner's duplicate-lead check reveals that a company is someone else's open lead. | Accepted: it prevents duplicates by design. |
| L7 | No per-IP limit on bad-token traffic to `/mcp` or on `/oauth/revoke`. | **Fixed 9 Oct** `51ca716`: 30 bad tokens per IP per 10 minutes across `/mcp`, `/oauth/token` and `/oauth/revoke`, refused before any lookup. Test: `bad-token-limit.test.ts`. |
| L8 | 2FA guessing is limited to 8 tries per 15 minutes but has no daily cap or alert. | **Fixed 9 Oct** `a655d1f`: 30 a day per person, and an email alert after 5 wrong codes in an hour (once a day). Test: `two-factor-alert.test.ts`. |
| L9 | Proxy host cache: random Host headers cost a database read each and can flush the 5,000-entry cache. A pending custom domain row can squat a hostname. | **Fixed 9 Oct** `4bf4f23`: unknown hosts are answered from the 30-second set of verified hosts (no per-host read), slugs sit in a bounded map, and only a verified domain is unique (`setup:prod` drops the old index). Test: `portal-host.test.ts`. |
| L10 | Bank: an undo racing a match can leave an orphan receipt; a row stuck in `matching` after a crash is never released. | **Fixed 9 Oct** `43d20ea`: claims carry a token and time, a lost claim cancels its receipt, undo takes the statement first, and rows stuck over 5 minutes are released. Tests in `bank.test.ts`. |
| L11 | The inbound task webhook has no replay protection without `id`. | **Fixed 9 Oct** `42f4c5b`: a 5-minute timestamp window when given, and every request is claimed by id, nonce or body hash before the task is made. Test: `inbound-task.test.ts`. |
| L12 | IPv6 SSRF ranges `::ffff:0:0/96`, `64:ff9b:1::/48` and Teredo are not blocked (NAT64 hosts only). The GSP client has an idle-only timeout (it affects only the clicking user). | **Fixed 9 Oct** `3dbda85`: mapped, translated, both NAT64 ranges and Teredo are refused outright; the GSP client has a 30-second absolute deadline. Tests in `webhooks.test.ts`, `einvoice/http.test.ts`. |
| L13 | Slack, inbound email and Recall bodies are fully buffered before the size check (bounded by platform limits). `cancelIrn` uses the generate permission. The portal login page shows the workspace name for a valid slug. | **Fixed 9 Oct** `8b95bb3`: bodies are cut off while streaming (Slack 64 KB, inbound email 4 MB, Recall 256 KB) and cancelling an IRN needs the new `einvoice.cancel` permission. Tests: `read-body.test.ts`, `settings-rules.test.ts`. The portal workspace name stays (accepted). |

### Checked and correct
- **MCP OAuth:**
  - PKCE is S256 only, bound to the client and redirect, single-use, and a replay revokes.
  - Redirects must match exactly, and an unknown client or URI never redirects.
  - Tokens are stored only as SHA-256 hashes.
  - Refresh rotation is an atomic swap with client binding, and scope can only shrink.
  - Scope ∩ role is checked on every tool call against the live member and plan.
  - Plans are bound to the org, member and grant. Executors re-check permissions.
  - Consent uses server actions with Origin checks, and framing is blocked.
- **Portal isolation:**
  - The portal has its own collection and cookie (path `/portal`), and every query comes from the session's client and workspace.
  - Approvals are written once, and code storage, retries and replay handling are sound.
- **2FA gate:** every `createSession` path goes through it (password, Google, reset, invite). The pending and remember-device cookies are signed and bound, and TOTP and recovery codes cannot be replayed.
- **Webhook signatures** use the raw body and timing-safe compares, and refuse when unconfigured:
  - Slack: v0, with 300 s tolerance.
  - Inbound email: Svix or `t=,v1=`.
  - Recall: Svix, plus a bot, meeting and org match.
  - Sarvam: a per-job hashed token.
  - Resend, Interakt and Razorpay.
- **Outbound SSRF guard:**
  - The check runs on the socket's own DNS lookup, so there is no rebinding window.
  - Decimal, octal and hex IP forms are normalised.
  - Private, loopback, link-local, CGNAT, mapped and NAT64 /96 ranges are blocked.
  - Redirects are not followed, and the response size is capped.
- **Bank tenancy:** every id goes through the org-scoped wrapper. Matching is claimed atomically, and the hash is unique per org.
- **GSP secrets:** sealed, never sent to the browser and never logged.
- **Custom domains:** a Host maps only to its own verified workspace, and there are no per-request DNS lookups. Absolute URLs come from `APP_URL`, never from Host.
- **Themes and avatars:** strict hex validation on save and on read, so no CSS injection.
- **Location at check-in:** stored only with recorded consent, and range-checked.
- **Public pages** (`/manual`, `/security`, `/compare-v1-v2`, `.well-known`): static content only, with no internal data.

## What cannot be verified here

- **Real provider traffic.** None of these were called:
  - Claude and ChatGPT connecting through the real consent screen
  - Slack, Resend inbound, Recall, Sarvam, a GSP sandbox or NIC
  - Google Calendar or Gmail, the Vercel domains API, Resend Domains
  - Interakt, Razorpay
  - Anthropic

  Correctly signed requests are covered by unit tests only.
- **Browser behaviour:** the consent screen, 2FA enrolment (QR) and the code screen, the portal sign-in, theme presets, the product tours, the 375 px layout, client-side errors after hydration, and direct recording uploads to R2.
- **Write flows through forms:** the crawl only checks that GETs and refused writes change nothing.
- **Real TOTP sign-in, Console sign-in and the password flows:** not used anywhere (no password sign-in).
- **Tax figures:** the TDS worksheet, Form 130 and 24Q need a CA's review. E-invoice payloads need a GSP sandbox.
- **Data variety:** one seeded workspace on Suite. There are no sequences, automations or meeting transcripts in a fresh seed.

## Left running

- **Port 4500:** `next start` of `.next-night` against `flowbit_v2night`, started with `.local-test/serve-night.sh`. The crawl fixtures were removed with `v2-setup.mts --db flowbit_v2night --cleanup`.
- **Demo sessions:** `node .local-test/demo-sessions.mjs` mints sessions with user agent `flowbit-demo` for the owner, a member and a "Demo Console Admin" (2FA marked enrolled), valid 24 hours. It writes their cookies to `.local-test/demo-sessions.local.json` (mode 600, git-ignored) and never prints them. `--cleanup` removes them.
- **Not touched:** the servers on 4300 and 4400.
