# Flowbit 2.0 QA, reviewer 1 of 3 (10–11 Oct 2026): end-to-end journeys by role

> **Fix round A (11 Oct 2026, 00:15–00:55 IST).** Every finding now has a Status column: "Fixed <commit>", "Owner decision" or "Skipped" (9.1 belongs to fix round B). Counts: HIGH 3 fixed, 1 skipped (9.1); MEDIUM 36 fixed; LOW 48 fixed, 1 owner decision (4.5). Some fixed rows carry a note on what is left. Checks after the round: `tsc --noEmit` clean, `eslint src scripts` 0 errors, full vitest 334 files / 2819 tests passing.

This review was read-only.
- **Code:** no source file was changed.
- **Database:** nothing was written. The demo sessions already in `.local-test/demo-sessions.local.json` were reused, and no token was printed.
- **Not run:** no build, no full test suite and no browser.
- **Live checks:** GET requests against the demo on `127.0.0.1:4500` (`flowbit_v2night`).

Five read-only sub-reviews traced the ten journeys. Each finding was checked against the cited code. I re-read the key line myself for every HIGH finding and for most MEDIUM ones; those are marked **(re-verified)**.

Items already fixed or accepted in `V2-REVIEW.md`, `V2-NIGHT-CHECK.md` or `V2-RECHECK-10OCT.md` are left out. That includes:
- **From V2-REVIEW:** M-M1 TDS tolerance, C8 undo dependants, E3 copy, and the marketing prices and days being hard-coded.
- **From V2-RECHECK-10OCT:** M1 split, L8 orphan receipt, L9 entity signature.
- **From V2-NIGHT-CHECK:** M2/M4/M6 MCP and email-to-task, and the HR Form 130 link.

All paths are relative to the repo root.

## Totals

| Severity | Count |
| --- | --- |
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 37 |
| LOW | 49 |
| **Total** | **90** |

**Live smoke checks.**
- **Owner and member pages:** `/app`, `/app/me`, `/app/me/attendance`, `/app/hr`, `/app/folio` and `/app/orbit` return 200 for both.
- **Links in help content:** every `/app/...` link in `content/manual`, the marketing content, activation and components resolves to 200, or to a 308 trailing-slash redirect.
- **The two 404s:** `/app/work` and `/app/workspace` return 404, but nothing links to them. They appear only as a tour prefix in `src/modules/activation/tours.ts:47` and in a test, so they are not findings.

---

## Angle 1: New owner, first day

**Checked.**
- **Signup:** signup with email OTP, which uses an HMAC, a 10-minute life, an atomic attempt slot, single use and 5 an hour. Google signup marks the email verified.
- **Free vs Trial:** the team-size and invite arithmetic, and the GSTIN/PAN field.
- **Onboarding:** the wizard and the routes behind the checklist (`?invite=1`, `?new=1`, `/app/folio/invoices/new`).
- **Tours:** every `data-tour` target exists.
- **Invites:** the 7-day expiry, wrong-email refusal, resend and revoke, and the capacity check from Settings.
- **Sample data:** load and remove.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | **HIGH** | bug | `src/modules/activation/store.ts:33`; `src/modules/activation/actions.ts:40-51` | **"Remove sample data" deletes records that have since become real (re-verified).** `deleteSample` runs `deleteMany({ sample: true })` on Client, Project, Task, Lead, Invoice and Employee. Nothing in Folio, Muster or Work clears or checks the `sample` flag. **Repro:** (1) Load the sample agency. (2) Issue the sample draft invoice for "Sharma Textiles (sample)", which gets a real FY number (`invoices/lifecycle.ts:78`). (3) Record a receipt. (4) Click Remove. The issued GST invoice disappears, leaving a gap in the invoice series and an orphan receipt. Sample employees with payroll entries, payslips or leave balances are deleted the same way, and tasks the team added under sample projects are orphaned. The success toast still says "Your own data is untouched." | Delete only untouched rows: invoices still in `draft`, and employees with no payroll, leave, attendance or claims. Alternatively, clear `sample` when a sample row is issued or used. Or refuse the removal and list what blocks it. | Fixed 6ed7e55 |
| 1.2 | MEDIUM | missing | `src/modules/activation/sample-data.ts:121`; `components/activation/checklist-card.tsx:28`; `modules/activation/checklist.ts:62-64` | **No way to remove sample data once the checklist is gone.** The sample project's description says "Remove it any time from Settings or Home". The Remove button exists only on the checklist card and the setup guide. The card hides on dismiss, when every step is done, or after 30 days. No Settings page has the button. | Add "Remove sample data" to Settings (Company or Import), and show it on Home whenever `hasSample` is true. | Fixed f1c33b2 |
| 1.3 | MEDIUM | bug | `src/modules/subscription/usage.ts:58`; `lib/billing.ts:250`; `activation/actions.ts:17-37` | **Sample employees count as seats, and loading them skips the capacity check (re-verified).** The employee usage query has no `sample` filter, and `loadSampleAgency` never calls `assertCapacity`. **Repro:** a Free workspace with 3 real employees loads the sample. It now has 6 employees against 5 seats. The page shows "6 of 5 seats", and every later invite or new employee is refused. | Add `sample: { $ne: true }` to the usage queries, or check capacity before loading. | Fixed 170e0a9 |
| 1.4 | MEDIUM | design | `src/modules/activation/checklist.ts:37`; `app/app/me/attendance/page.tsx:47` | **The checklist's "Check in" step is a dead end for the owner.** It links to `/app/me/attendance`, which shows "Your account is not linked to an employee record. Ask HR to link it." Onboarding never creates an Employee for the owner, and the owner *is* HR. | Offer "Add me as an employee" on NotLinked to people with `people.write`, or create the owner's record during onboarding. | Fixed 82013f6 |
| 1.5 | LOW | copy | `src/app/(auth)/(split)/signup/page.tsx:28` | **The signup subtitle is wrong (re-verified).** It reads "Free for 15 days. Every product included. No card needed." In fact teams of up to 5 get Free for 6 months, and the trial length is set in Console. The accepted marketing-copy item covers the site, not this app page. | Build the text from `planConfig()`. | Fixed 74c393d |
| 1.6 | LOW | copy | `src/lib/auth/actions.ts:191` | **A seat number is hard-coded.** The refusal says "Choose 6 or more people for a trial", although `freeSeats` can be changed in Console. | Use `` `more than ${config.freeSeats}` ``. | Fixed 74c393d |
| 1.7 | LOW | bug/copy | `src/lib/auth/actions.ts:200-207,224`; `lib/auth/invites.ts:93` | **Onboarding invites are silently lost when email is off.** The returned `link` is discarded, yet the toast says "invited N people". | Show the links after onboarding, or change the toast to "copy their links from Members". | Fixed 76dce6d |
| 1.8 | LOW | design | `src/app/(auth)/onboarding/wizard.tsx:145-148` | **"Skip for now" discards invites already added** without asking. That can flip a Trial back to Free. | Relabel it "Skip invites", and confirm when the list is not empty. | Fixed 76dce6d |
| 1.9 | LOW | design | `src/components/activation/product-tour.tsx:97`; `modules/activation/tours.ts:30,58` | **Tours.** Replay from Home or Settings falls back to the Work tour, even when the workspace has no Work. The Muster tour starts automatically on `/app/me` for every employee, and describes HR pages they cannot open. | Fall back to the first enabled product. Add an employee variant of the tour. | Fixed 42c6a5f |
| 1.10 | LOW | bug | `src/lib/auth/invites.ts:131` | **Accepting an invite isn't atomic.** It runs `Invite.updateOne({ _id }, { $set: { acceptedAt } })` with no `acceptedAt: null` condition, so two accepts at once both write the Member, the audit row and the notice. | Claim the invite with `findOneAndUpdate({ _id, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } })`. | Fixed 7e02b45 |

