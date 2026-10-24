# Flowbit 2.0: final verification, night of 10–11 Oct 2026

This is the final check of tonight's work: 158 commits on top of `0271e5b` (fix rounds A and B for `docs/qa/TEST-10OCT-R1.md`, `R2.md` and `R3.md`, the animated punch dial, and the 50% first-year yearly discount). The owner asked for every change to be tested 40 times. Code checked: `73c617f`.

**Setup**
- **Database:** `flowbit_v2night` only. The `flowbit` and `flowbit_v2demo` databases were not touched.
- **Machine:** the 8 GB Mac. Every heavy step waited until the 1-minute load was 12 or lower. One heavy job ran at a time.
- **Not used:** no browser, and no password sign-in. Sessions were minted by `.local-test/crawl.mjs` and `.local-test/demo-sessions.mjs`.

## Result

| Check | Result |
| --- | --- |
| `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit` | 0 errors |
| `npx eslint src scripts` | 0 errors, 27 warnings (22 on 10 Oct). By kind: 14 setState in an effect, 4 impure calls during render, 8 unused names, 1 `aria-haspopup` on a radio. |
| Full `npm test` (`--maxWorkers=2`), 5 runs in a row | 5 of 5 passed, each with 2,819 tests in 334 files |
| Targeted tests for tonight's modules, 35 loops | 35 of 35 passed, each with 369 tests in 23 files |
| `next build` (`NEXT_DIST_DIR=.next-night7`) | passes. `tsconfig.json` was restored afterwards. |
| Index setup (`scripts/setup-prod.ts --allow-local`) | indexes ready for 151 collections |
| Role crawl, final run | 10,539 requests, 0 flags, 0 5xx, 0 server-log errors |
| curl render checks | 8 of 8 passed. The break-state render was skipped (see below). |

The tests ran 40 times in all: 5 full-suite runs and 35 targeted runs. No test failed on any run, so no test was flaky.

## 1. Repeat test runs

### Full suite (5 runs in a row)

| Run | Files | Tests | Time |
| --- | --- | --- | --- |
| 1 | 334 passed | 2,819 passed | 28 s |
| 2 | 334 passed | 2,819 passed | 28 s |
| 3 | 334 passed | 2,819 passed | 28 s |
| 4 | 334 passed | 2,819 passed | 26 s |
| 5 | 334 passed | 2,819 passed | 27 s |

### Targeted runs (35 loops)

The command was `npx vitest run <files> --reporter=dot --maxWorkers=2`, in a loop that stops at the first failure. All 35 runs passed, each with 369 tests.

| Area | Test files |
| --- | --- |
| Punch dial | `src/components/shell/punch-dial-model.test.ts` |
| Billing discount | `src/lib/first-year-discount.test.ts`, `src/lib/billing.test.ts`, `src/modules/billing/billing.test.ts`, `src/modules/marketing/pricing.test.ts` |
| Folio numbering | `src/modules/folio/counter.test.ts`, `src/modules/folio/engine/numbering.test.ts`, `src/modules/folio/einvoice/einvoice.test.ts` |
| Attendance and payroll staleness | `src/modules/muster/payroll/rules.test.ts`, `src/lib/attendance-punch-race.test.ts` |
| Sample-data removal | `src/modules/activation/sample-data.test.ts`, `src/modules/subscription/usage-sample.test.ts`, `src/app/app/settings/company/page.test.ts` |
| Tally and reverse charge | `src/modules/folio/tally/tally.test.ts`, `src/modules/doclinks/totals.test.ts`, `src/modules/folio/queries/report-charts-math.test.ts` |
| Approval links | `src/modules/actionlinks/actionlinks.test.ts` |
| Quick-add parser | `src/modules/work/tasks/quick-parse.test.ts`, `quick-parse-dates.test.ts`, `quick-context.test.ts` |
| Bank import | `src/modules/folio/bank/bank.test.ts` |
| Biometric | `src/models/muster/biometric-key.test.ts`, `src/modules/muster/attendance/biometric/mapping.test.ts` |

## 2. Build and demo swap

- **Before the build:** `pgrep -fl "next build"` found nothing running.
- **Build:** `.next-night7`, with `.local-test/check.env` sourced, `MONGODB_DB=flowbit_v2night`, `APP_URL=http://127.0.0.1:4500` and a 3 GB heap. It compiled in 35 s and generated 215 static pages.
- **After the build:**
  - `git checkout -- tsconfig.json` was run.
  - Index setup was run against `flowbit_v2night`.
- **Swap:**
  - The old server on 4500 (`.next-night6`) was stopped.
  - `.local-test/serve-night7.sh` (a copy of `serve-night6.sh`, pointed at `.next-night7`) was started with nohup.
  - `/` and `/login` answer 200.
  - `.next-night6` was removed.

## 3. Role crawl

The crawl covered 9 roles, anonymous, 4 Console roles, the client portal and MCP. It ran against 4500 at concurrency 1 with a 40 ms delay, using `--dist .next-night7` for the server-action ids. Fixtures were made with `.local-test/v2-setup.mts --db flowbit_v2night` and removed with `--cleanup`.

