# Final pass after the conflict fixes (12 Oct 2026)

One pass over the three agents' work from 11–12 Oct: pricing (yearly = 10 × monthly, 50% off the first year), "Start free", Console masking, purge, the renames, the legacy redirects, the approvals inbox, the explainers and the docs restructure.

## 1. Leftover copy (`3b9bf0c`)

| Where | Old | Now |
|---|---|---|
| FAQ (plans, HR, getting started, integrations), refunds and terms pages | Settings → Subscription, Settings → Billing, Settings → Profile, My space | Settings → Plan & billing (Bills and invoices tab), Settings → My account, My HR |
| Help centre cards | Flowbit Work, Muster: HR and payroll, Employee self-service, Orbit: sales CRM, Folio: billing | Work · Tasks, Muster · HR, **Muster · Payroll (new card, manual chapter `payroll`)**, My HR, Orbit · Sales, Folio · Invoicing |
| Manual (`content/manual`) | Settings "Personal / Workspace" groups with Subscription, Billing and two Notifications; Receivables dashboard; entity (about 40 places); chapter eyebrows | The six Settings groups as in the catalog; Folio home; firm; eyebrows match the product labels |
| Folio UI | Entity column, Add/Save entity, "GST entity" errors, e-invoice checks, receipts report | Firm everywhere a user reads it (the audit log's Entity filter is a record type and stays) |
| WhatsApp and email-to-task hints, email footer | Settings → Profile, "Notification settings" | Settings → My account, "Alert settings" |
| Explainers | Free vs trial left open in audit A | New `free-vs-trial` popover next to the plan badge on Plan & billing: "Up to 5 people: free for 6 months · bigger teams: 15-day full trial" |

Grep check: no user-facing string outside `legacy-routes.ts` and tests still says Settings → Subscription/Billing/Profile/Notifications, My space, Add entity or GST entity. Code comments and audit-log entity names were left alone.

## 2. Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint src scripts` | 0 errors, 26 warnings (known React Compiler readiness rules) |
| `npm test -- --maxWorkers=2`, run 1 | 349 files, 2,901 tests passed |
| run 2 | 349 files, 2,901 tests passed |
| run 3 | 349 files, 2,901 tests passed |
| `next build` (`.next-night9`, then `.next-night9b` after the fix) | passes |

## 3. Demo swap

- Built with `check.env`, `MONGODB_DB=flowbit_v2night`, `APP_URL=http://127.0.0.1:4500`.
- `setup-prod.ts --allow-local` against `flowbit_v2night`: indexes ready for 151 collections.
- 4500 now runs `.local-test/serve-night9.sh` (serves `.next-night9b`); `/` and `/login` answer 200. `.next-night8` and the first `.next-night9` are deleted. Launch config `flowbit-demo` points at `serve-night9.sh`.

## 4. Role crawl

All roles, anonymous, 4 Console roles, the client portal and MCP, against 4500 at concurrency 1 (40 ms delay). Fixtures from `.local-test/v2-setup.mts --db flowbit_v2night`, removed with `--cleanup` afterwards.

| Run | Requests | Flags | What they were |
|---|---|---|---|
| 1 (`.next-night9`) | 10,480 | 4 | 3 crawler expectations, 1 app (seed) bug, below |
| 2 (`.next-night9b`, fresh fixtures) | 10,480 | **0** | 0 5xx, 0 error pages, 0 errors in the server log |

Run 1 flags:
- **Seed bug (fixed `159355c`, regression test in `src/modules/settings/seed.test.ts`).** The HR executive lost `payroll.read` in D3, but the demo seed still gave that role "September payroll released", whose link answers `/app/denied`. The seed now drops payroll-month links for roles that cannot open payroll; the one stale row in `flowbit_v2night` was removed.
- Crawler: `/app/settings/import/leads` redirects to Orbit's import dialog by design; the crawler accepted that only for the email-log path. It now accepts every listed legacy redirect.
- Crawler: a pay letter opened by the HR executive answers 200 with the locked "This letter states pay" card (no letter body). That is the intended D3 behaviour, so the crawler accepts it.
- Crawler: `checkAttendanceImport` was removed in audit A9; the attendance template check now calls Settings → Import's `previewImportAction` (kind `attendance`).

## 5. Curl checks (sessions from `demo-sessions.mjs`, tokens never printed)

| Check | Result |
|---|---|
| `/pricing` | "2 months free" and "50% off your first year" present |
| `/` | "Start free" present (14 times) |
| `/app/approvals`, owner and member | 200 and 200 |
| `/app/settings/billing` | 307 to `/app/settings/subscription?tab=bills` |
| Console account page, masked salary | Not checkable: the demo workspace has no approved support grant, so no Console page shows employee salary, bank or PAN at all. Masking is covered by unit tests. |

## 6. Developer zip

See the final report: `~/Downloads/flowbit-v2-developer-handover-<date>.zip` with `flowbit/` (git archive of HEAD without `docs/archive/_workflows` and `docs/design`), `flowbit.bundle` (all refs) and `HANDOVER.md`; secret scan clean; older handover zips deleted.

## 7. PDF manuals

`python3 product-pdfs/make.py` (FAQ re-dumped with `dump-faq.ts` first). All 8 PDFs open (`pdfinfo`); text has "Plan & billing" and "50%" in the Getting Started, Admin and Complete manuals; no "Flowbit Technologies"; no Settings → Subscription/Billing or My space. The PDF covers keep their file names (Orbit CRM Guide, Folio Billing Guide) with the new kickers.

**Screenshots still showing old labels** (taken 9 Oct, before the renames; not edited):
- Every in-app shot shows the old rail (HR instead of Muster, singular labels).
- `set-*` (Settings): Personal/Workspace groups with Profile, Subscription, Billing and two Notifications; `set-subscription` is titled Subscription without the Plan & billing tabs.
- `folio-home` (titled Receivables), `folio-settings` (Entities tab, Add entity), `folio-invoices` and `folio-receipts` (Entity column).
- `hr-home` (HR dashboard), `me-*` and `gs-home`/`gs-dashboard` (old rail and self-service names), `gs-notifications`.
- `gs-pricing` (before 10 × yearly and 50% off the first year), `help-centre` (old card titles, no Payroll card).