## Angle 2: Employee day

**Checked.**
- **Punches:** the punch state machine, locked days, office hours, grace time and the half-day threshold.
- **Breaks:** the 4 break types, limits checked at the start of a break, and paid minutes capped.
- **Location:** consent with a version, "required" mode, and the geofence.
- **My attendance:** scoped to the employee's own record.
- **Leave apply:** overlap, half day, weekly offs and holidays, pending days counted against the balance, proof checks, and the month lock.
- **Payslips:** visible only once published, and only the employee's own.
- **My tax:** the declaration and proof windows.
- **Claims:** the list and the receipt route.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 | MEDIUM | missing/copy | `src/lib/i18n/en.ts:231`; `src/modules/muster/leave/actions.ts:51-74` | **Withdrawing leave notifies nobody, though the dialog says "Your approvers are told it was withdrawn" (re-verified).** `cancelLeaveRequest` has no `notify` call, and no `leave.cancelled` event exists anywhere. The manual says the same as the dialog. When HR cancels an *approved* leave, the employee isn't told either, and the audit row says "Leave withdrawn" in both cases. | Notify the pending approvers on withdraw, and the employee on an HR cancel. Use separate audit wording for the two. | Fixed 2f5c46f |
| 2.2 | MEDIUM | copy (docs) | `docs/FEATURES.md:215,392,244`; `content/manual/35-me.html:31` | **The docs describe old breaks.** FEATURES says there is "one generic break… no break types". The code has 4 types with limits and paid/unpaid settings (`src/lib/break-types.ts:9`). The manual says break time is never counted as work, but paid breaks are. Neither mentions location consent. FEATURES also leaves My tax out of self-service. The FAQ is correct. | Rewrite FEATURES §4 and line 392, and the manual's check-in section. | Fixed 7e75210 |
| 2.3 | MEDIUM | design | `app/app/me/claims/page.tsx:36`; `src/modules/muster/claims/public.ts:41`; `claims/public-actions.ts:35-37` | **The claim form ignores the signed-in employee.** My claims lists forms by employee id, but "File a claim" opens the public `/c/<slug>` form, which wants a fresh OTP and matches only `workEmailLower`. An employee who signs in with another email gets the neutral "a code is on its way", and no code is ever sent. | When a linked app session opens the form, start the claim session directly. At least show the work email the code goes to. | Fixed 757217d |
| 2.4 | LOW | bug | `src/app/app/me/tax/page.tsx:49-52`; `app/api/muster/tax/form130/[employeeId]/route.ts:44-45` | **The Form 130 button on My tax is always shown.** With no salary structure it opens a raw 409 JSON page. The same bug was fixed on HR Salary tax (e062090) but not here. | Show the button only when a worksheet exists. | Fixed ea8073f |
| 2.5 | LOW | bug | `src/lib/attendance.ts:52-80` | **Two punches at once can lose one.** The punch reads the day, appends in memory, then writes `$set: { punches }`. A double tap, or web and phone together, can drop a punch or record two check-ins. | Use `$push` guarded by the expected punch count, or a version field, and retry on a mismatch. | Fixed be584c7 |
| 2.6 | LOW | copy | `src/app/app/me/payslips/page.tsx:54` | **The callout names the wrong owner at `hr_reviewed`.** It says "still with HR", but Finance is next. "HR" is also an untranslated literal. | Map `hr_reviewed` to Finance, and translate the label. | Fixed d85ff8c |
| 2.7 | LOW | copy | `src/modules/muster/tax/windows.ts:19-20` | **Proof-window dates show as raw ISO strings,** for example "2027-01-01". | Use `formatDate`. | Fixed 68be371 |
| 2.8 | LOW | copy | `src/components/shell/use-punch.ts:92` | **"Break {m}m" counts the whole day's breaks,** not the current one. | Count from `state.stateSince` while on a break. | Fixed ade2291 |
| 2.9 | LOW | copy | `src/app/app/me/attendance/page.tsx:71` | **The "Late" segment includes `paid_half_day` and `half_day`.** | Add a separate Half-day segment. | Fixed 63b4009 |
| 2.10 | LOW | design | `lib/attendance-core.ts:76,126-128`; `leave/decide.ts:37`; `attendance/queries.ts:91` | **Checking in on approved leave splits the record.** The day mark becomes present or late, and the widget and presence show present. Payroll still counts leave, because the register reads the LeaveRequest. | Warn at check-in, or keep `leave` and `half` marks when someone punches. | Fixed b882768 (check-in on a leave day now warns that payroll still counts the leave; the mark itself still follows punches, as the existing rule intends) |
| 2.11 | LOW | design | `leave/apply.ts:47-58,61-63` | **Leave form gaps.** There is no paid vs loss-of-pay preview before submitting. Two half days on the same date are refused as an overlap, and there is no first-half / second-half choice. | Show a balance and LOP preview, and add a session field that the overlap check honours. | Fixed c276670 (paid / loss-of-pay preview; first or second half on half days) |

