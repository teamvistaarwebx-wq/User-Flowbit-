# Flowbit v2 full check (8 Oct 2026)

This check covers the 32 v2 commits on top of `b972907` and the fixes it led to. It used the `flowbit_v2demo` database (org `vistaar`, one seeded user per role). The `flowbit` database, ports 4100 and 4300, and the `.next` and `.next-v2` folders were not touched. Load was kept low: one heavy step at a time, crawl concurrency 1 with a 50 ms delay, and capped workers for the build, server and tests. The highest 1-minute load seen was 29, while the machine was settling after its reboot. During the build, server and crawl it stayed between 4 and 16, and most of that came from other apps.

## Static checks

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | 0 errors (before and after the fixes) |
| `npx vitest run --pool=forks --maxWorkers=2` | 1,543 tests in 160 files pass before the fixes; 1,545 in 161 files pass after |
| `npx eslint src scripts` | 0 errors, 21 warnings (the known React Compiler readiness warnings, plus 2 unused vars and 1 aria warning) |
| Bare `npx eslint` | 45,008 problems, all from the `.next-v2` build output, which ESLint did not ignore. Fixed in `a55ac8d`: every `.next-*` folder is now ignored. |
| `next build` (HEAD, clean worktree, `NEXT_DIST_DIR=.next-check2`) | Passes once `58b05ce` is in. Before that, a clean checkout could not build (see Bugs fixed, item 1). No `next/font` error. |

## The crawler (`.local-test/crawl.mjs`, git-ignored)

The crawler was updated for v2:

- **Database guard.** `--db flowbit_v2demo` is allowed only when it is passed explicitly. Without `--db`, only `flowbit` is accepted.
- **Gating.** Product, feature and blocked decisions now come from `entitlements()` and `canUseFeature()`, the same functions the app uses. `/platform` pages are expected to forward to the Console sign-in.
- **Pacing.** Concurrency defaults to 1, and `--delay` defaults to 50 ms.
- **Retry.** A GET that fails at the connection level is retried once. No request needed it on the final run.
- **New dynamic routes.** Automations `[id]`, all 9 import kinds and a WhatsApp inbox thread.
- **New GET APIs.** Workspace export (owner only), DPDP export (`org.manage`, plus a missing person), and Console APIs called with a customer session.
- **A v2 phase**, run from `.local-test/v2-fixtures.json`, which `.local-test/v2-setup.mts` builds with the app's own module functions:
  - **Public links.** `/d/<token>` and its PDF, plus tampered and garbage tokens, and a bill token used on `/d` and a document token used on `/bill`. `/bill/<token>` and its PDF. `/p/<token>`: no amount is shown before the code, and the PDF without the code cookie redirects back. `/unsubscribe/<token>`, plus a garbage token. A GET of `/api/unsubscribe/<token>` only redirects (303) and changes no suppression.
  - **`/a/<token>` decides nothing.** The link was opened anonymously and as the approver, plain and with `?c=approve`, `?c=reject` and `?c=done`. The leave request, the task and the token rows were byte-identical before and after.
  - **Lead form.** One valid POST from the allowed origin created exactly one lead. One honeypot POST answered 200 and stored nothing. `embed.js` served JavaScript.
  - **Unsigned webhooks are refused.** The lead webhook, with no token and with a wrong token, got 401. The workspace Razorpay webhook got 400. Workspace WhatsApp got 401. Interakt, with no token and with a wrong token, got 401. Resend got 400. Flowbit's own Razorpay webhook got 400.
  - **Cron.** All 11 `/api/cron/*` routes return 401 without the secret, with a wrong secret, and with a near-miss secret. POST `/api/folio/cron` returns 401.
  - **Console.** Staff rows for Admin, Sales and Accounts were created with 2FA enrolled, plus one session stuck before 2FA. Each opened every Console page and the report and file APIs. Pages the role may open render; the rest return 404, as `requireStaff` intends. The pre-2FA session always lands on `/console/login/verify`. Every customer `fb_session` and anonymous visitor gets the Console sign-in, and `/api/console/*` returns 401. A Console cookie never opens `/app`: it gets `/login`, and the API returns 401.
  - **Mobile.** `/` and `/app/work/tasks` carry `viewport-fit=cover`, the manifest link and the apple-touch-icon. `/manifest.webmanifest` returns 200 with `display: standalone` and icons.
- **Test-only environment values** in `.local-test/check.env`: `APP_ENCRYPTION_KEY`, `CRON_SECRET` and the three webhook secrets, so that signature refusals are checked against a configured secret, not just "not configured".

## Crawl totals

There were two runs, both against the production build served on 127.0.0.1:4400 with `MONGODB_DB=flowbit_v2demo`.

| Role | Requests | OK | Denied | 404 | 5xx | Flags (run 1 → final) |
| --- | --- | --- | --- | --- | --- | --- |
| anonymous | 282 | 54 | 0 | 3 | 0 | 0 → 0 |
| member | 682 | 345 | 179 | 57 | 0 | 6 → 0 |
| hr_exec | 870 | 623 | 115 | 51 | 0 | 4 → 0 |
| finance | 1,154 | 984 | 52 | 75 | 0 | 4 → 0 |
| hr_admin | 946 | 710 | 109 | 52 | 0 | 5 → 0 |
| manager | 1,136 | 890 | 118 | 55 | 0 | 1 → 0 |
| admin | 1,160 | 1,063 | 2 | 65 | 0 | 3 → 0 |
| sales | 840 | 533 | 150 | 63 | 0 | 4 → 0 |
| custom: BD executive | 825 | 501 | 161 | 65 | 0 | 2 → 0 |
| owner | 1,165 | 1,076 | 0 | 62 | 0 | 3 → 0 |
| console: admin | 28 | 18 | – | 3 | 0 | 0 → 0 |
| console: sales | 28 | 11 | – | 10 | 0 | 0 → 0 |
| console: accounts | 28 | 10 | – | 11 | 0 | 0 → 0 |
| console: admin before 2FA | 14 | 0 | – | 0 | 0 | 14 → 0 |
| **Total** | **9,158** | | | | **0** | **46 → 0** |

