# Flowbit status

Current state as of **12 Oct 2026**. This page is short on purpose. The full build log (every step from 1 to 11 Oct, with its checks and assumptions) is in [`archive/STATUS-HISTORY.md`](archive/STATUS-HISTORY.md); it is history, not a to-do list.

- What is built: [`FEATURES.md`](FEATURES.md).
- What the owner still has to do (keys, DNS, CA, lawyer, decisions): [`OWNER-TODO.md`](OWNER-TODO.md).
- How to deploy: [`DEPLOY-VERCEL.md`](DEPLOY-VERCEL.md). New here: [`START-HERE.md`](START-HERE.md).

## Where things stand

- **Version 2.0** (see `CHANGELOG.md`), plus the 10–11 Oct fix rounds A and B for the three test reports in [`qa/`](qa/), and the 11 Oct conflict fixes (audits A, B and C in `qa/CONFLICTS-*.md`).
- **Not deployed yet.** No production database, domain or keys exist. Everything external is tested with mocks only (Interakt, Razorpay, Google, Slack, Sarvam, Recall, GSP, Klipy, Resend inbound).
- Four products (Work, Muster, Orbit, Folio), the Console, the client portal, the MCP server for Claude and ChatGPT, and the marketing site with help centre, FAQ and manual are built.
- **Plans:** teams of 5 or fewer start on Free (6 months, 5 seats, every product); bigger teams start a 15-day trial. Yearly = 10 × monthly, with 50% off the first yearly invoice (Console setting, default 50). Free gets no paid add-ons. One trial per business (GSTIN, else PAN, else email). No separate product trial. No GST on Flowbit's own bills until `FLOWBIT_GSTIN` is set ("Invoice (not a tax invoice)").
- **Hidden or dormant at launch:** WhatsApp (Interakt, behind `FEATURE_WHATSAPP`), Flowbit-managed WhatsApp mode, Gmail reply detection (`GMAIL_REPLY_DETECTION`, needs CASA). Workspace deletion and log pruning run for real in deployed production (kill switches `LIFECYCLE_DELETE_ENABLED=false`, `RETENTION_PRUNE_ENABLED=false`); the meeting purge is a dry run until `MEETINGS_PURGE` is set.

## 12 Oct final pass

After the conflict fixes, one last pass (details in [`qa/FINAL-12OCT.md`](qa/FINAL-12OCT.md)):

- **Copy:** FAQ, legal pages, help cards and manual say Plan & billing, My account, My HR, Workspace alerts and firm; Folio's own UI says firm, not entity; a Muster · Payroll help card; a 17th `?` explainer, "Free and trial" on Plan & billing (`3b9bf0c`).
- **Checks:** `tsc` 0 errors; ESLint 0 errors (26 known warnings); Vitest 3 full runs in a row, each 349 files and 2,901 tests passed.
- **Crawl** (all roles, anonymous, Console, portal, MCP; 4500, concurrency 1): run 1 had 4 flags, 3 of them stale crawler expectations and 1 seed bug (the HR executive's bell linked to a payroll month it can no longer open; fixed `159355c` with a test). Run 2 after the rebuild: 10,480 requests, **0 flags, 0 server errors**.
- **Demo:** 4500 serves `.next-night9b` through `.local-test/serve-night9.sh` on `flowbit_v2night`; indexes set up; `.next-night8` removed.
- **PDF manuals** regenerated in `~/Downloads/Flowbit-User-Manuals` with the new names and prices. Screenshots still show the old labels until they are retaken (list in the report).

## Latest verification

From [`qa/NIGHT-11OCT-VERIFY.md`](qa/NIGHT-11OCT-VERIFY.md) (code `73c617f`, 11 Oct night), then rechecked after the conflict fixes:

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| ESLint | 0 errors (warnings are the known React Compiler readiness rules) |
| Vitest | all pass; full suite 5 runs in a row on 11 Oct night, targeted suites 35 runs |
| `next build` | passes |
| Role crawl (all roles, anonymous, Console, portal, MCP) | 10,539 requests, 0 flags, 0 server errors |

Still needs a person in a browser: the punch dial's morph and break animations (and the 30 px phone size, reduced motion), and the visual polish items listed in the night report.

## Environments on this Mac

| Role | Port | Database | Build | How |
|---|---|---|---|---|
| Developer | 4100 | `flowbit` | `.next` (dev) | `npm run dev` (launch config `flowbit`) |
| Owner demo | 4500 | `flowbit_v2night` | `.next-night9b` | `.local-test/serve-night9.sh` (launch config `flowbit-demo`) |
| Test scratch | none | `flowbit_v2dev` | none | created and dropped by smoke tests |

There is no 4300 or 4400 server any more. `flowbit_v2demo` (8 Oct demo) is unused; drop it when convenient (OWNER-TODO).

## Open items

Each open item has one home. The QA reports keep a status column per finding; "Owner decision" and "Deferred" rows are copied into OWNER-TODO.

**Owner decisions** (detail in OWNER-TODO §D): staff masking of salary/bank/PAN in the Console (D3); Folio's 3-user limit (D7); manager-away approvals (R1 4.5) and wider escalation (R1 4.4); past-due grace; refund wording; brand colours outside Suite.

**Known product gaps** (kept from the build log):
- Payroll has no freshness check: a cycle can be approved after attendance or structures change. Released months cannot be reopened; held pay goes into the next month. The ESI contribution-period rule and per-segment mid-month revisions are not applied.
- Two concurrent Folio retainer runs can create duplicate drafts (needs a unique period key and a migration). A draft invoice keeps its old tax treatment at issue.
- Approved leave is written to attendance without `source: 'leave'`; employees without a login get no leave marks.
- Subscription periods anchor to the payment instant, not IST midnight. A renewal invoice can differ from Razorpay's charge after a refused downgrade.
- The Console workspace list and KPIs load at most 2,000 workspaces into memory. Some lists cap at 200 rows with no pagination.
- Teams have a card view only.
- Uploads are capped at 4 MB on Vercel; larger files would need direct-to-bucket uploads.
- Some async click handlers have no try/catch, so a network failure can leave a spinner stuck.

**Demo data gaps:** no seeded trial, read-only, cancelled or disabled workspace, so those banners cannot be seen with seed data; no seeded receipt files on claims or expenses.

## Ops rules that changed on 11 Oct

- `APP_ENCRYPTION_KEY` is now **required**: a deployed server refuses to start without a 32-byte key.
- The data scripts (`migrate-staff`, `migrate-account-types`, `migrate-post-types`, `storage:migrate`, `folio-long-series`) refuse to run without `--env-file` or `--db`. `storage:migrate` is a dry run unless `--apply`.
- **Vercel Pro is required** (sub-daily crons). The production run order is in DEPLOY-VERCEL (f) step 7.
- `tsconfig.json` excludes every `.next-*` folder.