## Angle 3: HR month-end

**Checked.**
- **Attendance and lock:** the register, corrections, the template and biometric import inside the lock transaction, and `assertMonthsOpen` coverage.
- **Payroll stages:** strict, conditional advances; the lock refuses unverified bank changes and late claims; release needs a UTR and a date that is not in the future; publish needs `released`.
- **TDS:** slabs, rebate and marginal relief, surcharge, cess, and the spread over the months left.
- **Form 130 route:** the scope check and PAN masking.
- **Letters:** issued once, with a signer snapshot and outbox handling.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 3.1 | **HIGH** | bug | `src/modules/muster/attendance/actions.ts:98-118`; `src/modules/muster/payroll/cycle-actions.ts:102-105`; `src/app/app/hr/payroll/[id]/page.tsx:87-90` | **Payroll can be locked, released and published on attendance that changed after generation (re-verified).** `reopenAttendanceMonth` moves the cycle back only when it is at `attendance_locked`. A cycle at `generated`, `hr_reviewed` or `finance_approved` keeps its stage and its old entries. `openAttendanceRefusal` only checks whether attendance is locked *now*. The "regenerate" banner shows only while attendance is open. **Repro:** (1) Generate payroll and reach Finance approved. (2) Reopen attendance and change an LOP day to present. (3) Lock again. (4) Lock payroll, release and publish. Net pay still uses the old LOP. | Refuse when the period's `lockedAt` or `reopenedAt` is later than `cycle.generated.at`. Or have reopen reset a cycle in `generated`…`finance_approved` back to `attendance_open` and clear the review stamps. | Fixed db4aada |
| 3.2 | MEDIUM | design | `src/modules/muster/attendance/actions.ts:73-80` | **The month lock ignores pending items.** It checks only unmarked days, which are always 0 under the "present" or "absent" policy. Pending leave, corrections and comp-offs in the month are stranded: every approval, including by email link, fails with "Attendance … is locked". | Before locking, count pending requests in the month. Refuse, or warn with the list and an explicit "lock anyway". | Fixed c54d78a |
| 3.3 | MEDIUM | missing | `src/app/app/me/tax/page.tsx:33,50` | **Employees can't reach last year's final Form 130.** The page uses `fiscalYear(todayIST())` and has no year picker, so from 1 April it offers only the current year's provisional form. The manual (`35-me.html:238`) promises the year's summary. | Add a previous-year selector or button. | Fixed ea8073f |
| 3.4 | MEDIUM | bug/compliance | `src/app/app/hr/payroll/tax/page.tsx:31-34`; `form138.ts:24` | **Earlier years are labelled under the new Act.** The HR picker offers 2025-26, and the exports name it "Form 130", "Form 138" and Section 392, which are 2025 Act labels. Those years fall under the 1961 Act: Form 16, 24Q and s.192. | Pick the labels by tax year, or refuse years before 2026-27. | Fixed ea8073f |
| 3.5 | MEDIUM | missing | `src/modules/muster/tax/worksheet.ts`; `tax/compute.ts`; `form138.ts:40` | **No higher TDS rate when there is no PAN.** PAN is only a flag in the CSV export. TDS is under-deducted without any warning. | When the PAN is empty and tax is above 0, apply the higher rate with a note. At minimum, show a banner on payroll. | Fixed bde8c1a |
| 3.6 | MEDIUM | bug | `src/modules/muster/tax/queries.ts:57-67` | **YTD TDS includes unpaid months (re-verified).** The doc comment says "paid entries only", but the `PayrollCycle.find` has no status filter. The exports filter on `released`, so the worksheet and the Form 138 export can disagree. | Filter on `isAtLeast(status, 'released')`, or block generation while an earlier month in the year is unreleased. | Fixed da09856 |
| 3.7 | LOW | bug | `src/modules/muster/payroll/payslips.ts:113-116` | **A payslip counts as emailed when the mail only reached the outbox.** It sets `emailedAt`, so a later publish skips the person. Letters already handle this case (`letters/actions.ts:190-195`). | Mirror the outbox handling from letters. | Fixed 2e00c83 |
| 3.8 | LOW | design | `payslips.ts:70-71`; `letters/actions.ts:179-180` | **Payslips and letters go only to the work email.** For people who have left, and for candidates' offer letters, that mailbox is usually closed or doesn't exist yet, and `workEmail` is required. The payslip email body also states net pay. | Fall back to the personal email for exits and candidates. Review whether net pay belongs in the email body. | Fixed 2e00c83 (personal email for leavers and candidates; net pay removed from the email body) |

## Angle 4: Manager