The 404s are expected: random and malformed ids, Console pages a role may not open, and scoped records. 260 results are "scoped", meaning either outcome is acceptable; they are listed in `crawl-result.json`.

## Every flag from run 1

| Flag | Cause | Outcome |
| --- | --- | --- |
| `/app/settings/billing/wallet` linked from Settings → Integrations → WhatsApp, refused for Admin (1) | **App bug.** The page linked to the wallet for every `org.manage` user, but the wallet needs `billing.manage`. | Fixed in `ac3e4b3`: the link shows only with `billing.manage`. |
| `/app/work/projects/<id>` dead links from the bell for member, hr_exec, finance, hr_admin, sales and BD executive (16) | **Seed bug.** `modules/settings/seed.ts` sent "You were added to <project>" to every login. For people outside the project, the bell link opened a 404. | Fixed in `dd22e44`: the notes go only to the lead and members, with a regression test in `seed.test.ts`. The 34 mis-targeted rows were removed from `flowbit_v2demo`. |
| `/app/settings/email-log` redirects to `/app/settings/messages` (9) | **Crawler mistake.** v2 merged the Email log into the Messages log, and the old path forwards everyone. The Messages log enforces `org.manage` itself and was crawled clean. | Accepted in the crawler. |
| `/app/settings/automations/<id>` redirects to `/app/folio/settings?tab=reminders` (2) | **Crawler mistake.** A built-in reminder recipe opens where it is edited (`detail.bridgeHref`). | Accepted in the crawler. |
| `fetch failed` with HTTP 0 on 3 task and people list URLs (3) | **Client-side.** The kept-alive socket was reset within 20–150 ms, the server logged nothing, and the same URLs passed on the next run. | The crawler now retries a connection-level failure once. Nothing needed the retry on the final run. |
| `/app/work` returned 404 in the mobile check (1) | **Crawler mistake.** `/app/work` is not a page. | The check now uses `/app/work/tasks`. |
| The pre-2FA Console session landed on `/console/login` (14) | **Crawler mistake.** The fixture's pre-2FA session lives 10 minutes (`STAFF_MFA_MINUTES`) and had expired before that phase ran. | The session is now renewed just before it is used. It then lands on `/console/login/verify` every time. |

## Bugs fixed (commits)

1. **`58b05ce` fix: track `src/lib/storage`.** The bare `storage` line in `.gitignore` also matched `src/lib/storage`, so the storage module (the local and S3 drivers and their tests) was never committed. A build from a clean checkout, such as Vercel building from git, failed with "Can't resolve '@/lib/storage'". This was found by building HEAD in a clean worktree. The pattern is now `/storage`, and the module is committed.
2. **`ac3e4b3` fix:** the WhatsApp wallet link now shows only to billing managers.
3. **`dd22e44` fix:** seeded project notifications go only to project members, with a regression test.
4. **`a55ac8d` chore:** ESLint now ignores every `.next-*` build folder.

## What the crawl cannot cover

- **Live provider traffic.** No real Interakt (WhatsApp A/B sends, delivery and inbound webhooks), Razorpay (payment links, autopay, signed `payment_link.paid` events) or IndiaMART pulls. The fixtures use fake keys, and only unsigned or wrong-signature requests are sent. Correctly signed events are covered by unit tests and the earlier step smoke runs, not by this crawl.
- **Email delivery.** Resend is in outbox mode locally.
- **Visual layout.** Spacing, overflow, dark mode, PWA install, touch gestures (kanban drag, bottom sheets) and real phone safe areas were not checked. The crawl reads HTML and status codes only.
- **Client-side errors** after hydration. Client-side JavaScript is not run.
- **Write flows.** Server actions (forms) and the `/a/<token>` confirm button were not exercised. The crawl checks that GETs change nothing.
- **Console sign-in itself.** Password, TOTP and recovery codes were not used, and no password sign-in is used anywhere. Sessions were minted directly, the way `src/lib/console/session.ts` stores them.
- **Data variety.** Only what the `flowbit_v2demo` seed holds, plus the fixtures: one workspace, a Test account type, and none of the Free, trial-expired or blocked states.

## Left running and cleaned up

- **Cleaned up.** `v2-setup.mts --cleanup` removed the fixtures from `flowbit_v2demo`:
  - the three crawl staff, their sessions and audit rows;
  - the document link, the bill's public key, the action and payslip links;
  - the lead capture, the gateway and the WhatsApp connection;
  - the test thread and conversation;
  - the crawl lead and its stage event;
  - the rate-limit rows.

  The crawl's own `fb_session` rows and the audit rows its GETs wrote were deleted at the end of each run. The owner's demo session (`flowbit-demo`) and the "Demo Sales" staff member were kept.
- **Still running, at the coordinator's request, because the owner is demoing on it.** The server on **127.0.0.1:4400** still runs the clean-HEAD build `.next-check2`, from the git worktree `/private/tmp/claude-501/-Users-sanskaarsingh-Downloads-Vistaar--HRMS-/44413441-43ba-419b-a8bb-0174de7f29c8/scratchpad/wt`; it was started with `.local-test/serve-check2.sh`. `.next-check` in the project folder was left in place.
- **To remove afterwards.** Stop the server, then run `git worktree remove --force <that path>` and `rm -rf .next-check`.