| Run | Requests | Flags | What they were |
| --- | --- | --- | --- |
| 1 | 10,539 | 4 | `/api/orbit/clients/export` returned 403 to member, hr_exec, hr_admin and the BD executive role. |
| 2 | 10,539 | 2 | Fixture state used up by run 1 (details below). |
| 3 (new fixtures) | 10,539 | **0** | Clean. 0 5xx, 0 error pages, 0 errors in the server log. |

**Run 1 flags.** These were a crawler expectation, not an app bug.
- `e7bed9f` (R3 L-21d) changed the clients CSV export on purpose: it now needs `clients.write`, not `clients.read`.
- The Clients page shows the Export button only with `clients.write`, so the page and the route agree.
- The crawler (`.local-test/crawl.mjs`, git-ignored) still expected `clients.read`. It now expects `clients.write`.
- Roles without `clients.write` must still get a 403. Any 200 for them is flagged as a leak.

**Run 2 flags.** Both came from re-running on run 1's fixtures:
- The lead-form token had already created its lead in run 1, so the second POST did not create exactly one lead.
- The "valid reply" enrolment had already ended because run 1's reply stopped the sequence.

Fresh fixtures cleared both (run 3).

**App fixes needed:** none, so no rebuild beyond `.next-night7`.

Totals by role (run 3): anonymous 354, member 848, hr_exec 1,068, finance 1,224, hr_admin 1,147, manager 1,204, admin 1,230, sales 1,014, BD executive 990, owner 1,263, Console 104, portal 12, MCP 81.

## 4. Server-side render checks (curl, demo sessions)

Sessions came from `node .local-test/demo-sessions.mjs` (owner, member, Console admin). They are valid for 24 hours, and the tokens are in `.local-test/demo-sessions.local.json` only. No token was printed.

| Check | Result |
| --- | --- |
| `/app` as member renders the new dial | 200. `data-dial="idle"` twice: the side-panel card and the phone top bar's quick check-in |
| `/app` as owner renders the new dial | 200, `data-dial="idle"` twice |
| `/pricing` shows the first-year discount | 200. "Yearly plans are 50% off the first year…" is present, and "2 months free" is gone. |
| `/faq` | 200 (393 KB) |
| `/help` | 200 (87 KB) |
| `/manual` | 200 (190 KB) |
| Letter PDF contains ₹ | An issued pay letter from `/api/muster/letters/<id>` (35 KB). `pdftotext` finds ₹. |

**The break state was not checked by render.**
- The demo member was not checked in, and the dial was idle.
- A break needs a check-in first. A check-in would have added a 01:40 attendance record on Sunday to the demo the owner will look at, so it was not made.
- The break picture is covered by `punch-dial-model.test.ts`: the state mapping, the break ring against its limit, and the timer and status text.

## 5. Developer zip

`~/Downloads/flowbit-v2-developer-handover-20261011-0145.zip`. It has the same shape as the 10 Oct zip:
- `flowbit/` from `git archive HEAD`, without `docs/design` and `docs/_workflows`;
- `flowbit.bundle` from `git bundle create --all`;
- `HANDOVER.md`, with the commit, the test count and "What changed on 11 Oct".

**Secret scan of the extracted zip.**
- There are no `.env*` files except `.env.example`, and no `*.local.*`, key or PEM files.
- Every key-pattern match is a test placeholder (`AKIAIOSFODNN7EXAMPLE`, `rzp_live_ABCDwxyz`, `mongodb+srv://u:p@`).
- No value from `.env.local` or `check.env` appears in the zip. The only matches were two non-secret values: the sender address and the platform admin email.

## 6. What still needs a person in a browser

- **The punch-dial morph.** The clock shrinks and turns as the break disc springs in (520 ms), and morphs back on Resume. These animations need a look on a real screen:
  - each break type's animation: steam, z's, the cup, the leaf, the pause bars;
  - the 30 px phone top-bar size;
  - the reduced-motion swap.
- **Visual polish.** Tonight's UI changes were checked only by tests and server-rendered HTML:
  - the colour tokens and hex sweep;
  - SegmentLinks touch targets;
  - the branded error and loading states;
  - project logos;
  - the leave form preview;
  - the discount lines on the plan picker, Console bills and the invoice PDF.
- **Open from the R1–R3 tables** (unchanged tonight):
  - R1 4.5 needs an owner decision.
  - R2 17.4: the pricing screenshot still shows "2 months free" and needs a browser re-shoot.
  - R3 L-25c: the credit-note e-invoice is deferred.

## Demo state at the end

- **Server:** 127.0.0.1:4500 serves `.next-night7` through `.local-test/serve-night7.sh` on `flowbit_v2night`.
- **Fixtures:** the crawl fixtures were removed.
- **Sessions:** the three demo sessions stay for the owner's morning look. Remove them with `node .local-test/demo-sessions.mjs --cleanup`.
- **Later fix (`f337fb1`):** the punch dial now reads the same optimistic punch state as the card label (`punch-state.ts`, 8 tests), so Resume, Take break and Check out morph at once and roll back together on failure; the demo now serves `.next-night8` through `.local-test/serve-night8.sh`.