**Checked.**
- **Action-link security:** an HMAC check before lookup, a hashed key and a 7-day TTL; an atomic claim with stale release; rate limits; refusal of a wrong signed-in user or workspace; and a recheck that the member is active.
- **Self-approval:** refused everywhere.
- **Leave, corrections and comp-off:** stage routing, and conditional `pending` writes.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 4.1 | MEDIUM | design/security | `src/modules/actionlinks/token.ts:62`; `public-actions.ts:38`; `kinds.ts:39` | **Anyone holding an approval link can use it (re-verified).** The check `if (viewer.userId && viewer.userId !== row.userId)` lets an anonymous viewer through. A forwarded mail, a shared inbox or a mail-gateway preview can therefore approve. This matters most for `bank_change` "Verify", the checker step against salary-redirect fraud. STATUS.md:755 says links are "bound to the approver". | Require a session or an email OTP for `bank_change`, or drop links for that kind. Consider requiring sign-in when the workspace enforces 2FA. | Fixed a742092. Decision: per notifications-v2 §0b.14, leave, timesheet, correction and task links stay one-tap without sign-in; bank-change Verify and expense claims (money and bank data) need the bound approver signed in, by email and WhatsApp alike. |
| 4.2 | MEDIUM | bug | `src/modules/muster/claims/decide.ts:39-44`; `claims/review-actions.ts:43-56`; `payroll/bank-verify.ts:15-18`; `claims/public-actions.ts:137` | **Claim decisions and bank-change verification never call `assertVisible`.** A custom role with `claims.review` but only team visibility is still sent links for everyone, and can approve them. | Call `assertVisible` in each core function, and notify only people who can see the employee. | Fixed da85470 (notices still go to every claims.review holder; links refuse on use) |
| 4.3 | MEDIUM | bug | `src/modules/work/time/decide.ts:27-28` | **A timesheet can be decided twice (re-verified).** The status check happens on a read, and the `updateOne({ _id })` has no `status: 'submitted'` condition. An email Reject racing an in-app bulk approve both succeed, and the employee gets both messages. | Make the update conditional on `status: 'submitted'`, and report "already decided" when nothing changed. | Fixed 8fc8415 |
| 4.4 | MEDIUM | design/copy | `src/modules/automations/sources/team.ts:55,61-64`; `recipes.ts:271-286`; `content/manual/60-admin.html:405`; `docs/specs/notifications-v2.md:326` | **Escalation covers leave only.** It is timed from `createdAt` rather than from the current stage, so HR gets escalated about an hour after receiving a request. It ignores `managerLapse`. Corrections, comp-offs, timesheets and claims are never escalated, although the docs say "Approval pending → escalate". | Time from the last stage change, route to HR on a lapse, and add the other sources, or relabel the recipe "Leave pending". | Fixed b1b9f57 (leave only, relabelled; other request kinds: owner decision) |
| 4.5 | LOW | design | `src/modules/messaging/fanout.ts:121,155-163` | **Approvals stall while the approver is away.** The approval mail is held, with no buttons, until they return, and nothing is delegated. | Route the stage to HR, or to a delegate, while the approver is away. | Owner decision: who may decide while a manager is away (delegate, or HR at the manager stage) is a product rule. The held email still reaches the approver on return, and HR already decides when the manager lapses. |
| 4.6 | LOW | design | `src/modules/work/teams/workload.ts:21`; `teams/queries.ts:96` | **Workload capacity ignores holidays and leave.** It is working days × 480 for everyone, which contradicts FAQ `faq/work.ts:64`. | Subtract holidays and each person's approved leave. | Fixed 3ca348b |
| 4.7 | LOW | copy | `src/modules/actionlinks/token.ts:72-79`; `components/doclinks/public-shell.tsx:68-77` | **The link problem page gives no link.** It says "Open the request in Flowbit", but there is no button. `KIND_RULES[].href` is never used. | Render an "Open in Flowbit" button. | Fixed a742092 |
| 4.8 | LOW | bug | `src/modules/actionlinks/execute.ts:38-45` | **The preview shows Approve and Reject to someone who can no longer decide,** after a role change or once the request has moved past their stage. They only learn it on submit. | Run the permission and stage check during the preview. | Fixed 77ef6ba (permission checked in the preview; stage and lock still checked on submit) |

## Angle 5: Project manager

**Checked.**
- **Relations:** loops, self-links and cleanup on delete.
- **Timers:** one running timer per member (unique index); stopping twice is safe; a running timer blocks submitting the week; locked weeks refuse edits; time entries follow a task to its new project.
- **Parser basics:** "kal", "parso", "agle somvar", "3 din mein", "5 baje", "shaam", dd/mm dates and priorities.
- **Projects:** codes and archive rules.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 5.1 | MEDIUM | bug | `src/modules/work/tasks/quick-parse.ts:88-90` | **`#name` takes a loose project match over an exact list match (re-verified).** Projects are tried first with `fuzzyFind`, which also matches "contains the word". With a project "Website Redesign" and a list "Design", `#design` files the task under the project. The FAQ example (`faq/work.ts:16`) uses `#design`. | Score projects, lists and spaces together and take the best score. | Fixed 6dceea7 |
| 5.2 | MEDIUM | bug | `quick-parse.ts:98`; `components/work/tasks/quick-parse-chips.tsx:86`; `tasks/validate.ts:74` | **`#space` with several lists (or none) shows a chip, then fails** with "Tasks live inside a list…". Inline quick add has no list picker to recover with. | Only offer the space chip when the space has exactly one list, or fall back to its default list. | Fixed 6dceea7 |
| 5.3 | LOW | bug | `src/modules/work/tasks/quick-parse-dates.ts:36,113-115` | **Night times are read wrong.** "raat 1 baje" becomes 13:00, and "raat 12 baje" becomes 12:00 noon. | Treat raat or night 1–4 as am, and 12 as 00:00. | Fixed c32b605 (round B, R3 M3) |
| 5.4 | LOW | design | `quick-parse-dates.ts:14-22`; `quick-parse.ts:44` | **Common words are read as weekdays.** "baat sun lo" gets a Sunday date, and "guru ko call karo" becomes Thursday and swallows "ko". A weekday typed on that same day resolves to today. The chips can be dismissed. | Require "agle" or "ko" framing for sun, guru, mangal and shani. Have a same-day weekday mean next week. | Fixed aae673c |
| 5.5 | MEDIUM | bug | `src/modules/work/tasks/mutate.ts:152` | **Moving a task to another project keeps the old client (re-verified).** The code reads `if (!task.clientId && project.clientId …)`, and every task already inherited a client at create. The wrong client logo shows, and billable time follows `task.clientId`. `updateProject` (`projects/actions.ts:64-69`) does move inherited clients. | Replace the client when it equals the old project's client. | Fixed 64ac7b3 |
| 5.6 | MEDIUM | design | `mutate.ts:89-114`; `bulk-actions.ts`; `relations.ts:86-88` | **A task with open blockers can be marked Done without a warning.** Separately, a `blocks` relation writes to the other task while only needing view access to it. | Return a soft confirm ("VW-12 is still open"), and require edit access on the task being changed. | Fixed 05dd157 |
| 5.7 | MEDIUM | bug | `src/modules/work/time/format.ts:42`; `time/ledger.ts:39`; `time/actions.ts:49-64` | **A forgotten timer logs a full billable 24 h on its start day (re-verified),** because of `Math.min(MAX_DAY_MINUTES, …)`. Manual entries are capped per entry but not per day, so 3 × 20 h on one day is accepted. | Ask for confirmation on stop above about 10 h or across midnight. Refuse a day total above 24 h. | Fixed 38b4174 |
| 5.8 | MEDIUM | wrong numbers | `src/modules/work/reports/time-report.ts:13-18`; `reports/task-reports.ts:78,116` | **The Time section and the member and project sections disagree.** The Time section excludes rejected time and honours "approved only". The member and project sections have no status filter, and `Task.loggedMinutes` includes rejected time too. `.limit(20000)` truncates large ranges without a notice. | Use one shared filter, and add a notice when results are truncated. | Fixed 9c2cc62 |
| 5.9 | LOW | copy (docs) | `docs/FEATURES.md:168,265,354,356,357,362` | **FEATURES lists shipped features as missing:** project logo, client logo, client logo on tasks, Home quick add, and custom colour. | Refresh FEATURES §4 and §10. | Fixed f69836a |
| 5.10 | LOW | missing/bug | `src/modules/work/projects/schemas.ts:6-26`; `projects/actions.ts:159-164`; `app/app/work/projects/[id]/page.tsx:88` | **Project logo gaps.** There is no logo field in the create dialog, and the logo shows only on the detail page. Deleting a project leaves `logoFileId` behind as an orphan file. | Add the logo at create, show it on the cards, and delete it with the project. | Fixed ea2a866 |

## Angle 6: Finance

**Checked.**
- **Quote accept and decline:** compare-and-set, expiry in IST, rate limits, and no double convert.
- **UTR sharing:** refuses non-payable invoices and is deduplicated.
- **Gateway webhook:** signature checked first, org match, idempotent, and the excess becomes an advance.
- **Credit notes:** the caps and the GST split.
- **Bank import:** amounts in paise, and claims.
- **E-invoice:** eligibility, the cancel window and the e-way bill block.
- **Tally XML:** escaping and the cap.
- **Charts and PDFs:** the chart filters, and the entity-then-profile fallback on PDFs.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | **HIGH** | bug | `src/modules/folio/engine/totals.ts:126`; `src/modules/folio/tally/vouchers.ts:34-37,49-56`; `queries/report-charts.ts:45`; `doclinks/load.ts:61-70` | **Reverse-charge tax is pushed into Round Off in the Tally export (re-verified).** The total excludes tax under reverse charge, but the lines keep CGST, SGST and IGST. `salesVoucher` credits output tax, and `balanced()` posts the residual to Round Off. Nothing in `tally/` reads `reverseCharge`. **Repro:** an intra-state ₹1,00,000 at 18% reverse-charge invoice exports as Dr Party 1,00,000; Cr Sales 1,00,000; Cr CGST 9,000; Cr SGST 9,000; Dr Round Off 18,000. The credit-note voucher has the same error. The GST chart counts this tax as output tax. The public page lists the tax rows above a total that excludes them, with no reverse-charge note. | Under reverse charge, post no output-tax entries (or use a memo ledger). Separate reverse-charge tax in the chart. Show `reverseChargeNote` on the public page. | Fixed f50d86b |
| 6.2 | MEDIUM | bug | `src/modules/folio/invoices/lifecycle.ts:94-108` | **An invoice with an active IRN can be voided (re-verified).** `voidInvoice` never checks `activeEinvoice`. After 24 hours, Flowbit shows the invoice void while the IRP and GSTR-1 still have it live. The manual (`50-folio.html:468`) says to use a credit note instead. | Refuse with "Cancel the IRN within 24 h, or raise a credit note". | Fixed 3b14447 |
| 6.3 | MEDIUM | bug | `src/modules/folio/invoices/service.ts:125-127`; `quotes/service.ts:91` | **Deleting or voiding a converted invoice sets the quote to `accepted` (re-verified),** whatever its earlier status. A sent quote then shows "accepted" on the client's page, and the Accept and Decline buttons disappear. | Store `statusBeforeConvert` on convert and restore it. | Fixed aec9792 |
| 6.4 | MEDIUM | design | `src/modules/folio/quotes/service.ts:66-75`; `components/folio/QuoteActions.tsx:24` | **An accepted quote can still be edited and re-priced.** The public page then shows the new figures under the original acceptor's record. | Block edits on accepted and declined quotes (offer Duplicate), or reset the status to sent and log the change. | Fixed 31100f3 |
| 6.5 | MEDIUM | missing | `src/modules/payments/link-service.ts:30-33`; `lifecycle.ts:106-107`; `payments/allocation.ts:26` | **Razorpay links stay live after a void, a write-off or another settlement.** A client can still pay, and the money becomes a silent advance with no alert. | Cancel the links on void, write-off or zero balance. Alert finance when a payment lands on an invoice that isn't open. | Fixed b12dd68 |
| 6.6 | LOW | bug | `src/modules/folio/tally/export.ts:53-74`; `tally/xml.ts:56` | **Tally export gaps.** Write-offs are not exported. Parties have bill-wise on, but vouchers carry no `BILLALLOCATIONS.LIST`. | Add a journal per write-off, and bill references on vouchers. | Fixed 561587a |
| 6.7 | LOW | bug | `src/modules/folio/credit-notes/service.ts:76,79` | **A credit note rounds with today's setting, not the invoice's.** A full credit on an unrounded invoice is then refused. | Take the rounding from the invoice. | Fixed 060f388 |
| 6.8 | LOW | copy | `src/modules/doclinks/load.ts:150-151` | **The public credit note's line amount includes GST,** so the lines don't sum to the taxable value. The round-off row is missing. | Use `l.taxablePaise` for the amount, and add the round-off row. | Fixed f50d86b |
| 6.9 | LOW | design | `src/modules/automations/folio-events.ts:57-58`; `folio/receipts/actions.ts:61-69` | **Thank-you mails.** A split deposit sends one "thank you" per invoice, each with a partial amount. Applying an advance later sends none. | Emit one event per receipt, and emit on allocate too. | Fixed 16fe884 |
| 6.10 | LOW | bug | `src/modules/folio/bank/match.ts:59` | **"Matches the balance" within ₹1 below it leaves paise open.** The invoice stays part-paid, and the reminders keep going. | Write off the rounding, or label the match a part payment. | Fixed bc940a4 |
| 6.11 | LOW | permission | `src/modules/doclinks/app-actions.ts:29-41,44-54` | **The link gate isn't checked per document type.** Someone with only `receipts.write` can mint or revoke public links for quotes and invoices. | Map each kind to its own permission. | Fixed 5b51571 |
| 6.12 | LOW | race | `src/modules/payments/link-service.ts:27-44` | **Two clicks can create two Razorpay links.** | Add a unique partial index, or a claim. | Fixed 989d1b4 |
| 6.13 | LOW | copy | `src/modules/marketing/content/faq/finance.ts:37` | **The FAQ implies Pay now appears automatically once Razorpay is connected.** It actually needs a link created per invoice, at the current balance. | Align the FAQ, or create and refresh the link automatically. | Fixed a741eb0 |
| 6.14 | LOW | missing | `src/modules/doclinks/links.ts:54-61`; `doclinks/respond.ts:29-36`; `load.ts:42` | **Public document links ignore the workspace being disabled or deleted.** Clients can still accept quotes and share UTRs, and automations fire. | Treat such links as missing. | Fixed dbe1f6c |

## Angle 7: Sales

**Checked.**
- **Webhook and web form:** HMAC or token, the origin allow-list, the honeypot, rate limits, and the atomic round-robin.
- **IndiaMART:** the claim, the gap, and deduplication by query id.
- **Sequences:** unsubscribe by link and RFC 8058, the suppression list, the cap given back on failure, cron claims, stage exits, and reply addresses on the Resend path.
- **Deal to Folio:** the hand-off and linking.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 7.1 | MEDIUM | bug | `src/app/api/public/leads/[key]/route.ts:56`; `src/app/api/webhooks/leads/[key]/route.ts:64`; `src/modules/orbit/capture/create.ts:67`; `capture/settings.ts:56-70` | **The web form and webhook accept leads into disabled, read-only or Orbit-less workspaces (re-verified).** Only the key and the enabled flag are checked. The IndiaMART job checks `disabled` and `canWrite` (`indiamart-job.ts:65,69`), and the task webhook refuses read-only workspaces. | In `captureLead`, refuse unless the org is active and `canWrite(org, 'orbit')`. | Fixed a5ee2e0, b7b7416 |
| 7.2 | MEDIUM | bug | `src/modules/orbit/capture/indiamart-job.ts:54-59` | **IndiaMART leads are lost for good when a lead is refused (re-verified).** A `refused` outcome counts as a duplicate, and `lastPulledAt` still advances. The workspace sees "0 new" and no error. | Don't advance the window while any lead was refused, and set `lastError`. | Fixed 5208d40 |
| 7.3 | LOW | copy/missing | `src/components/orbit/lead-capture.tsx:113`; `capture/indiamart.ts:4-6`; `capture/map.ts:129` | **IndiaMART instructions.** The copy says to paste the "Push API key", but the code uses the Pull API. IndiaMART's own push body (`RESPONSE`) isn't unwrapped by the webhook, so it returns 422. | Fix the copy. Optionally unwrap `RESPONSE` and map `UNIQUE_QUERY_ID`. | Fixed fcfc286 |
| 7.4 | MEDIUM | design | `src/modules/orbit/capture/create.ts:70-73,92-93`; `docs/specs/orbit.md:589`; `orbit/leads.actions.ts:66` | **Captured leads skip the spec's duplicate rule** (an open lead with the same company or email) and get no default reviewer. A double-submitted form, or the same buyer from the website and IndiaMART, creates two leads and two alerts. | Match open leads by email or phone and log onto the existing one. Set the reviewer from settings. | Fixed d9401fb |
| 7.5 | MEDIUM | bug | `src/modules/orbit/activities.actions.ts:63-71` | **Logging a "reply" activity doesn't stop the sequence (re-verified).** No `exitLeadEnrollments` call. Only the Replied button, the reply address and terminal stage changes stop it. | Exit with `replied` when a reply activity is logged, and possibly on a move to Engaged. | Fixed f539629 |
| 7.6 | MEDIUM | copy/design | `src/modules/orbit/sequences/delivery.ts:42-45,63`; `lib/env.ts:164`; `faq/sales.ts:37`; `components/orbit/sequence-enroll.tsx:14` | **Replies to Gmail-sent sequence mail don't stop the sequence.** There is no per-enrolment Reply-To on the Gmail path, and Gmail reply detection is off by default. The FAQ says a reply stops it. | Add the reply address as Reply-To on Gmail sends, or correct the FAQ and the enrol dialog. | Fixed 9800568 |
| 7.7 | LOW | design | `src/modules/orbit/sequences/actions.ts:45-50,87`; `sequences/runner.ts:103` | **Editing a live sequence can make leads skip or repeat steps,** because enrolments keep a numeric `stepIndex`. Task steps go to the person who enrolled the lead, not its current owner, and ignore the send window. | Give steps stable ids, or lock structural edits while enrolments are live. Assign task steps to the current owner. | Fixed adcca1f, ce11f6f |
| 7.8 | LOW | wrong numbers | `src/modules/orbit/reports.queries.ts:99`; `sequences/runner.ts:88`; `orbit/constants.ts:46`; `lead-move.ts:22` | **Outreach counts are inflated.** They ignore the sector filter and the lead scope, and automated sequence mails count as outreach. Those mails also unlock Contacted. | Join outreach through `leadId` with the filters. Tag sequence activities and count them separately. | Fixed fc1ed77 (sequence mails still unlock Contacted: owner decision) |

## Angle 8: Agency client (portal)

**Checked.**
- **Sessions:** a separate cookie on path `/portal`, revoked on contact removal or when the portal is switched off.
- **Gate:** the add-on and a workspace with full access.
- **Approvals:** written once and scoped to visible tasks.
- **Files:** limited to shared projects and visible tasks.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 8.1 | MEDIUM | bug | `src/modules/portal/queries.ts:41,47`; `folio/billing-profile/opening.ts:46`; `doclinks/access.ts:13` | **The portal lists opening-balance rows, and their links are dead (re-verified).** There is no `billingType` filter, so "Invoice OB-…" appears, possibly with Pay now. Its doc link says "not available". | Add `billingType: { $ne: 'opening' }`. | Fixed 4beabef |
| 8.2 | LOW | bug | `src/modules/portal/queries.ts:44-45`; `doclinks/load.ts:90`; `app/portal/[slug]/page.tsx:105` | **Pay now shows for a stale link** whose amount no longer equals the balance. The document page then has no Pay button. | Match the link amount to the balance, sharing the helper with `load.ts`. | Fixed fa0fd72 |
| 8.3 | LOW | security | `src/modules/portal/session.ts:84,91-95` | **The sign-in answers reveal which emails are contacts.** A real contact gets "Too many attempts", "expired" or "used". A non-contact always gets "did not match". The attempt counter is also read and then incremented, not atomically. | Use one refusal text. Use `findOneAndUpdate({ attempts: { $lt: 5 } }, { $inc })`. | Fixed 9d3a32c |
| 8.4 | LOW | design | `src/modules/portal/access.ts:13,17-21` | **Inactive clients keep portal access.** `status` is never read. | Refuse when `status !== 'active'`. | Fixed 11d238f |
| 8.5 | LOW | perf/design | `src/modules/portal/queries.ts:47-53`; `doclinks/app-actions.ts:52` | **Up to 100 sequential `ensureDocLink` calls per view.** The view also re-mints links that staff turned off, so "Turn off link" doesn't stick for documents the portal lists. | Batch-load the links. Decide whether revoked documents stay hidden in the portal. | Fixed bba3925 (staff-revoked documents now hidden from the portal: product call to confirm) |

## Angle 9: Flowbit Console

**Checked.**
- **Settings in use:** Console settings feed checkout, plan changes, bills, signup, entitlements, the capacity gate, handover, lifecycle, dunning and welcome templates, help links, and AI and meeting caps. `planConfigFrom` bounds the values.
- **Trial extension:** Sales' single extension is claimed atomically.
- **Offline payments:** maker-checker, UTR uniqueness, provisional access once per bill, and the 7-day expiry.
- **Roles and reports:** the role table matches the spec, and the reports and CSV recheck the role.
- **Health:** the health cron is scheduled.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 9.1 | **HIGH** | design/copy | `src/lib/console/settings-defaults.ts:59`; `src/modules/lifecycle/content.ts:40`; `src/lib/plans.ts:12`; `docs/specs/console.md:23`; `docs/STATUS.md:673` | **Customers are promised "yearly plans are 50% off the first year" (re-verified), but the discount doesn't exist.** Yearly is billed at 10 × monthly (`YEARLY_MONTHS = 10`, "2 months free" in the plan picker). Both sentences appear in the Free-ending email. A customer who acts on it is charged about 17% off, not 50%. | Build the first-year multiplier (ideally as a Console setting), or remove both sentences and align the spec. | Skipped here: owned by fix round B |
| 9.2 | MEDIUM | bug | `src/modules/billing/offline.ts:58`; `billing/offline-core.ts:49`; `billing/settle.ts:40` | **A customer's TDS declaration is lost when no provisional access is granted (re-verified).** `tds.declared` is set only inside `grantProvisional`, which is skipped on a customer's second submission. Settlement reads only the bill's flag. A correct net-of-TDS payment then verifies as "part". | Set `tds.declared` in `create`, or pass `row.tdsDeclared` into the settlement. | Fixed bcc9118 |
| 9.3 | MEDIUM | bug | `src/app/console/(staff)/billing/sections.tsx:40,51`; `billing/rules.ts:202-203` | **The Record-offline pre-fill subtracts received money twice (re-verified):** `paiseToRupees(asks - (b.receivedPaise ?? 0))`, where `asks = billBalancePaise(b)` has already subtracted it. **Repro:** on a ₹11,800 bill with ₹6,000 received, the dialog pre-fills ₹-200. | `amountRupees={String(paiseToRupees(asks))}` | Fixed d1c7c74 |
| 9.4 | MEDIUM | bug | `src/modules/console/accounts-query.ts:57,165` | **The Accounts list and "Call today" count only members (re-verified),** not the product's `max(members + invites, employees)`. The detail page uses `usageOf`, so the list and the detail disagree. An account with 3 logins and 40 payroll employees shows "3 / 5" and never reaches Call today. | Reuse `usageOf`, or aggregate employees as well. | Fixed 81b58d8 |
| 9.5 | MEDIUM | wrong numbers | `src/modules/console/accounts-query.ts:179`; `console/(staff)/billing/page.tsx` | **Home's "overdue" figure (re-verified)** is the subscription price of past-due orgs, not the due bills past their date that Billing shows. | Sum `billBalancePaise` of due bills past their due date. Show past-due subscriptions separately. | Fixed 6c6de20 |
| 9.6 | MEDIUM | bug | `src/components/console/org-actions.tsx:73-75`; `modules/console/account-actions.ts:72` | **The trial-extension dialog hard-codes 15 days (re-verified)** in its copy, help and default value, while the server enforces `salesExtensionDays`. With the setting at 7, the pre-filled 15 is refused. | Pass the setting into `OrgActions`. | Fixed a4aeafe |
| 9.7 | LOW | copy | `src/components/subscription/limit-prompt.tsx:27`; `lib/lifecycle-copy.ts:33`; `lib/lifecycle.ts:133-134`; `console/health.ts:86`; `console/(staff)/page.tsx:27` | **Free seats and Free months are hard-coded** (5, and "6 free months") in prompts, refusals and the Call-today rule. They contradict the setting once it changes. | Thread `planConfig` through, or use `freeReturnMessage(reason, freeSeats)`. | Fixed f619c39, cd6d75e, c1f04b1 |
| 9.8 | LOW | design/copy | `src/modules/console/account-actions.ts:77,81`; `lib/lifecycle.ts:54` | **Extend trial on a Free account** moves only `trialEndsAt`, not `freeEndsAt`, and emails "your free trial". End trial is shown for Free accounts too. | For Free accounts, set `freeEndsAt` and word it "Free plan extended". Label the actions by account type. | Fixed e9a07bd |
| 9.9 | LOW | audit gap | `src/modules/billing/console-actions.ts:97,106` | **Offline verify and reject audit rows carry no `orgId`.** Nothing reaches the workspace's audit log or the Console account timeline, and the account page isn't revalidated. | Pass the payment's `orgId`, as `recordOfflineByStaff` does. | Fixed b4b023b |
| 9.10 | LOW | wrong numbers | `src/app/console/(staff)/billing/page.tsx` | **Billing totals.** The Due total sums `totalPaise`. The Overdue tab ignores the TDS-net amount. The TDS tab shows ₹0 for due bills. | Use `billBalancePaise` everywhere, and `expectedTdsPaise` on due bills. | Fixed c6c9c86 |
| 9.11 | LOW | copy | `src/modules/marketing/legal/terms.ts:18`; `legal/refunds.ts:14` | **Terms and Refunds say every workspace starts with a 15-day trial.** That contradicts the Free model (6 months, 5 seats) in the spec and the FAQ. | Reword both for Free plus Trial. | Fixed 4a93467 |

## Angle 10: AI and integrations

**Checked.**
- **Arc without a key:** degrades to templates with the right header.
- **MCP OAuth:** exact redirect matching, PKCE, the scope ∩ role intersection, refusal of Free, and the next-path round trip.
- **Plan, apply and undo:** the claim, idempotency and the undo checks.
- **Slack:** the manifest matches the code, `/flowbit` answers within 3 s, members are matched by email, and the modal is deduplicated.
- **Webhooks:** all six events fire.
- **Google:** minimal scopes, the bound state, the sealed refresh token, and Meet with `sendUpdates=none`.

**Findings.**

| # | Sev | Type | Where | Finding and repro | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 10.1 | MEDIUM | copy/design | `src/lib/ai-caps.ts:15`; `src/modules/work/arc/claude.ts:28`; `src/modules/work/arc/actions.ts:25,34`; `src/app/app/arc/page.tsx:47` | **On Free, Arc says "This workspace has used its AI requests for this month… resets on the 1st" (re-verified).** Free's cap is 0, so this shows every month. The header meanwhile promises "drafts with Claude". | Use a separate note when the cap is 0 ("AI drafting is on paid plans and trials"), and set `options.ai = aiEnabled() && cap > 0`. | Fixed 34008e5 |
| 10.2 | LOW | bug | `src/modules/work/arc/claude.ts` (the `askClaudeJson` loop with `attempt < 2`) | **A JSON retry counts as two AI requests,** and can report "used up" right after a call ran. | Count one request per user action. | Fixed 1473eea |
| 10.3 | LOW | design | `src/modules/mcp/plan/run.ts:150` | **A plan in which every item failed can't be retried.** It answers "Nothing was changed", but `appliedAt` stays set, so a retry says "already applied". | Reset `appliedAt` when nothing succeeded. | Fixed 78c7d79 |
| 10.4 | LOW | missing | `src/app/api/inbound/email/route.ts`; `faq/integrations.ts` (`email-to-task`) | **Rejected tasks+ emails vanish silently.** No bounce and no notice, for example when a teammate isn't allowed, SPF fails or the daily limit is hit. The FAQ doesn't mention the owner-only rule. | Notify the address owner in the app (deduplicated). Document the rule and the "allow teammates" switch. | Fixed 7d6a417, 57032e2 |
| 10.5 | LOW | copy | `src/modules/marketing/content/faq/integrations.ts:44`; `modules/google/oauth.ts:30` | **The FAQ says "Settings → Google".** The path is Settings → Integrations → Google. | Fix the copy. | Fixed 57032e2 (partly valid: Settings → Google exists in the Personal group; FAQ clarified) |

---

## Top 10 to fix first

1. **3.1 (HIGH):** payroll can be paid on attendance that changed after generation.
2. **1.1 (HIGH):** Remove sample data deletes issued invoices and employees with payroll.
3. **6.1 (HIGH):** reverse-charge GST lands in Round Off in the Tally export and is counted as output tax.
4. **9.1 (HIGH):** customer emails promise 50% off yearly plans that is never charged.
5. **6.5:** Razorpay links stay payable after a void or a settlement, and the payments become silent advances.
6. **4.1:** approval links work without sign-in, including bank-change Verify.
7. **9.2 and 9.3:** a TDS declaration is lost on a resubmission, and the offline pre-fill subtracts received money twice.
8. **6.2:** an invoice with a live IRN can be voided.
9. **7.1 and 7.2:** leads are accepted into disabled workspaces, and refused IndiaMART leads are lost for good.
10. **4.2 and 4.3:** claim and bank-change decisions skip the visibility check, and a timesheet can be decided twice.
