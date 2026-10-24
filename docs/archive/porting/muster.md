# Muster porting inventory

Source: `~/Downloads/Personal work/vistaar-peopleos` (referred to below as **REF**; every path is relative to `REF/src` unless it starts with `REF/`). It is a single-tenant Next 16 + Mongoose app ("Vistaar Muster"), money in integer paise, days as `'YYYY-MM-DD'` strings, Asia/Kolkata.

This file replaces reading REF. It is organised as:

0. Decisions that change when porting (read first)
1. Shared vocabulary both agents use (permissions, lifecycle, approvals, attendance arithmetic, money helpers)
2. Mongo models (owner, fields, indexes)
3. **muster-a** routes and logic
4. **muster-b** routes and logic
5. Domain-logic file index (path → exports → port notes)
6. Bugs and gaps in REF (do not copy them)
7. Seed data

---

## 0. Decisions that change when porting

| REF concept | Flowbit equivalent | Notes |
|---|---|---|
| Single company, `Settings` doc `_id:'company'` | `MusterSettings` doc per org (`orgId` unique) + `Org` (name, address, GSTIN, officeHours, workWeek) | Company legal/display name and address come from `Org`. |
| `Profile` (account → role, `employeeId`) | `Member` (`role`, `employeeId`) via `ctx.member` | "My" pages resolve `ctx.member.employeeId`. Never take the employee id from the URL for self-service. |
| `lib/mongo/scope.ts` `Scope` / `elevated()` | `ctx.db(Model)` (orgId injected) + explicit permission checks | Port the *visibility rules* (who sees whose rows, sensitive-field projection), not the class. |
| Permission strings (`people.read_all`, `payroll.prepare`…) | Flowbit permission keys from `lib/permissions.ts` (foundation) | Mapping table in §1.1. If foundation chose other spellings, map 1:1. |
| `Attendance` collection (13 statuses, keyed by employee) | Muster's own `AttendanceMark` (keyed by `employeeId`) **plus** core `AttendanceDay` (punches, keyed by `memberId`) as an input | Core `AttendanceDay` requires `memberId` and has only 8 statuses, so it cannot hold the payroll mark for employees without a login, nor paid vs sick leave. Precedence for a day: explicit `AttendanceMark` → mapped `AttendanceDay.status` (present/late→`present`, half_day→`half_day`, absent→`absent`, on_duty→`on_duty`, holiday→`holiday`, weekoff→`weekly_off`, leave→ignore) → calendar default (weekly off/holiday) → unmarked policy. On month lock also `updateMany` `AttendanceDay {orgId, date in month} → locked:true` so the check-in widget refuses punches. |
| Statutory rates: one `Settings.statutory` blob **and** a `StatutoryVersion` timeline | Timeline only (`StatutoryVersion` per org), with PT/LWF schedules **per state** | REF generation reads only the timeline; the Settings statutory card is dead weight (bug §6). Flowbit needs a UI to *add* versions (REF only had a script). |
| Employee `fullName`, `officialEmail`, `employeeCode`, `dateOfJoining`, `reportingManagerId`, `primaryWorkState` | `firstName`+`lastName` (store `fullName` too for search/sort), `workEmail` (+`workEmailLower`), `code`, `joinDate`, `managerId`, `ptState` | SPEC §4 names. Full mapping in §2.1. |
| `employmentType` incl. `consultant`, `contractor` | `full_time`, `part_time`, `intern`, `contract` | Map both to `contract`. |
| Storage buckets + HMAC signed URLs (`lib/storage.ts`) | `lib/files.ts` `saveFile(ctx,{kind, entity, entityId})` + `GET /api/files/[id]` | Kinds: `employee_document`, `receipt`, `payslip`, `letter`, `policy`. Permission re-check stays in the route that serves sensitive files (documents/payslips) — see §3/§4. |
| `recordAudit(actor, {action, entityType, entityId, before, after, reason})` | `audit(ctx, {action, entity, entityId, summary, meta})` | Put `before/after/reason` in `meta`. Redact `pan`, `uan`, `esicNumber`, `aadhaar`, `bank.accountNumber` to `'«redacted»'`. |
| `Notification` by `profileId` | `notify(ctx, {userIds, title, body, href, kind})` | Resolve user ids through `Member`. |
| `sendEmail` (Resend) | `sendMail` (`lib/mail.ts`) | Same semantics: store failure, never throw. |
| `flash()` + `redirect()` | `ActionResult.redirect` + toast | UX rules in REF `docs/UX-FLOWS.md` match SPEC §5. |
| Letter numbers by `countDocuments` | `nextSeq(orgId, 'letter:<year>')` | REF can mint duplicates (bug §6). |
| Employee codes `VWX-001` | `nextSeq(orgId,'employee')` with an org prefix (e.g. first letters of org slug, `VW-0001` per SPEC) | REF `suggestEmployeeCode` finds max by string sort. |
| Archive = `deletedAt` set | Exit = status + `exitDate`; keep `deletedAt` only for records created by mistake | REF archiving hides the person from their own exit-month payroll (bug §6). |
| Routes `/people`, `/attendance`, `/leave`, `/time`, `/reimbursements`, `/payroll`, `/reports`, `/settings`, `/me`, `/r/[slug]` | `/app/hr/*`, `/app/me/*`, `/c/[slug]` | Route-by-route mapping in §3 and §4. |

Ownership inside the shared product folder (both agents write `modules/muster` and `models/muster`):

- muster-a: `models/muster/{Employee,Department,Designation,Holiday,LeaveType,LeaveRequest,AttendanceMark,AttendancePeriod,AttendanceCorrection,CompOff,OvertimeClaim,EmployeeDocument,EmployeeRemark,Nominee,BankChange,MusterSettings,PolicyDocument}.ts`, `modules/muster/{shared,lifecycle,approvals,people,attendance,leave,settings,dashboard}/`.
- muster-b: `models/muster/{ClaimCategory,ClaimForm,Claim,OtpChallenge,SalaryComponent,SalaryStructure,StatutoryVersion,PayrollCycle,PayrollEntry,PayrollAdjustment,PayrollHold,Payslip,Letter,LetterTemplate}.ts`, `modules/muster/{claims,payroll,letters,reports,me}/`.
- muster-b imports muster-a's models and pure helpers; muster-a's person tabs (Letters, Payslips) import muster-b's models read-only. If a file you need from the other agent does not exist yet, build a local copy and list it in your report (SPEC §2).

---

## 1. Shared vocabulary

### 1.1 Permissions and visibility

REF permissions (`lib/auth/permissions.ts` `PERMISSIONS`) and the suggested Flowbit key:

| REF key | Flowbit key | Meaning |
|---|---|---|
| `people.read` | `people.read` | Open the People section |
| `people.read_all` | `people.read_all` | See every employee's attendance/leave/claims/documents (without it: own + reporting chain if `people.read_team`) |
| `people.read_team` | `people.read_team` | See the reporting subtree (manager) |
| `people.read_sensitive` | `people.read_sensitive` | PAN, UAN, ESIC, Aadhaar, PF no., bank details, nominations, documents download, verify bank changes |
| `people.write` | `people.write` | Add/edit employees, documents, remarks, raise leave/comp-off/OT for others |
| `people.import` | `people.import` | Bulk CSV import of employees |
| `attendance.read_all` | `attendance.read` | Open the register (rows still narrowed by people visibility) |
| `attendance.write` | `attendance.write` | Mark attendance, import attendance CSV |
| `attendance.lock` | `attendance.lock` | Lock a month |
| (REF used `payroll.unlock`) | `attendance.unlock` | Reopen a locked attendance month (with reason) |
| `leave.approve` | `leave.approve` | Decide leave (HR stage needs this **and** `people.read_all`) |
| `approvals.escalated` | `approvals.escalated` | Decide escalated requests (applicant is HR), waive notice recovery |
| `reimbursement.read_all` | `claims.read` | See all claims |
| `reimbursement.review` | `claims.review` | Approve/reject/schedule claims |
| `reimbursement.manage_forms` | `claims.forms` | Create/close claim forms, manage categories |
| `payroll.read` | `payroll.read` | **The one switch that exposes salary**: structures, entries, cycles, payslips of others, pay-stating letters, gratuity |
| `payroll.prepare` | `payroll.run` | Open month, close claims, generate, adjustments, mark HR reviewed |
| `payroll.approve` | `payroll.approve` | Finance approve |
| `payroll.lock` | `payroll.lock` | Lock payroll month |
| `payroll.unlock` | `payroll.unlock` | Reopen locked month (reason, audited) |
| `payroll.release` | `payroll.release` | Record payment, publish/re-send payslips |
| `people.write`+`payroll.read` | `salary.write` | Save salary structures (REF required both) |
| `letters.read` / `letters.write` / `letters.templates` | same | See / draft+issue / edit templates |
| `reports.read` | `hr.reports` | Non-salary reports (salary reports need `payroll.read`) |
| `settings.write` | `hr.settings` | Departments, designations, holidays, leave types, attendance rules, components, statutory versions |

Built-in role defaults (SPEC §4 roles, informed by REF `SYSTEM_ROLES`):

- `owner`, `admin`: all.
- `hr_admin`: all Muster keys above (SPEC says payroll run/approve too).
- `hr_exec`: `people.read`, `people.read_all`, `people.write`, `attendance.read`, `attendance.write`, `leave.approve`, `claims.read`, `claims.review`, `letters.read`, `letters.write`. No `payroll.*`, no `salary.write`, no `people.read_sensitive` (REF `hr_executive`).
- `finance`: `people.read`, `people.read_all`, `people.read_sensitive`, `attendance.read`, `claims.read`, `claims.review`, `payroll.read`, `payroll.approve`, `payroll.lock`, `payroll.release`, `letters.read`, `hr.reports`.
- `manager`: `people.read`, `people.read_team`, `attendance.read`, `leave.approve` (the routing below limits a manager to the manager stage of their own reports), `letters.read`.
- `member`, `sales`: none (self-service only).

Visibility rules to port from `lib/mongo/scope.ts` (`scopeFor`):

- `visibleEmployeeIds`: `null` (everyone) if `people.read_all`; else if the member has an employee record: reporting subtree (BFS over `Employee.managerId`, max depth 10, cycle-safe, skips deleted) when `people.read_team`, else `[ownEmployeeId]`; else `[]`.
- Employees directory: open to anyone with `people.read`, but the sensitive block (`pan, uan, aadhaar, pfAccountNumber, esicNumber, bank.*`, `originalJoiningDate`, statutory flags) is projected away without `people.read_sensitive`. Writes from someone without it must drop those fields (`withoutSensitive`) — a hidden card is not a control.
- Salary structures, payroll entries: everyone's with `payroll.read`, else own only. Payslips: own **and** `isPublished:true` only. Payroll cycles: `payroll.read` only (they carry company totals).
- Attendance marks, leave requests, claims, documents, remarks: filtered to `visibleEmployeeIds`.
- Bank changes: all with `people.read_sensitive`, else own.
- Salary components: `payroll.read` only.
- **Company-wide work** (generate payroll, lock attendance, attendance export) refuses unless `visibleEmployeeIds === null`: "This needs the whole company's attendance, and your role sees only part of it." (`lib/payroll/company-wide.ts`).

Own-record rule (`lib/auth/self-action.ts`): nobody decides on their own record (review own claim, set own salary, archive/exit self, sign own settlement, verify own bank change, write own pay-stating or exit letter) unless they hold `roles.manage` (Flowbit: `owner`/`admin`, i.e. whoever can grant themselves anything). Refusal text: "This is about your own record, so someone else has to make this decision." Compare ids case-insensitively (`lib/ids.ts`).

### 1.2 The 13 lifecycle statuses (`lib/employment-lifecycle.ts`)

| key | label | stage | tone | in directory | on payroll | meaning |
|---|---|---|---|---|---|---|
| `candidate` | Candidate | pre_joining | neutral | no | no | In the hiring process. No offer has been made. |
| `offered` | Offered | pre_joining | neutral | no | no | An offer has been issued and is awaiting acceptance. |
| `joining_pending` | Joining Pending | pre_joining | warning | no | no | Offer accepted, joining date not yet reached. |
| `intern` | Intern | working | positive | yes | yes | On an internship with a defined end date. |
| `probation` | Probation | working | warning | yes | yes | Employed, within the probation period. |
| `active` | Active | working | positive | yes | yes | Employed and working normally. |
| `confirmed` | Confirmed | working | positive | yes | yes | Probation completed and confirmed in the role. |
| `notice_period` | Notice Period | leaving | warning | yes | yes | Serving notice. Still working and still paid. |
| `resigned` | Resigned | leaving | warning | yes | yes | Resignation accepted, notice not yet served out. |
| `terminated` | Terminated | leaving | critical | no | no | Employment ended by the company. Settlement may be pending. |
| `internship_completed` | Internship Completed | ended | neutral | no | no | Internship finished. Certificate and experience letter are due. |
| `exited` | Exited | ended | neutral | no | no | Left the organisation. Records kept for payroll history. |
| `inactive` | Inactive | ended | neutral | no | no | On the books but not working: long leave, sabbatical, dormant. |

Stage labels: pre_joining "Before joining", working "Working", leaving "Leaving", ended "No longer here". The status picker is grouped by stage (optgroups). Predicates to port: `isInDirectory`, `isOnPayroll`, `hasLeft` (stage ended or terminated), `statusesByStage`, `DIRECTORY_STATUSES`, `PAYROLL_STATUSES`.

**Allowed transitions.** REF enforces none: the edit form accepts any status; the only rules are (a) "Remove from directory" accepts just `exited | internship_completed | terminated | inactive` with a required reason and a real last working day (may be in the future), and (b) you cannot change your own status/exit date (`lib/exit/own-exit.ts`). Implement this table in `modules/muster/lifecycle/transitions.ts` (pure, tested) and enforce it in the edit/exit actions:

| from | allowed to |
|---|---|
| candidate | offered, inactive |
| offered | joining_pending, candidate, inactive |
| joining_pending | intern, probation, active, inactive |
| intern | probation, active, internship_completed, notice_period, terminated |
| probation | confirmed, active, notice_period, resigned, terminated |
| active | confirmed, notice_period, resigned, terminated, inactive |
| confirmed | notice_period, resigned, terminated, inactive |
| notice_period | resigned, exited, terminated, active, confirmed (resignation withdrawn) |
| resigned | notice_period, exited, active, confirmed (withdrawn) |
| terminated | exited |
| internship_completed | probation, active (converted to a job) |
| inactive | active, confirmed, probation, exited |
| exited | none (rehire = new record; keep `originalJoiningDate` only if service is continuous) |

Required fields per target: `exited | terminated | internship_completed` → `exitDate` (last working day) + reason; `notice_period | resigned` → `resignationDate` (notice is counted from it); `confirmed` → offer the Confirmation letter. Audit every change with before/after status.

### 1.3 Approval routing (leave, corrections, comp-off, overtime) — `lib/approvals/*`

Pure rules (port to `modules/muster/approvals/routing.ts`, muster-a):

- `stagesFor({employeeId, managerId}, {applicantCanApprove})`: `['manager']` first if the employee has a manager who is not themselves; then `'management'` if the applicant could sign HR's stage, else `'hr'`. Judged by the **applicant's** accounts (all active members linked to the employee; if none, the `member` role), never by who raised it (`lib/approvals/applicant.ts`).
- Stored on the request as `stages[]`; `completedStages[]`; `decisions[] {stage, decision, decidedBy, decidedByName, decidedAt, note}`. A request with no stages (legacy) routes to `['hr']`.
- `currentStage(stages, completed)` = first not completed.
- `canActOn(actor, request, stage)`: own request refused unless `canDecideOwn`; `manager` stage only the exact reporting manager (any role); `hr` stage needs `leave.approve` **and** `people.read_all` (`canSignHrStage`); `management` needs `approvals.escalated`.
- `hasSayIn`: own request, or any stage could be theirs. Anyone else gets "That request no longer exists, or is not yours to decide." whether or not it exists.
- `decidableBy(actor, requests, managers)` drives the "waiting on you" counts and which rows show Approve/Reject.
- Decide: rejection needs a note; a rejection at any stage settles the request; an approval only advances it unless it was the last stage. Update is conditional on `status:'pending'` (race-safe). Notify the employee only on the final decision. **Add** (REF lacks it): notify the next approver when a request is raised or advanced.

### 1.4 Attendance arithmetic — `lib/attendance/calendar.ts`, `lib/attendance/leave.ts`

Muster mark statuses (`types/domain.ts` `ATTENDANCE_STATUSES`, one list used everywhere):

| status | label (short) | pays (fraction of a day) | leave cost | tone |
|---|---|---|---|---|
| `present` | Present (P) | 1 | – | positive |
| `work_from_home` | Work From Home (WFH) | 1 | – | info |
| `on_duty` | On Duty (OD) | 1 | – | info |
| `paid_leave` | Paid Leave (PL) | 1 | 1 day of the request's type, else PL | info |
| `sick_leave` | Sick Leave (SL) | 1 | 1 day SL (or request's type) | info |
| `paid_half_day` | Paid Half Day (PHD) | 1 | 0.5 PL (or request's type) | info |
| `sick_half_day` | Sick Half Day (SHD) | 1 | 0.5 SL | info |
| `half_day` | Unpaid Half Day (HD) | 0.5 | – | warning |
| `absent` | Absent (A) | 0 | – | critical |
| `unpaid_leave` | Unpaid Leave (UL) | 0 | – | critical |
| `lop` | Loss of Pay (LOP) | 0 | – | critical |
| `weekly_off` | Weekly Off (WO) | 1 | – | neutral |
| `holiday` | Holiday (H) | 1 | – | neutral |

Sources: `manual | leave | holiday | weekly_off | import | default` (+ Flowbit: `punch` when derived from `AttendanceDay`).

`buildMonthCalendar({year, month, weeklyOffDays, holidays, workingDayBasis, employedFrom, employedUntil})` → per day `{date, weekday, defaultStatus, isWorkingDay, isInEmployment, holidayName?}`:
- `defaultStatus` = `holiday` if a holiday, else `weekly_off` if weekday ∈ weeklyOffDays, else `present`.
- `isInEmployment` = `employedFrom ≤ date ≤ employedUntil` (nulls open).
- Counts as a working day by basis: `calendar_days` → every day; `weekly_off_only` (default) → not a weekly off (holidays stay in the divisor, so an absence does not cost more in a holiday month); `calendar_days_minus_weekly_off` → neither weekly off nor holiday. `isWorkingDay = isInEmployment && countsAsWorkingDay`.

`summariseAttendance(calendar, records, {unmarkedPolicy})` → `{workingDays, payableDays, lopDays, unmarkedDays, presentDays, absentDays, halfDays, paidHalfDays, sickHalfDays, paidLeaveDays, sickLeaveDays, unpaidLeaveDays, wfhDays, onDutyDays, weeklyOffDays, holidayDays}`:
- Skip days outside employment. Count weekly offs/holidays (calendar) separately. Skip non-working days.
- For each working day: `workingDays += 1`. If no mark and policy `pending` → `unmarkedDays += 1`, `lopDays += 1` (pays 0, blocks lock). Else status = mark ?? (`present` policy → calendar default; `absent` policy → `absent`). Tally by status; `payableDays += fraction`; `lopDays += 1 − fraction`. `paid/sick_half_day` add 0.5 to paid/sick leave days. Round payable, lop, paid, sick to 2 dp.
- **Fix when porting:** apply the calendar default (holiday / weekly off) to unmarked holidays regardless of policy (REF counts an unmarked holiday under `weekly_off_only` as absent or "unmarked" when the policy is `absent`/`pending`, so holidays block the lock and cost pay). And use the **full month's** working days as the divisor for joiners/leavers (see §6 #1): compute `workingDays` over the whole month and `payableDays` only over in-employment days.

Unmarked policy (`present | absent | pending`): REF code default is **`present`** (OPERATIONS.md agrees; `types/domain.ts` comment says `pending` — stale). Copy on the daily sheet:
- pending: "An unmarked day is not treated as worked. The month cannot be locked, and payroll cannot run, until every day has been marked."
- present: "An unmarked working day is paid as present when the month is locked, on an assumption rather than a record."
- absent: "An unmarked working day counts as absent when the month is locked, and costs a day's pay."
Assumed days must look different from recorded ones (grid and My attendance show them faded with "Not marked yet"/"Upcoming").

Leave day counting (`lib/attendance/leave.ts`):
- `computeLeaveDays({start, end, weeklyOffDays, holidays, isHalfDay})` = count of days in range that are not weekly offs and not (non-optional) holidays; 0 if none; 0.5 if half day.
- `leaveDatesToMark` = those same dates.
- `leaveAttendanceStatus({isPaid, code}, isHalfDay)`: code `WFH` → `work_from_home`; unpaid → `half_day` / `unpaid_leave`; code `SL` → `sick_half_day` / `sick_leave`; any other paid → `paid_half_day` / `paid_leave`.

### 1.5 Money helpers (REF `lib/money.ts`)

Flowbit `lib/money.ts` has `rupeesToPaise`, `paiseToRupees`, `formatINR`. Port the rest into `modules/muster/shared/money.ts` (muster-a creates; muster-b imports) unless foundation already exports them:
- `percentOf(base, pct) = round(base*pct/100)`
- `roundToRupee(p) = round(p/100)*100`; `ceilToRupee(p) = ceil(p/100)*100`
- `prorate(amount, payable, working)`: `working ≤ 0 → 0`; `payable ≥ working → amount`; `payable ≤ 0 → 0`; else `round(amount*payable/working)`
- `sumPaise`
- `amountInWords(paise)`: Indian scale (Crore, Lakh, Thousand, Hundred), "Fifty Thousand Seven Hundred Sixty Nine Rupees Only"; with paise: "… Rupees and Fifty Paise Only"; negative prefix "Minus ".
- `formatINRForPrint` ("Rs. 12,345.00") only if the PDF font lacks ₹; Flowbit registers Work Sans in `lib/pdf/base.tsx`, so prefer ₹.
- `maskAccount(no)`: digits only; ≤4 shown as is; else `'X' × min(len−4, 8)` + last 4.

---

## 2. Mongo models

All product models: `tenant` plugin (`orgId` required+indexed, timestamps). Every unique index starts with `orgId` unless stated. Money = integer paise. Day fields = `'YYYY-MM-DD'` strings. `ref` targets are Flowbit names.

### 2.1 muster-a models

**Employee** (`models/muster/Employee.ts`; SPEC §4 contract + REF extras)

| field | type | from REF | notes |
|---|---|---|---|
| code | string, required | employeeCode | unique {orgId, code}; generated by `nextSeq` when blank |
| memberId | ObjectId→Member? | Profile.employeeId (reverse) | keep in sync with `Member.employeeId` |
| firstName, lastName | string | fullName | |
| fullName | string | fullName | denormalised for search/sort; set in a pre-save |
| avatarFileId | ObjectId? | photoPath | |
| workEmail | string, required | officialEmail | |
| workEmailLower | string | officialEmailLower | unique {orgId, workEmailLower} (a departed employee still holds theirs) |
| personalEmail, phone, gender | string? | same | |
| dob | day? | dateOfBirth | not future, ≥1900, age ≥14 |
| departmentId | →Department? | same | |
| designationId | →Designation? | same | |
| designation | string? | – | denormalised title (SPEC contract field) |
| managerId | →Employee? | reportingManagerId | index {orgId, managerId} |
| employmentType | 'full_time'\|'part_time'\|'intern'\|'contract' | +consultant/contractor | |
| status | 13 statuses | employmentStatus | index {orgId, status} |
| joinDate | day, required | dateOfJoining | |
| originalJoiningDate | day? | same | continuous service for gratuity; null = joinDate |
| exitDate | day? | dateOfExit | last working day |
| resignationDate | day? | same | notice counted from here |
| noticePeriodDays | number? (0–365) | same | contract override; null = policy; 0 is a real value |
| noticeTermsFrom, noticeTermsSource | day?, string? | same | |
| noticeWaivedDays/By/ByName/At/Reason | number, refs, string | same | optional (settlement) |
| workLocation | string? | same | |
| ptState | string? (2-letter) | primaryWorkState | which PT/LWF schedule applies |
| statutory | { pfCovered: bool=false, esiCovered: bool=false, ptExempt: bool=false } | isPfCovered, isEsiCovered, isProfessionalTaxExempt | **must be editable in the UI** (REF had no field for them, §6) |
| isOvertimeEligible | bool=false | same | |
| pan, uan, aadhaar, pfAccountNumber, esicNumber | string? | same | sensitive; PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`, UAN `^\d{12}$` |
| bank | { accountName, accountNumber, ifsc, bankName } | bankAccountHolder, bankAccountNumber, bankIfsc, bankName | sensitive; IFSC `^[A-Z]{4}0[A-Z0-9]{6}$` |
| address | { text: string } (≤400 chars) or structured | address `{text}` | self-service edits as one text block |
| emergencyContact | { name, phone, relation } | emergencyContact* | |
| notes | string? | same | |
| deletedAt | Date? | same | only for "created by mistake" |

**Department** { name, code (UPPER, trimmed), isActive=true, deletedAt? } unique {orgId, code}.
**Designation** { title, isActive=true, deletedAt? } unique {orgId, title}.
**Holiday** { date (day), name, isOptional=false, location? } unique {orgId, date}.
**LeaveType** { code (UPPER), name, isPaid=true, annualQuota (0–365), accrualModel: 'monthly'|'annual'|'service_year'|'on_application', accrualPerMonth (0–31), carryForwardCap: number|null (null = no ceiling, 0 = lapses), isEncashable, proofRequiredAfterDays: number|null (null never, 0 always), allowHalfDay=true, requiresProof=false, displayOrder, isActive=true } unique {orgId, code}.
**LeaveRequest** { employeeId, leaveTypeId, startDate, endDate, isHalfDay, dayCount (≥0), paidDays, unpaidDays, reason, status 'pending'|'approved'|'rejected'|'cancelled', stages[], completedStages[], decisions[{stage, decision, decidedBy→User, decidedByName, decidedAt, note}], approverId→User?, decidedAt?, decisionNote?, attachmentFileId? (new, for proof) } indexes {orgId, employeeId, startDate}, {orgId, status}.
**AttendanceMark** { employeeId, memberId?, date, year, month (1–12), status (13), source, remarks? (≤280), leaveRequestId?, markedBy→User? } unique {orgId, employeeId, date}; index {orgId, year, month}.
**AttendancePeriod** { year, month, status 'open'|'locked', workingDays?, lockedBy?, lockedAt?, reopenedReason? } unique {orgId, year, month}.
**AttendanceCorrection** { employeeId, date, currentStatus?, requestedStatus, reason, status 'pending'|'approved'|'rejected', stages, completedStages, decisions } indexes {orgId, employeeId, date, status}, {orgId, status, createdAt}.
**CompOff** { employeeId, workedOn, days (0.5|1), reason?, expiresOn: day|null, status 'pending'|'approved'|'rejected'|'used'|'lapsed', stages, completedStages, decisions } unique {orgId, employeeId, workedOn}.
**OvertimeClaim** { employeeId, workedOn, hours (0–24), reason, hourlyRate? (paise), multiplier?, amount? (paise), leaveDays? (0–1), leaveExpiresOn?, status 'pending'|'approved'|'rejected'|'paid', stages, completedStages, decisions }.
**EmployeeDocument** { employeeId, docType (see list §3.4), fileId→StoredFile, fileName, mimeType, sizeBytes, notes?, uploadedBy, deletedAt?, deletedReason? } index {orgId, employeeId, createdAt}.
**EmployeeRemark** { employeeId, kind 'performance'|'commendation'|'concern'|'one_on_one'|'general', occurredOn (≤ today), body (3–4000), authorId, authorName, deletedAt?, deletedReason? }.
**Nominee** { employeeId, scheme 'pf'|'gratuity'|'insurance'|'other', name (2–120), relationship (2–60), dob?, sharePercent (0.01–100), address? (≤400), phone? (≤20), effectiveFrom (day), recordedBy, deletedAt?, deletedReason? } index {orgId, employeeId, scheme, deletedAt}.
**BankChange** { employeeId, changedBy→User, changedBySelf, previousMasked, newMasked, newIfsc, verifiedAt?, verifiedBy? } index {orgId, employeeId, createdAt}.
**PolicyDocument** (new) { title, category?, fileId, description?, publishedBy, archivedAt? }.
**MusterSettings** { orgId unique,
  attendance: { workingDayBasis='weekly_off_only', weeklyOffDays: int[] (default = days not in `Org.workWeek`, e.g. [0]), unmarkedPolicy='present', correctionWindowHours=360 (1–8760) },
  payroll: { netPayRounding 'nearest_rupee'|'none' = 'nearest_rupee', payslipPrefix (≤10 of [A-Za-z0-9-]) },
  leavePolicy: { leaveYearStartMonth=4 (REF code default 1, but its accrual docs say April–March), carryForwardPercent=50 (0–100), recordsFrom: day|null=null, allowNegativeBalance=false },
  noticePolicy: { internDays=7, probationDays=30, confirmedDays=90, employerDays=30 },
  overtime: { hoursPerDay=8, hoursPerWeek=48, daysPerMonth=26, overtimeMultiplier=2 (1–5), overtimePayable=false, hoursForHalfDayLeave=4, hoursForFullDayLeave=8, compOffValidDays=0 (0 = never lapses) },
  gratuity: { minimumYears=5, qualifyingDaysInFinalYear=240, daysPerYear=15, daysInMonth=26, roundUpAfterMonths=6, ceilingPaise=2_000_000_00, wageThresholdPercent=50 } }
Read through a zod parse with defaults (REF `lib/settings.ts`), so a missing/malformed doc never breaks pages.

**SettlementSignoff** (optional) { employeeId, step 'manager'|'hr'|'finance'|'founder', decision 'cleared'|'blocked', note?, clearedBy, clearedByName }.

### 2.2 muster-b models

**ClaimCategory** { code, name, maxAmount: paise|null (null = no ceiling), displayOrder, isActive } unique {orgId, code}.
**ClaimForm** { name, slug, slugLower (**globally** unique, because `/c/[slug]` has no org in the URL), description?, opensAt: Date, closesAt: Date, status 'draft'|'open'|'closed', eligibility 'all'|'selected', eligibleEmployeeIds[], categoryIds[], requiresReceipt=true, maxClaimAmount: paise|null, includeInPayroll, payrollYear?, payrollMonth?, createdBy } index {orgId, status}.
**Claim** { formId?, employeeId, categoryId, expenseDate, amountClaimed (≥1 paise), amountApproved: paise|null, vendor?, purpose, project?, description?, paymentMethod?, status (8, §4.1), reviewedBy?, reviewedAt?, reviewNote?, payrollCycleId?, paidAt?, paymentReference?, attachments[{fileId, fileName, mimeType, sizeBytes}] } indexes {orgId, employeeId, status}, {orgId, formId}, {orgId, payrollCycleId}.
**OtpChallenge** { email (lower), codeHash (HMAC-SHA256 with APP_SECRET), purpose (`claim:<formId>`), attempts=0, consumedAt?, expiresAt } TTL index on expiresAt; index {email, purpose}.
**SalaryComponent** { code (UPPER), name, componentType 'earning'|'deduction'|'employer_contribution', calculationType 'fixed'|'percent_of_basic'|'percent_of_gross'|'percent_of_ctc'|'computed', defaultValue (0–100000; % for percent types), isTaxable, isRecurring, countsForPf, countsForWages, countsForEsi, prorateOnLop=true, isSystem, displayOrder, isActive } unique {orgId, code}.
**SalaryStructure** { employeeId, effectiveFrom, effectiveTo: day|null, monthlyGross (paise), ctcAnnual (paise), notes?, createdBy, lines[{componentId, code, calculationType, value (rupees for fixed, % otherwise), monthlyAmount (paise)}] } unique {orgId, employeeId, effectiveFrom}; partial unique {orgId, employeeId} where effectiveTo = null (one open structure).
**StatutoryVersion** { effectiveFrom (legal date), payrollFrom (1st of a month), note?, pf {enabled, employeeRatePercent=12, employerRatePercent=12, wageCeiling=25000 (₹; ₹15,000 before 17 Sep 2026, S.O. 5109(E)), applyCeiling=true, prorateCeiling=false}, esi {enabled, employeeRatePercent=0.75, employerRatePercent=3.25, grossEligibilityLimit=21000}, tds {enabled, mode 'manual'}, pt: [{ state:'MP', enabled, slabs:[{upTo: ₹|null, amount: ₹}], monthOverrides?: [{month, amount}] }], lwf: [{ state, enabled=false, employeeAmount=10, employerAmount=50, remittanceMonths=[6,12] }], confirmedAt?, confirmedBy?, createdBy } index {orgId, payrollFrom}. Never edited once confirmed; corrections are new versions.
**PayrollCycle** { year, month, periodStart, periodEnd, status (9, §4.2), workingDays, totalGross, totalDeductions, totalReimbursements, totalNet, totalEmployerCost, employeeCount, generatedAt/By, hrReviewedAt/By, financeApprovedAt/By, lockedAt/By, releasedAt/By, paymentDate?, paymentReference?, paymentNotes?, payslipsPublishedAt?, notes? } unique {orgId, year, month}.
**PayrollEntry** { cycleId, employeeId, monthlyGross, workingDays, payableDays, lopDays, leaveDays, presentDays, earnedGross, totalEarnings, totalDeductions, totalEmployerContrib, reimbursementAmount, netPay (≥0), status 'ready'|'on_hold'|'excluded', notes?, snapshot (Mixed, §4.2), lines[{code, label, lineType 'earning'|'deduction'|'employer_contribution'|'reimbursement', amount, isAdjustment, reason?, displayOrder}] } unique {orgId, cycleId, employeeId}.
**PayrollAdjustment** { employeeId, cycleId (new; REF keyed by year/month), year, month, lineType 'earning'|'deduction', label, amount (paise), reason, createdBy, voidedAt?, voidedBy?, voidReason? (new) }.
**PayrollHold** (new, REF has none) { cycleId, employeeId, kind 'hold'|'exclude', reason, createdBy, releasedAt? } unique {orgId, cycleId, employeeId}.
**Payslip** { entryId (unique), employeeId, cycleId, payslipNumber (unique per org), fileId, netPay, generatedAt, emailedAt?, emailError?, isPublished } index {orgId, employeeId, isPublished}.
**Letter** { employeeId, templateCode, templateName, category, referenceNumber (unique per org), issueDate, subject, body, signatoryName, signatoryDesignation, inputs (Mixed), variables (Mixed), statesPay: bool, status 'draft'|'issued'|'revoked', fileId?, issuedBy?, issuedAt?, emailedAt?, emailError?, revokedAt?, revokedBy?, revokeReason? (new), createdBy } indexes {orgId, employeeId, createdAt}, {orgId, status}.
**LetterTemplate** { code (unique per org), name, category, subject, body, isActive, updatedBy } — a row exists only when HR edited a template; otherwise the shipped wording is used; "reset" = delete the row.

---

## 3. muster-a

### 3.1 `/app/hr` — HR dashboard (REF `app/(app)/dashboard/page.tsx`)

Purpose: the HR morning view. Permission `people.read` (otherwise redirect to `/app/me`).

Data and sections (all for the current IST month):
- Greeting "Good morning, {firstName}" + "{date} · {N} people on the board".
- **Attention cards** (only those that apply): "{n} leave requests" waiting on *you* (`decidableBy`, links to `/app/hr/leave`); "{n} claims · ₹{pending}" (with `claims.read`, links to claims); "{n} people are missing details" (people.write; links to `/app/hr/people?filter=incomplete`).
- **Today** tiles from *recorded* marks only: In office (`present`), Remote (`work_from_home`+`on_duty`), Paid leave, Sick leave, Absent (`absent`+`unpaid_leave`+`lop`), Half day (the three half statuses), Weekly off and Holiday counted from the calendar (nobody marks a Sunday).
- **People marked in**: last 14 days excluding weekly offs, count of `present|work_from_home|on_duty` per day (zero-filled), sparkline/bar.
- **Month at a glance** strip: per day, marked vs expected.
- **Today's roll call**: `{marked}/{working}` ring and avatar list with state in/remote/leave/absent/unmarked.
- **Payroll** card (`payroll.read`): current month's cycle if open (else latest, and say which); net payable, 9-step phase bar, "Open the register" → `/app/hr/payroll/[id]`. If not open: "{Month} is not open yet. Open the month once its attendance has been locked."
- **Claims** card (`claims.read`): Pending / Approved / Paid totals.
- **Joiners panel** (`people.write`): people whose joining checklist < 100%, sorted by % ascending, first 4 missing labels, link to the person's Profile tab.
- **Payroll readiness** (needs `people.read_sensitive` + `payroll.read`): for employees with `PAYROLL_STATUSES`, gaps among "salary structure" (no open structure), "bank account" (number or IFSC blank), "PAN". Feeds the "missing details" count and directory filter. Values are never sent, only booleans.
Empty state: no employees → "Add your first employee" (people.write) with buttons Add / Import.

Logic: `lib/data/onboarding.ts listOnboardingProgress`, `lib/data/employees.ts listPayrollReadiness`, `lib/approvals/waiting.ts decidableBy`.

### 3.2 `/app/hr/people` — directory (REF `people/page.tsx`, `people-directory.tsx`)

- Permission `people.read`. Rows: everyone visible in the directory (sensitive fields never loaded).
- Columns/cards: avatar, name, code, designation, department, status badge, work email, red "missing: salary structure, bank account, PAN" chips (readiness).
- Filters (URL params): search `q` (name, code, email, designation), Team (department chips), Status (`current` = in-directory statuses (default), `probation`, `notice_period`, `all` = everyone incl. past), `filter=incomplete` toggle (only shown when someone is missing details), layout list|cards. Pagination `?page=`.
- Actions: Add employee (`people.write`), Import (`people.import`), export (link to reports).
- Empty: no employees → "No one here yet" + Add / Import; filtered to nothing → "Nobody matches those filters. Clear the search, or widen the team and status filters."

### 3.3 `/app/hr/people/new` and `/app/hr/people/[id]/edit` (REF `people/new`, `people/[id]/edit`, `employee-form.tsx`, `people/actions.ts`)

Form sections and fields: **Identity** (code — prefilled with the next code; full name → first/last; work email; personal email; phone; date of birth; gender; home address textarea ≤400); **Job** (department select, designation select, reporting manager select (employees), work location, employment type, employment status (grouped by stage), joining date, original joining date (hint: continuous service for gratuity), date of exit, resignation date, notice period days (contract), PT state); **Statutory coverage** (PF covered, ESI covered, PT exempt, overtime eligible) — new, REF had none; **Bank & statutory** (only rendered with `people.read_sensitive`: PAN, UAN, ESIC, Aadhaar (masked display), PF number, bank name, account holder, account number, IFSC); **Emergency contact** (name, phone, relation); **Notes**.

Validation (zod, REF `lib/validation/employee.ts` + `people/employee-dates.ts`):
- code required ≤32; full name 2–120; work email valid, lowercased; personal email valid if given; joining date real; employment type in list; status in the 13 and an allowed transition (§1.2).
- Optional dates are checked on the raw post *before* the schema can blank them: DOB real, not future, ≥1900, age ≥14 ("That would make them younger than 14. Check the year."); exit/original joining dates real.
- PAN/UAN/IFSC patterns after normalising (uppercase, strip spaces); address `\r\n`→`\n`.
- Sensitive fields: dropped from the write without `people.read_sensitive`; a field **not posted** means "keep" (never blank-out). Without sensitive permission a blank `originalJoiningDate` is ignored (they never saw it).
- Duplicate-key: name the one field taken and whose record holds it: "That work email already belongs to Aditi Singh. Use a different one." / "…, who is no longer in the directory" (`people/duplicate-key.ts`).
- Own record: cannot change own status or exit date (`lib/exit/own-exit.ts`).
Results: create → "{name} added." and go to `/app/hr/people/[id]`; edit → "Changes saved for {name}." back to the profile. Audit `employee.created/updated` with redacted before/after.

Exit ("Remove from directory" on the profile): dialog with How are they leaving? (`exited`, `internship_completed`, `terminated`, `inactive`), Last working day (real date, may be future), Reason (required). Sets status + `exitDate`; **do not** set `deletedAt` (§6 #2). Message "{name} removed from the directory. Their record and history are kept." → back to the list. Refuse own record.

### 3.4 `/app/hr/people/[id]` — profile with tabs (REF `people/[id]/page.tsx` + panels)

Header: name, code, status badge, designation · department, manager; actions Edit (`people.write`), Remove from directory, Draft letter (`letters.write`). Not found when not visible.

Tabs (SPEC) and what each shows:
1. **Profile**: contact (work/personal email, phone, DOB, address), emergency contact, **joining checklist** card (REF Onboarding tab, `lib/onboarding/checklist.ts`) with % and missing items, and an **Exit details** card when leaving/left (how they left, last working day, served duration, recorded by — from the audit trail `employee.archived`/status change).
2. **Job**: code, department, designation, manager, join date, original joining date, exit date, work location, employment type, status, notice terms (contract days or policy), statutory coverage flags; for `payroll.read`: current salary (monthly gross, CTC, effective from) with link "Edit salary" → `/app/hr/payroll/structures?employee=[id]` (muster-b).
3. **Documents** (`EmployeeDocument`): list (type, file name, size, uploaded by/at, notes), upload (people.write; type select from list below; PDF/PNG/JPEG/WebP/HEIC ≤10 MB, refusal "Documents must be 10 MB or smaller. Scan it at a lower resolution, or compress the PDF."), archive with reason (never hard-delete). Download requires `people.read_sensitive` + visibility. Types (`lib/employee-documents.ts`): 10th Marksheet, 12th Marksheet, Aadhaar Card, Bank Passbook, Graduation Marksheet, Post-Graduation Marksheet, Previous Employment Relieving Letter, Previous Employment Certificate, PAN card, Photograph, Signed offer letter, Signed employee agreement, Nomination form, Medical, Other.
4. **Nominees** (`people.read_sensitive`): grouped by scheme (Provident Fund, Gratuity, Insurance, Other); add (scheme, name, relationship, DOB (not future), share %, phone, address, effective from); refuse when live shares of the scheme would exceed 100: "That would take the Provident Fund shares to 120%. 80% is already allocated, so at most 20% is left."; flag schemes whose live shares ≠ 100; remove = archive with reason.
5. **Bank & statutory** (`people.read_sensitive`): PAN, UAN, ESIC, Aadhaar (masked), PF number, bank, holder, account (masked unless revealed), IFSC; **bank change history** (date, by self/HR, previous masked → new masked, IFSC, verified badge) with **Verify** button (`people.read_sensitive`, not own; conditional update; "Bank change verified for {name}, account XXXXXXXX1234.").
6. **Remarks** (people.write to see and add): kind, occurred on (≤ today), body (3–4000); list newest first; remove = archive with reason; plus the **activity timeline** (REF Activity tab, `lib/data/activity.ts`): audit entries for this employee with labels ("Employee record created", "Details updated", "Removed from the directory", "Created by bulk import", "Updated their own details", "Changed their own bank account", "Bank account verified", "Payroll adjustment added", "Document filed", …); salary/payroll entries only for `payroll.read`, bank entries only for `people.read_sensitive`.
7. **Attendance**: the person's month (month switcher): summary tiles (working, payable, LOP, paid leave) and day list/calendar (as §4.7 /app/me/attendance), corrections for them.
8. **Leave**: balances panel (§3.7 logic) + their requests; "Apply on behalf" (people.write).
9. **Letters** (`letters.read`, visible person): list (template, reference, issue date, status draft/issued/revoked, emailed); letters that state pay are listed but locked (no subject, no open) for readers without `payroll.read`; picker "Draft a letter" with **suggested** letters first (§4.5 `suggestedLetters`); "Letters people are owed" hint by status (internship completed → completion + experience; notice → resignation acceptance, relieving, experience; probation confirmed → confirmation; salary changed → revision).
10. **Payslips** (`payroll.read`): this person's entries by month (net, status) and payslip downloads.

Joining checklist (`lib/onboarding/checklist.ts onboardingSteps`), derived, never ticked:
- Contact: Personal email, Phone number, Date of birth, Address, Emergency contact (name **and** phone).
- Role: Department, Designation, Reporting manager.
- Statutory: PAN, Bank account (number+IFSC), UAN (optional unless full-time).
- Documents required: 10th Marksheet, 12th Marksheet, Aadhaar Card, Bank Passbook; optional: Graduation, Post-Graduation, Previous Employment Relieving Letter, Previous Employment Certificate, PAN card, Photograph, Signed offer letter, Nomination form.
- Ready: Salary structure (optional unless full-time), Flowbit access (member linked; optional).
- Progress: total = required + optional done; done = required done + optional done; percent rounded. Statutory steps read only booleans (`$trim/$ifNull` projection, `lib/onboarding/record.ts`), so every reader sees the same %.

### 3.5 `/app/hr/people/import` (REF `people/import/*`, `lib/import/csv.ts`, `lib/import/employee-import.ts`)

Two steps: **Check** (no writes; preview of every row with errors and warnings) then **Import** (re-validates the raw CSV server-side; never trusts the preview). Permission `people.import`. Template download (only the columns this user may set).

Columns (header names matched loosely: trim, lowercase, spaces/hyphens → `_`, strip non-alphanumerics; BOM stripped; quoted fields with commas/newlines handled):

| column | required | rule |
|---|---|---|
| employee_code | no | blank → generated; must not exist in org or repeat in file |
| full_name | yes | or `first_name` + `last_name` |
| official_email (→ work_email; accept both) | yes | email shape; not used by anyone in org (incl. departed); not repeated in file ("The same email is on line 4 of this file.") |
| personal_email, phone, gender | no | |
| date_of_birth | no | YYYY-MM-DD, real day, not future |
| date_of_joining | yes | YYYY-MM-DD and a real day |
| employment_type | yes | full_time, part_time, intern, contract (+consultant/contractor → contract) |
| employment_status | no | default `probation`; one of 13 |
| department | no | must exist (name or code, case-insensitive) else error "No department by that name. Add it in Settings first." |
| designation | no | must exist |
| reporting_manager | no | existing employee code or work email |
| work_location | no | |
| monthly_gross | no | number > 0 and < ₹1 crore; blank → **warning** "No salary, so payroll will skip this person until one is added." |
| ctc_annual | no | number > 0 and < ₹15 crore; default 12 × gross |
| pan, uan, esic_number, bank_name, bank_account_holder, bank_account_number, bank_ifsc | no | shape problems are **warnings** not errors; account without IFSC warns "An account number without an IFSC cannot be paid." |
| emergency_contact_name/phone/relation, notes | no | |

Limits: ≤500 rows; unknown columns reported ("extra columns ignored: …"), not rejected. Withheld columns (pay without `payroll.read`; sensitive without `people.read_sensitive`) are dropped before validation and listed. Import is one transaction (all or nothing); a duplicate-key race → "Someone in that file was added by another person while you were reviewing it. Re-check the file and try again." Coverage flags default false, overtime false, notice terms null. Messages: check "3 of 5 rows are ready and 2 need fixing. The preview below says what."; import "5 employees imported. They are in the directory now; 2 rows were left out."
**Fix when porting:** REF creates the salary structure with `lines: []`, which the engine computes as zero earnings (§6). Build default lines: BASIC 50% of gross, HRA 40% of basic, SPECIAL fixed = remainder (gross − basic − HRA), resolved with `resolveStructure`.

### 3.6 `/app/hr/attendance` — month register, mark/override, lock (REF `attendance/*`, `lib/data/attendance.ts`, `lib/attendance/calendar.ts`, `lib/mongo/guards.ts`)

Permission `attendance.read`; rows narrowed to visible employees whose employment window overlaps the month. Views via `?view=day|month&year=&month=&date=`.

- Header: month picker; Reopen month (`attendance.unlock`, when locked; reason required); Import CSV (`attendance.write`); Lock month (`attendance.lock`, only when the reader sees everyone and the month is open).
- Tiles (summed across everyone, each with a "per person" hint): People on the sheet, Payable days, LOP days ("costs pay" in red), Paid leave.
- **Daily view** (default; date tabs Day-before-yesterday / Yesterday / Today): one row per person with avatar, name, department; tap a status and it saves immediately (optimistic, toast "Aditi Singh marked Work From Home for 1 Oct 2026."). Options: Present, WFH, Paid leave, Sick leave, Half·paid, Half·sick, Half·unpaid, Absent. Unmarked rows show "Not marked yet" with nothing highlighted (do not pre-highlight Present). Progress "12 of 18 marked" + **Mark remaining N present**. Callout with the unmarked-policy text (§1.4) when editable and anything is unmarked. Read-only users see badges, not buttons.
- **Month grid**: rows = people, columns = days (weekday header, holidays named on hover), cells coloured by status (red only where pay is lost; off/holiday no fill; assumed days faded), per-row summary (payable/LOP). Paint mode: pick a brush (all 13 incl. Weekly off and Holiday, because some Saturdays are off), click cells, then **Save N changes** (batch). Bulk: from/to dates + status (+ selected people or all) applies to working, in-employment days. After save only the posted cells are cleared (cells painted during the save survive, `unsaved-edits.ts editsLeftAfterSave`).
- Save action (`saveAttendanceMarks`): `attendance.write`; batch JSON of `{employeeId, date (real ISO), status (13), remarks ≤280}`; checks **every** month touched is open, inside one transaction; upsert by {orgId, employeeId, date} with source `manual`. Locked month → "That month is locked. Ask someone with unlock rights to reopen it before editing." Message "3 attendance marks saved for October 2026."
- Lock (`lockAttendancePeriod`): `attendance.lock`; period valid (year 2000–2100, month 1–12); reader must see everyone; refuse while any unmarked days (only possible under `pending`): "4 days across 2 people are still unmarked. Mark them before locking — Aditi Singh (3), Ravi Kumar (1)." Upsert period locked + workingDays (first row's) + lockedBy/At; also lock core `AttendanceDay` docs of that month. Message "October 2026 attendance locked for 18 people. Payroll can now be generated for it." Audit.
- Reopen: reason required; only flips a locked month; audit with reason; message "October 2026 attendance reopened. Regenerate its payroll once the corrections are in." **Add**: refuse (or warn) when that month's payroll is locked or later.
- Every attendance write path checks the lock first (`assertAttendanceMonthOpen`), throwing `MonthLocked("Attendance for Oct 2026 is locked and cannot be modified.")`: grid save, daily tap, leave approval, correction approval, import, holiday add/remove.
- Empty: reader sees nobody (no employee record, no read_all) → "Your account is not linked to an employee record"; otherwise "No one was employed in this month" (+ Add employee for people.write) (`empty-sheet.ts`).

**Attendance import** (panel/dialog on this page; REF `attendance/import/*`, `lib/import/attendance-import.ts`): columns `employee_code` (must exist, not deleted), `date` (YYYY-MM-DD, real day, not future, not in a locked month, within employment window), `status` (13 or aliases: P, A, AB, WFH, W, OD, PL, L, LEAVE, SL, SICK, PHD, SHD, HD, HALF, UL, LWP, LOP, WO, OFF, H …), `remarks` (≤280). Same person+day twice in a file = error on both lines. Weekly off/holiday rows warn "The calendar sets weekly offs and holidays itself. This will override it." ≤5000 rows. Two steps (check, write); write re-validates, re-checks locks, `bulkWrite` upserts with source `import`, one transaction. Permission `attendance.write`. Messages: "40 rows checked: 38 ready to write, 2 to fix first." / "38 attendance marks written for September 2026 and October 2026."

### 3.7 `/app/hr/attendance/corrections` — corrections, comp-off, overtime (REF `time/*`, `lib/attendance/correction.ts`, `lib/time/overtime.ts`)

Tabs: Corrections | Comp-off | Overtime; status tabs Awaiting decision / Approved / All. Permission `attendance.read`; Approve/Reject shown only where `mayDecideAt` allows (manager stage = the exact reporting manager regardless of role). Tiles: Awaiting decision, Comp-off in hand (approved, not expired; hint "lapses after N days" or "does not lapse"), Showing. Columns: Employee, What (correction "Absent → Present" / comp-off "1 day" / overtime "5 h"), Day worked, Worth (days of leave or ₹ — ₹ only to `payroll.read`), Where it sits (stage + signatures), Decide. Raise forms for comp-off/overtime: "Who" list = self only unless `people.write` (then visible people).

**Corrections** (raised from `/app/me/attendance`; decided here):
- Requestable statuses only: `present`, `work_from_home`, `on_duty`, `half_day` ("Leave spends a balance, so it goes through the leave screen where the balance is checked.").
- Day must be real, not future, ≥2000; within the correction window measured from the **end** of that day in IST: `now − (date 23:59:59) ≤ windowHours` (default 360 h, shown as "Within 15 days of the day itself."; past it: "That day is outside the 15-day window for corrections. Ask HR to change it directly."). Month must be open. One pending correction per person+day. Refuse if the day already has the requested status ("That day is already marked Present."). Records `currentStatus`.
- Routed by §1.3. Final approval re-checks the lock and upserts the mark with source `manual`, remarks "Corrected: {reason}". Audit `attendance.correction_{decision}`.

**Comp-off** (`claimCompOff`, `compOffEarned`, `compOffExpiry`):
- Worked day: real, not future, ≥ join date. The day must already be **marked** on the sheet ("A comp-off is earned by work that was recorded, so mark the day first.").
- Earned only if the day was off (weekday ∈ weekly offs, or a holiday): mark `present|work_from_home|on_duty` → 1; `half_day|paid_half_day|sick_half_day` → 0.5; else 0 ("That day was off but not worked…" / "That was a normal working day. Comp-off is for giving up a day that was already off.").
- When overtime is repaid in leave (`overtimePayable=false`), refuse if an overtime claim (pending/approved) exists for the same day, and vice versa ("…would pay for the same day twice.").
- `expiresOn = workedOn + compOffValidDays` (null when 0). Unique per person+day ("A comp-off has already been raised for that day.").
- Balance: approved and not expired comp-offs + approved overtime `leaveDays` (not expired) = earned; taken = approved leave requests of type `COMP_OFF` (all time). `used`/`lapsed` statuses are never written in REF (expiry is computed).

**Overtime** (`claimOvertime`, `valueOfOvertime`):
- Hours 0 < h ≤ 24 ("A day has only 24 hours. Claim each day on its own."); reason required; when `overtimePayable` the employee must be `isOvertimeEligible`.
- On final approval, freeze the value: if not payable → `leaveDays = leaveForExtraHours(h)` (≥ hoursForFullDayLeave → 1; ≥ hoursForHalfDayLeave → 0.5; else 0) and `leaveExpiresOn`; if payable → `hourlyRate = round(wageBase / (hoursPerDay × daysPerMonth))`, `amount = round(rate × hours × multiplier)` where `wageBase = statutoryWageBase(open structure lines, 50%)` (§4.3). REF never feeds approved overtime amounts into payroll (gap): add them as earning adjustments when payable.
- `overtimeHours(daily[], {perDay, perWeek}) = max(Σ max(0, h − perDay), max(0, Σh − perWeek))` exists for weekly computation (unused in UI).

### 3.8 `/app/hr/leave` — requests and approvals (REF `leave/*`, `lib/data/leave.ts`, `lib/leave/*`)

Permission `leave.approve` (a manager sees only their chain). Tabs Pending / Approved / Rejected / All. Tiles: Awaiting decision (decidable by you), Days requested, Showing. Columns: Employee, Type, Dates (span, "(half day)"), Days (with paid/unpaid split), Reason, Status + where it sits (stage, signatures). Row actions: Approve / Reject (note required on reject) when decidable. "Apply on behalf" (people.write).

Apply (`applyForLeave`, used by `/app/me/leave` too):
- Fields: leave type, start, end, half day (only if the type allows; enforce server-side too), reason (≥3, "Tell your manager why"), proof file when `requiresProof` or dayCount > `proofRequiredAfterDays` (REF never enforced).
- `leaveRangeProblem`: real dates; end ≥ start; half day ⇒ same date; start ≥ join date ("Leave cannot start before the day they joined, 1 Sep 2026."); start ≥ 2000-01-01; start ≤ today + 1 year; span ≤ 366 days.
- `dayCount = computeLeaveDays(...)`; 0 → "That range contains only weekly offs and holidays — no leave is needed."
- Split against balance (`splitAgainstBalance(requested, available)`: paid = min(requested, max(0, available)), unpaid = rest, rounded 2 dp) for paid types; unpaid types → all unpaid. Show the split before submit and in the toast: "Paid Leave requested: 5 Oct – 9 Oct, 5 days, waiting for approval. 3 paid from the Paid Leave balance and 2 as loss of pay, because the balance does not cover the whole period."
- Route with §1.3; create pending; audit; **notify** the first approver (new).
- **Fixes:** on final approval write `paidDays` worth of the paid mark and the remaining `unpaidDays` as `unpaid_leave` (REF writes the paid mark on every date, §6 #3). `on_application` types (maternity, paternity) are granted up to `annualQuota` per leave year, not split against a zero balance; `WFH` is not a balance at all (§6 #4).

Decide (`decideLeaveRequest`): §1.3 rules; a missing leave type blocks approve but not reject; final approval: compute dates to mark and the mark status, refuse up-front if any month is locked ("Attendance for 2026-10 is locked, so this leave cannot be approved yet. Reopen that month first, then approve."), then in one transaction record the decision (conditional on pending) and upsert marks (source `leave`, `leaveRequestId`), re-checking the lock inside. Messages: intermediate "Leave approved for Aditi Singh, 2 days, and sent to HR, who will check the balance and policy."; final "Leave approved for Aditi Singh, 2 days: 5 Oct 2026 – 6 Oct 2026 marked on the attendance sheet."; reject "Leave rejected for Aditi Singh: Paid Leave, 5 Oct 2026. They have been told, with your note."
Cancel (`cancelLeaveRequest`): only `pending`; own request, or anyone's by an HR-stage signer. "Leave request withdrawn: Paid Leave, 5 Oct 2026." (REF has no cancellation of approved leave; add "Cancel approved leave" for HR that removes the marks if the month is open.)

### 3.9 `/app/hr/leave/calendar` (new; REF has none)

Month view (month switcher) of approved (solid) and pending (outlined) leave per person, holidays and weekly offs shaded, filter by department; click a day → who is off. Permission `leave.approve` (chain-limited) or `people.read_all`. Empty: "No leave this month."

### 3.10 `/app/hr/leave/balances` (REF `leave/team-balances.tsx`, `lib/data/leave-balances.ts`)

Table per visible person: name, code, department, accrues? ("Does not accrue" for interns/contract/probation), and for each earned type (not on_application): accrued / taken / remaining. As-of date picker (default today). Permission `leave.approve` or `people.read_all`.

Balance computation (`getLeaveBalances(employeeId, asOf)`), nothing stored (the `LeaveBalance` collection in REF is unused):
- Leave year = `leaveYearFor(asOf, leaveYearStartMonth)`.
- Taken = attendance marks with a leave cost (§1.4) in the year, bucketed by the **request's** leave type code when the mark has a `leaveRequestId`, else by the mark's default (PL/SL).
- Accrual (`lib/leave/accrual.ts entitlementFor`): only if `accruesLeave` = employmentType `full_time` **and** status ∈ {active, confirmed, notice_period} (probation excluded in code, though comments say included — decide and document; default: follow code). Models:
  - `monthly`: months from the first earned month (join month if joined on/before the 15th, else next month) to min(year end, asOf, exitDate); a month counts once its 1st has arrived and the person had not left before it; `× accrualPerMonth`, 2 dp.
  - `annual`: `toHalfDay(annualQuota × eligibleMonths / 12)` granted up front; eligibleMonths = months employed in the year, skipping the join month if joined after the 15th.
  - `service_year`: completed service years (from join date to asOf/exit) × annualQuota, capped at carryForwardCap.
  - `on_application`: 0.
- Opening balance (carry forward, `lib/leave/carry-forward.ts`) only for `monthly`/`annual` types: replay prior leave years (only years wholly after `recordsFrom`, overlapping employment, max 10): `opening = fold(prev → min(carryForward(prev + accrued − taken, pct), cap))`, `carryForward(x, pct) = x ≤ 0 ? 0 : round_half(x × pct/100)`; cap 0 → nothing; `recordsFrom` null → nothing carries.
- remaining = opening + accrued − taken (service_year capped). Comp-off row only when there is any comp-off activity (§3.7).

### 3.11 `/app/hr/settings` — tabs (REF `settings/*`, `settings/lists/*`)

Permission `hr.settings` to write; read with `people.read`. Every change audited.

- **Departments**: list (name, code, people count); add (name + code, code uppercased; re-adding a removed code revives it; duplicate → "The code PROD already belongs to Production."); edit name; remove refused while any in-directory employee holds it ("Production cannot be removed: it is the department of Aditi, Ravi and 4 more. Move them to another department from their People records first."); removal is soft (people who left keep it). "Department added: Production (PROD)."
- **Designations**: same pattern (title unique per org).
- **Holidays**: list for a year (± year switcher; date, name, optional/company badge); add (date real and within ±1 year of today; name required; optional flag); refuse adding into a month whose payroll has been generated (cycle status ≠ attendance_open) or whose attendance is locked; remove refused when the month is closed, when approved leave was counted around it (non-optional), or when someone earned a comp-off on it (`settings/in-use.ts holidayInUse`). Duplicate date → "20 Oct 2026 already has a holiday: Diwali." Message "Holiday added: Diwali, 20 Oct 2026 (optional)."
  Treat optional holidays consistently: REF excludes them from leave counts but includes them as paid holidays in the attendance calendar (§6). Recommended: optional holidays are *not* company holidays for the calendar; an employee takes one as paid leave.
- **Leave types & policy**: leave types table (code, name, paid, model, days/year, per month, carry cap, half day, proof) with add/edit/retire/restore and "Load the standard set" (inserts missing codes only); validation (`lib/reference-lists.ts leaveTypeSchema`): code `^[A-Z][A-Z0-9_]*$` 2–20; name 2–60; annualQuota 0–365; accrualPerMonth 0–31; proofRequiredAfterDays blank|0–365; carryForwardCap blank|0–365; order 0–9999. Policy card (REF had no UI): leave year start month, carry-forward %, records-from date, notice policy days (intern, probation, confirmed, employer). Keep at least one unpaid type (warn when none).
- **Attendance rules**: working-day basis (weekly_off_only "Weekly offs only (holidays are paid working days)" / calendar_days_minus_weekly_off / calendar_days), weekly offs (checkboxes Sun–Sat; at least one, not all seven), unmarked days policy, correction window (hours, shown in days), comp-off validity days, overtime (payable?, multiplier, hours/day, hours/week, days/month, hours for half/full day leave), and payroll rules (net pay rounding, payslip prefix) — REF `payroll-rules.ts readPayrollRules`. "Attendance rules saved. They apply the next time payroll is generated."
- **Policies documents** (new): upload company policy PDFs (title, category, file ≤10 MB), list, archive; shown to everyone on `/app/me/documents`.

Empty states: each list "No departments yet — add the first" etc. Note: salary components and statutory versions live in `/app/hr/payroll/structures` (muster-b); claim categories in `/app/hr/claims/forms` (muster-b).

---

## 4. muster-b

### 4.1 Claims

Claim statuses: `draft` (never used), `submitted` (on submit), `under_review` (never set in REF; either drop or set when a reviewer opens it), `approved`, `partially_approved`, `rejected`, `scheduled_for_payroll`, `paid`. Undecided = submitted, under_review. Decisions are final: a scheduled claim's decision cannot change ("That claim is already in a payroll month, so its decision can no longer change.").

**`/app/hr/claims` — review queue** (REF `reimbursements/page.tsx`, `review-queue.tsx`, `schedule-panel.tsx`, `actions.ts`)
- Permission `claims.read`; actions need `claims.review`. Tabs: To review (submitted+under_review), Approved, Scheduled, Paid, Rejected, All. Tiles: Pending ₹ (count), Approved ₹, Paid ₹, Rejected ₹.
- Columns: Employee, Expense (date, purpose, vendor, project), Category, Claimed, Approved, Status, receipts (opens a short-lived file link; missing file → say so).
- Review: Approve (full), Adjust (amount + note; amount > 0, ≥₹0.01, ≤ claimed, compared in paise; partial needs a note "Explain why the claim was reduced."), Reject (note required). Drafts of the Adjust panel kept in queue state so a refusal keeps typing (`review-drafts.ts`). Conditional update on undecided; own claim refused. Email + notify the claimant (headline "Your claim was approved / partly approved / not approved", approved amount, note — escape HTML). Messages (`claim-messages.ts`): "Claim approved for Aditi Singh, ₹1,250.00. It is ready to send to payroll." / "₹800.00 of ₹1,250.00 approved for Aditi Singh. It is ready to send to payroll." / "Claim of ₹1,250.00 rejected for Aditi Singh. They are emailed the reason."
- Bulk approve (full amounts only; own claims in batch refuse the whole batch; skipped ones said).
- **Schedule into payroll** panel: approved/partially approved claims with no cycle (own excluded), all ticked by default (remember only un-ticks), pick an open cycle (status not locked/released/published), submit → `scheduled_for_payroll` + `payrollCycleId`. "3 claims scheduled into October 2026 payroll, ₹4,200.00 in all. They are paid when that month is released."
- **Enforce category ceilings** (`ClaimCategory.maxAmount`) at submit (REF doesn't).
- Empty copy by tab (`empty-copy.ts`): "Nothing is waiting for review." / All with forms right: "Create a claim form and share its link so the team can submit expenses."

**`/app/hr/claims/forms`** (REF `reimbursements/forms/page.tsx` + `forms/new/form-builder.tsx`) — permission `claims.forms`
- Tabs Forms | Categories. Forms table: Form (name), Link (`/c/{slug}`, copy), Window ("4 Oct 2026 – 10 Oct 2026" in IST days), Payroll month, Status (draft/closed/upcoming/open/ended computed by `claimFormState`), actions Open/Close/Reopen.
- New form (dialog or inline): name (≥3), slug (≥3, `[a-z0-9-]`, globally unique → "That link slug is already in use."), description, opens on (date, stored IST 00:00:00), deadline (date ≥ opens and ≥ today, stored IST 23:59:59), categories (≥1), receipt required (default on), include in payroll (default on) + payroll month (YYYY-MM, 2000..thisYear+1), max per claim (blank = none; >0, ≥₹0.01, ≤₹10,00,000), eligible employees (none ticked = everyone). Created as `open`. Message names who can use it and when: 'Claim form "October expenses" created, open to everyone until 10 Oct 2026. Share its link below.' (future opening: '…created for everyone. It opens on 4 Oct 2026 and takes claims until 10 Oct 2026. Share its link below: before it opens, the link shows that date.'). Status changes: "Submissions closed for {form}. Its link no longer takes claims." / "{form} reopened. Its link takes claims until …".
- Categories: code/name/ceiling (blank = no ceiling; 0–₹10 cr)/order, retire/restore, "Load the standard set" (Travel, Fuel, Food, Client Meeting, Office Purchase, Software, Courier, Other).

**`/app/hr/claims/forms/[id]`** (new): form details and status controls, the link with copy, eligibility list, categories, and the claims filed on this form (same columns as the queue). Edit name/description/deadline (deadline not before today).

**`/c/[slug]` — public claim form** (REF `app/r/[slug]/*`, `lib/claim-session.ts`)
- Resolve form by `slugLower` (global); 404 if missing. Header: org name/logo, form name, description, badge Open / Closed / "Opens on 4 Oct 2026", "Deadline 10 Oct 2026".
- Not open → callout ("This form takes claims from … to …. Come back then." / "This form is no longer accepting claims. Speak to HR if you still need to file an expense.").
- Step 1 email: work email → `requestClaimOtp`: always the same reply "If {email} can claim on this form, a six digit code is on its way. It lasts 10 minutes." Eligible = employee in the form's org with that `workEmailLower`, not deleted, `isOnPayroll(status)`, and in `eligibleEmployeeIds` when eligibility is `selected`. Consume older live codes for the same email+purpose; store HMAC hash, attempts 0, expiry 10 min; email the code (subject "{code} is your {org} verification code"). **Add** a throttle (e.g. 5 codes per email per hour).
- Step 2 code: `verifyClaimOtp`: latest unconsumed challenge; expired → "That code has expired. Request a new one."; attempts ≥5 → "Too many attempts. Request a new code."; mismatch → increment attempts, "That code did not match."; re-check eligibility; consume; set cookie `fb_claim` (httpOnly, sameSite lax, secure on https, path `/c/{slug}`, 1 h) = base64url(JSON{orgId, employeeId, formId, email, exp}).HMAC (timing-safe compare). "Verified as Aditi Singh. File your claim below."
- Step 3 claim: category (form's categories), expense date (real, not future), amount (>0, ≥₹0.01, ≤₹10,00,000, ≤ form cap "Claims on this form are capped at ₹5,000.00.", ≤ category ceiling), vendor, purpose (≥3), client/project, description, payment method, receipt (required if form says; PDF/PNG/JPEG/WebP/HEIC ≤10 MB). Store file via `saveFile` (kind receipt, entity Claim); if storage fails, delete the claim and say so. Session lapsed → "Your session on this form has ended. Verify your work email again above; the claim you typed is kept." (form keeps input). Success "Claim for ₹1,250.00 submitted: Client lunch. HR reviews it, and you are emailed the decision."
- Below: "Your claims on this form" (Date, Purpose, Claimed, Approved, Status) and "Not you? Sign out" (`endClaimSession`).
- Runs without a Flowbit session: the route is public; build an org-scoped db handle from the form's `orgId` (no `ctx`).

### 4.2 Payroll

**Nine statuses** (8 SPEC stages after the initial open state), `PAYROLL_STAGES` labels/short:
`attendance_open` Attendance Open/Att. open → `attendance_locked` Attendance Locked/Att. locked → `reimbursements_closed` Reimbursements Closed/Claims closed → `generated` Payroll Generated/Generated → `hr_reviewed` HR Reviewed → `finance_approved` Finance Approved/Approved → `locked` Payroll Locked/Locked → `released` Salary Released/Released → `payslips_published` Payslips Published/Payslips. `isLocked(status)` = index ≥ locked.

What each step checks (REF `payroll/actions.ts`, `stage-rules.ts`, `lib/payroll/generate.ts`, `lib/mongo/guards.ts`):

| step | action | perm | allowed from | gate checks | effect |
|---|---|---|---|---|---|
| Open month | createPayrollCycle | payroll.run | – | month `YYYY-MM`, 1–12, year 2000..thisYear+1; one per month (existing → go to it, "October 2026 payroll was already open. Here it is.") | status `attendance_locked` if the attendance period is locked else `attendance_open`. **Add:** when attendance is later locked/reopened, move the cycle between these two (REF never updates it). |
| 1 Attendance locked | (lock in /app/hr/attendance) | attendance.lock | – | §3.6 | – |
| 2 Claims closed | closeReimbursements | payroll.run | attendance_open/locked only | already closed or later → stale refusal | transaction: claim forms with this payroll month & status open → closed; cycle → `reimbursements_closed`. Optional in REF (generation doesn't require it). Decide: make it required, or keep optional but list unscheduled approved claims as a warning. |
| 3 Generate | generatePayroll | payroll.run | any status before `locked` (re-run = Regenerate) | reader sees everyone; cycle not locked; **AttendancePeriod locked**; a statutory version exists for the month **and is confirmed** (else "No statutory rates are configured for 2026-10. Add them in Settings before generating this month." / "The rates for 2026-10 — effective 2026-09-17 — have not been confirmed yet. Have them checked, then confirm them in Settings.") | see "Generation" below; status → `generated`. On regenerate clear hrReviewed/financeApproved stamps (REF leaves them). |
| 4 HR reviewed | advancePayrollStage target hr_reviewed | payroll.run | generated | employeeCount > 0; conditional update on current status | stamp hrReviewedAt/By |
| 5 Finance approved | target finance_approved | payroll.approve | hr_reviewed | same; confirm dialog "Confirm the salary register is correct." | stamp |
| 6 Locked | target locked | payroll.lock | finance_approved | confirm "Every figure is frozen…" | stamp; from here entries, adjustments, claim scheduling refuse (`assertPayrollUnlocked`) |
| 7 Released | releaseSalaries | payroll.release | locked | payment date required, real, not future ("That day has not come yet. Record the payment once the bank has made it."); bank reference (UTR) required; notes optional | transaction: status released, releasedAt/By, payment fields; claims of this cycle `scheduled_for_payroll` → `paid` (paidAt, paymentReference). **Fix:** only mark paid the claim ids present in entries' `snapshot.reimbursement.claimIds`; warn about scheduled claims not in the register. |
| 8 Payslips published | publishPayslips | payroll.release | released or payslips_published (= Re-send) | – | for each entry (skip `on_hold`/`excluded`): render PDF, `saveFile`, upsert Payslip by entryId (isPublished true), email with attachment; status → published. 0 generated → refusal; email failures → success + warning listing people by reason ("Email is not set up for Muster yet: A, B and 3 more."). |
| Reopen | unlockPayroll | payroll.unlock | locked, released, payslips_published | reason required (kept in audit) | status → generated, clear locked + financeApproved stamps. Must then regenerate and republish. **Add:** warn that released payments/paid claims are not reversed; prefer next-month arrears/recovery adjustments. |

Stale-page refusals: a step pressed on an out-of-date page refreshes the page and says where the month is ("October 2026 payroll was already approved by Finance. The page has been refreshed to show where the month is.").

**Generation** (`generatePayrollForCycle`):
1. People = month attendance rows (employment window overlaps month). **Fix:** exclude `candidate|offered|joining_pending`, include people who exited inside the month (§6 #2).
2. Skip anyone without a structure in force on `periodEnd` ("No salary structure is in force for this month."); report skipped grouped by reason, names listed (max 5 per reason then "and N more"), kept on the page until the next generation.
3. Inputs per person: structure (monthlyGross, ctcAnnual, lines with component flags), attendance summary (working, payable, LOP), adjustments for the cycle (not voided), approved reimbursement total of claims scheduled into this cycle (status scheduled or paid; amountApproved ?? amountClaimed), coverage from the employee record (`pfExempt = !pfCovered`, `esiExempt = !esiCovered`, `ptExempt`), `ptState` schedule, month number, rounding setting.
4. Holds (new): `PayrollHold.kind='exclude'` → no entry (listed as skipped "Excluded: {reason}"); `'hold'` → entry computed with status `on_hold` (not published, not in release totals until released from hold).
5. Write in one transaction: delete the cycle's entries, insert new ones with lines and the snapshot, update cycle totals: gross = Σ totalEarnings, deductions = Σ totalDeductions, reimbursements = Σ reimbursementAmount, net = Σ netPay, employerCost = Σ (totalEarnings + employer contributions), employeeCount, workingDays (first row), generatedAt/By.
6. Snapshot `{ version:1, generatedAt, employee{id, code, name, department, designation, joinDate, pan, uan, bankName, bankAccountMasked}, structure{id, effectiveFrom, monthlyGross, ctcAnnual, lines}, attendance (summary), adjustments, reimbursement{total, claimIds}, statutory (settings used), statutoryVersion{effectiveFrom, payrollFrom, note}, payrollSettings, result{…rupee figures, pfWage, esiWage, lines, warnings} }`. Re-running the engine over it must reproduce the entry.
Messages: "Payroll generated for 18 employees. 2 skipped, named below. Check the register, then mark it HR reviewed." / "Nobody could be paid: 3 skipped, named below. Fix that, then generate again."

**The engine** (`lib/payroll/engine.ts computePayroll`, pure, paise internally):
1. `resolveStructure(gross, ctc, lines)`: only **earning** lines; BASIC resolved first; per line: fixed → `toPaise(value)`; percent_of_gross → `percentOf(gross, v)`; percent_of_basic → `percentOf(basic, v)`; percent_of_ctc → `percentOf(round(ctcAnnual/12), v)`; computed → 0. If Σ ≠ monthlyGross → warning "Salary components do not add up to the monthly gross (off by ₹x). Review the structure before locking payroll."
2. Earned per earning line = `prorateOnLop ? prorate(full, payableDays, workingDays) : full`; skip lines where both are 0. `earnedGross = Σ earned`; `pfWage = Σ earned where countsForPf`; `esiWage = Σ earned where countsForEsi`.
3. Adjustments: lines at `toPaise(|amount|)`, isAdjustment, displayOrder 500+i, code = label uppercased, spaces→`_`, ≤24 chars. Earning adjustments add to total earnings but **not** to earnedGross, pfWage, esiWage or the PT base.
4. **PF** (if enabled, not exempt, pfWage > 0): base = pfWage, capped at `wageCeiling` (or `prorate(ceiling, payable, working)` when prorateCeiling) if applyCeiling; `PF_EE = roundToRupee(base × employeeRate%)` (display 610, deduction "Provident Fund"); `PF_ER = roundToRupee(base × employerRate%)` (810, employer contribution "Employer PF"). No EPS/EPF split, EDLI or admin charges.
5. **ESI**: eligible if enabled, not exempt and **full** `monthlyGross ≤ grossEligibilityLimit` (LOP never pulls someone into ESI); then `ESI_EE = ceilToRupee(esiWage × 0.75%)` (620), `ESI_ER = ceilToRupee(esiWage × 3.25%)` (820). No 6-month contribution-period continuity.
6. **LWF** (if the employee's state schedule is enabled and the month ∈ remittanceMonths): flat `LWF_EE` (640) and `LWF_ER` (830). REF applies it to everyone with no exemption flag.
7. **PT**: unless exempt, `professionalTaxFor(slabs of employee.ptState, earnedGross rupees)`: sort slabs by upTo (null last), first slab with `gross ≤ upTo` (or null) → amount. MP default slabs: ≤18,750 → 0; ≤25,000 → 125; ≤33,333 → 167; above → 208 (₹/month). Add `monthOverrides` (MP collects 212 in one month to reach ₹2,500/yr; REF lacks this). No schedule for the state → 0 + warning (new).
8. TDS: manual only (enter as a deduction adjustment labelled "TDS" so it lands on the TDS report column).
9. Totals: `totalEarnings = earnedGross + adjustment earnings`; `totalDeductions = Σ deduction lines`; `totalEmployerContributions = Σ employer lines`; reimbursement line `REIMBURSEMENT` (700) if > 0; `rawNet = totalEarnings − totalDeductions + reimbursement`; < 0 → warning "Deductions exceed earnings for this month. Net pay has been floored at zero — carry the balance forward or reduce the recovery before locking payroll."; `netPay = max(rawNet, 0)` rounded to the rupee when `nearest_rupee`. Lines sorted by displayOrder.
Protected codes (cannot rename/retype/retire): `BASIC, PF_EE, PF_ER, ESI_EE, ESI_ER, PT, LWF_EE, LWF_ER, REIMBURSEMENT`.

**`/app/hr/payroll` — cycles** (REF `payroll/page.tsx`, `new-cycle-button.tsx`): permission `payroll.read`. Cards/rows per month (newest first): month, status badge + phase bar, employees, Gross, Deductions, Claims, Net, generated/locked dates. "Open a month" (payroll.run; month input). Empty: "No payroll months yet. Open the first month once attendance for it has been locked."

**`/app/hr/payroll/[id]` — the month** (REF `payroll/[cycleId]/*`):
- Header "Payroll · October 2026"; stepper (9 stages, stamps who/when); callouts: attendance still open ("Lock October 2026 attendance, then generate payroll" with link), attendance reopened after generation ("…is open again"), statutory blocked reason, mid-month statutory change ("Rates changed on 17 Sep 2026; payroll applies them from October 2026"), unverified bank changes since last month (new), skipped list.
- Controls (only the next step, by permission): Close claim collection; Generate/Regenerate (disabled until attendance locked; hidden with the company-wide refusal); Mark HR reviewed; Finance approve (confirm); Lock (confirm); Mark salaries released (dialog: payment date, transaction reference, notes); Publish and email payslips / Re-send; Reopen (unlock perm, reason).
- Tiles: Employees, Gross earnings, Deductions, Reimbursements, Net payable (+ employer cost).
- Warnings callout (first 8, "and N more") linking to entries.
- **Register** (entries table, searchable): employee (name, code), payable/working meter, LOP (red when > 0), Earned, Deductions, Net, status (ready / on hold / excluded), warning icon; expand row → earnings and deductions lines. Row actions (pre-lock, payroll.run): Hold / Release hold / Exclude (reason) (new), open breakdown.
- **Entry breakdown** (REF `entry/[entryId]/page.tsx`; drawer or `?entry=`): tiles Monthly gross, Payable days, Earned salary, Net pay; warnings; earnings/deductions/employer tables; snapshot facts; **Adjustments**: form (label e.g. "Diwali bonus", earning|deduction, amount >0 ≥₹0.01 ≤₹10,00,000, reason required) and the list of adjustments added since generation ("waiting for regeneration"); void with reason (new; REF can't remove one). Message "Diwali bonus (₹5,000.00 earning) added for Aditi Singh, October 2026. Regenerate payroll to apply it."
- Downloads (payroll.read): salary register CSV, statutory CSV, journal CSV, all payslips ZIP (audited).
- Empty: "Payroll has not been generated for this month" + what it needs next.

**`/app/hr/payroll/structures`** — components, per-employee structures, statutory (REF `people/[id]/salary-editor.tsx`, `people/salary-actions.ts`, `settings/lists/salary-components-panel.tsx`, `settings/statutory/*`)
Tabs: **Employee structures** | **Components** | **Statutory**. Permission `payroll.read` to view; writes `salary.write` (structures) and `hr.settings` (components, statutory).
- *Employee structures*: list of people (with `PAYROLL_STATUSES`) with current monthly gross, CTC, effective from, "no structure" flag; `?employee=` opens the editor:
  - Fields: effective from (default first of this month, or day after the current structure began if later; must be after the current one's start and a real date), monthly gross (>0, < ₹1 crore), annual CTC (>0, < ₹15 crore, default 12 × gross), notes; component lines (component, basis, value) defaulting to BASIC 50% of gross, HRA 40% of basic, SPECIAL fixed 0; live preview with the engine's `resolveStructure`, total, and a warning when ≠ gross ("adjust the Special Allowance by ₹x to close the gap").
  - Save (transaction, `revisionStartProblem` re-checked inside): close open structures with `effectiveTo = effectiveFrom − 1 day`, insert the new one with resolved `monthlyAmount` per line. Own record refused. "Salary structure saved for Aditi Singh, from 1 Oct 2026." Revision history list. Offer the Salary Revision letter after saving.
- *Components*: table (code, name, type, basis, default, PF/ESI/wages/LOP flags, taxable, recurring, order, active), add/edit (`salaryComponentSchema`: code 2–20 `^[A-Z][A-Z0-9_]*$`, name 2–60, default 0–100000, percent > 100 refused "A percentage cannot be above 100. Did you mean a fixed amount?"), retire/restore (protected refused), "Load the standard set" (§7). Locked components: only name and order editable.
- *Statutory*: timeline of versions (effective from, payroll from, note, PF, ESI, PT by state, LWF, confirmed by/at or "Proposal"); **Add version** (new; REF only had a script): copy the latest, edit PF (rates 0–25%, ceiling ₹0–1,00,000, apply/prorate ceiling), ESI (rates 0–10%, limit ₹0–1,00,000), PT per state (state code, enabled, slabs JSON/table with upTo ₹|null and amount ≤ ₹2,500, month overrides), LWF per state, TDS enabled; effective from + payroll from (1st of a month, not before the effective month, ≤12 months after; `payrollMonthProblem`) + note; **Set payroll month** and **Confirm** only while unconfirmed (confirmed versions are immutable: "Add a new version rather than moving this one."). Banner when the latest version still caps PF below the legal EPF ceiling (`outdatedPfCeiling`; "The EPF wage ceiling is now ₹25,000"; read-only, never edits stored rates), when any proposal awaits confirmation ("1 set of rates awaiting confirmation") and when a month has no confirmed rates ("Payroll is blocked"). `statutoryForMonth(versions, y, m)` = latest version with payrollFrom ≤ 1st of month; `versionFor(date)` by effectiveFrom for letters/reports; `pendingTransitions` = versions with effectiveFrom inside the month and not on the 1st.

**Payslip PDF** (REF `lib/pdf/payslip.tsx`; build on `lib/pdf/base.tsx`): A4. Letterhead (logo, org display name, legal name, address); title "SALARY SLIP · OCTOBER 2026"; "Payslip no. {prefix}/{YYYYMM}/{employeeCode}". Detail grid: Employee, Employee ID, Designation, Department, Date of joining, PAN, UAN, Bank account (masked · bank name), Working days, Payable days, Loss of pay days. Two tables: Earnings (lines, "Gross earnings" total = totalEarnings) and Deductions (lines, "Total deductions"); "None ₹0.00" when empty. Reimbursements (not taxable) row "Approved expense claims" when > 0. Net pay box: amount + amount in words. Employer contributions (not deducted from your pay) list. Footer: "This is a computer generated payslip and does not require a signature. Generated on {IST datetime}. Queries: contact HR before the next payroll run." Everything comes from the entry + snapshot. Email subject "Your October 2026 payslip is available", body with net pay and a link to `/app/me/payslips`, attachment `Payslip_{YYYYMM}_{code}.pdf`.

**Payroll journal** (`lib/payroll/journal.ts buildPayrollJournal`, pure): Dr Salary and Wages (Σ gross earnings), Dr Staff Reimbursements, Dr Employer PF Contribution / Employer ESI Contribution (Cr PF Payable / ESI Payable); Cr Net Salary Payable; deductions Cr PF Payable / ESI Payable / Professional Tax Payable / TDS Payable / Other Recoveries; rounding gap ≤ ₹1 × employees posted to "Rounding Off"; reports balanced or "DOES NOT BALANCE - do not post; regenerate payroll and re-export". Each account has a plain note.

### 4.3 Gratuity (`lib/payroll/gratuity.ts`, `lib/payroll/wage-base.ts`, `lib/data/gratuity.ts`)

- `statutoryWageBase(lines, thresholdPct=50)` = max(Σ amount of lines whose component `countsForWages`, round(Σ all × 50%)) (Code on Social Security add-back). Match components **by code**, not id.
- `serviceLength(joined, until)` → years, months, days since last anniversary, totalDays. Service counts from `originalJoiningDate ?? joinDate`.
- `gratuityFor({joined, until, monthlyWage, endedByDeathOrDisability}, rules)`: eligible by death/disability, or years ≥ 5, or years = 4 and days since anniversary ≥ 240. Not eligible → amount 0 and `qualifiesOn` = 5th anniversary. Counted years = years + 1 if months ≥ 6 (REF uses ≥; the Act says "more than six months" → use >) ; amount = round(monthlyWage / 26 × 15 × max(1, years)), capped at ₹20,00,000 (`isCapped`).
- Report rows: everyone in the directory with open structure; eligible count, accrued liability (Σ eligible amounts at today's salaries), "Qualifying within 12 months" (service ≥ 48 months and not eligible). Callout: values are commonly applied, not a reading of the Act; CA to confirm. Permission `payroll.read`.

### 4.4 Letters

**The 20 templates** (`lib/letters/catalogue.ts` + `lib/letters/default-bodies.ts`). Shared inputs: `hrComments` (HR comments, textarea → `{{comments.hr}}`), `managerComments` ("The reporting manager's assessment."), `performanceRemarks`, `workUndertaken` (required, "What they actually worked on. This is the part a future employer reads."), `recommendationComments` (required), `effectiveDate` (required date). `pay:true` inputs make the letter "state pay".

| # | code | name | category | suggested for | inputs | body outline |
|---|---|---|---|---|---|---|
| 1 | internship_offer (interns only) | Internship Offer Letter | internship | candidate, offered, joining_pending | effectiveDate, stipend (₹, pay), durationMonths (req), hrComments | Subject "Internship Offer — {designation}". Dear name; offer as designation in department; begins {effectiveDate}, runs {durationMonths} months, reports to manager; stipend Rs. {stipend}; learning engagement, not employment; HR comments |
| 2 | internship_completion (interns) | Internship Completion Letter | internship | internship_completed, intern | workUndertaken, performanceRemarks, hrComments | TO WHOMSOEVER; certifies completed internship as designation in department; ran join→exit, {duration}, supervised by manager; worked on {work}; performance; good wishes |
| 3 | internship_certificate (interns) | Internship Certificate | internship | internship_completed, intern | workUndertaken, hrComments | "CERTIFICATE OF INTERNSHIP / This is to certify that / {name} / has completed an internship … from … to … ({duration}). Work undertaken: … Issued on {issueDate}." |
| 4 | internship_experience (interns) | Internship Experience Letter | internship | internship_completed, intern | workUndertaken, performanceRemarks, managerComments, hrComments | TO WHOMSOEVER; interned as … from … to …; "Work undertaken during the internship:" …; "Performance:" …; "Reporting manager's assessment:" …; sincere and willing to learn |
| 5 | internship_recommendation (interns) | Internship Recommendation Letter | internship | internship_completed, intern | workUndertaken, recommendationComments, managerComments | I write in support of …; worked on …; recommendation; manager comments; recommend without reservation |
| 6 | recommendation | Letter of Recommendation (LOR) | internship | internship_completed, exited, active, confirmed | workUndertaken, recommendationComments, managerComments | pleased to recommend, worked as … from … to …; work; recommendation; manager comments |
| 7 | employee_offer | Employee Offer Letter | onboarding | candidate, offered | effectiveDate, hrComments | Subject "Offer of Employment — {designation}". Offer position in department; joining {effectiveDate}, reports to manager; **annual CTC Rs. {salary.ctcAnnual}** (states pay via salary placeholder); subject to verification; sign and return |
| 8 | appointment | Appointment Letter | onboarding | joining_pending, probation, intern | effectiveDate, hrComments | confirm appointment as … wef {effectiveDate}; reports to manager; governed by policies; annual CTC Rs. {salary.ctcAnnual}; welcome |
| 9 | confirmation | Confirmation Letter | employment | probation | effectiveDate, performanceRemarks, managerComments | after probation review, services confirmed wef …; continue as designation; performance; manager; congratulations |
| 10 | experience | Experience Letter | exit | exited, notice_period, resigned, internship_completed | workUndertaken, hrComments | TO WHOMSOEVER; employed as … in … from join to exit, {duration}; work; diligent and professional; good wishes |
| 11 | salary_revision | Salary Revision Letter | compensation | active, confirmed, probation | effectiveDate, revisedCtc (₹, req, pay), hrComments | compensation revised wef …; revised annual CTC Rs. {revisedCtc}; other terms unchanged |
| 12 | promotion | Promotion Letter | compensation | active, confirmed | effectiveDate, newDesignation (req), revisedCtc (₹, pay), managerComments | promoted to {newDesignation} wef …; revised CTC; manager comments; congratulations |
| 13 | warning | Warning Letter | disciplinary | active, confirmed, probation, intern | incident (req), expectation (req), hrComments | formal warning regarding {incident}; not in keeping with standards; "Going forward, the following is expected:" {expectation}; repetition may lead to termination; copy on record |
| 14 | show_cause | Show Cause Notice | disciplinary | active, confirmed, probation | incident (req), respondBy (date, req) | it has come to our attention {incident}; show cause in writing why action should not be taken; reply by {respondBy}; otherwise proceed on available information |
| 15 | termination | Termination Letter | exit | terminated, notice_period | effectiveDate, groundsForTermination (req), hrComments | employment terminated wef …; "Grounds:" …; return property, clearance; F&F per policy and law |
| 16 | resignation_acceptance | Resignation Acceptance Letter | exit | resigned, notice_period | resignationDate (req), lastWorkingDay (req), hrComments | acknowledge resignation dated …; accepted; last working day …; handover and exit formalities; thanks |
| 17 | relieving | Relieving / Exit Letter | exit | exited, notice_period, resigned | lastWorkingDay (req), hrComments | TO WHOMSOEVER; employed as … from join to {lastWorkingDay}; relieved of all duties wef close of business; handover done |
| 18 | full_and_final | Full and Final Settlement Letter | exit | exited, terminated, internship_completed | settlementAmount (₹, req, pay), settlementDate (req), settlementBreakdown | F&F processed; net Rs. {amount} settled on {date}; "Breakdown:" …; full and final discharge; retain |
| 19 | no_dues | No Dues / Clearance Letter | exit | exited, internship_completed, terminated | lastWorkingDay (req), hrComments | TO WHOMSOEVER; associated as … until …; no dues outstanding; property returned, advances settled; issued on request |
| 20 | custom | Custom Letter | custom | – | subject (req) | Subject {{input.subject}}; "Dear {name}," + HR comments; HR writes the body |

Category labels: internship "Internship", onboarding "Joining", employment "Employment", compensation "Compensation", disciplinary "Disciplinary", exit "Exit", custom "Other". `suggestedLetters(status, employmentType)`: intern-only letters only when type intern or status intern/internship_completed; include a letter if status ∈ suggestedFor; for interns also completion/certificate/experience. All letters remain pickable (`isLetterApplicable` hides intern-only ones for non-interns). Bodies name the person, never pronouns.

**Placeholders** (`lib/letters/variables.ts buildVariables`, `render.ts`): `employee.name, code, email, designation, department, manager, dateOfJoining, dateOfExit` (formatted, or the word "date" if none), `duration` (`describeDuration`: "1 year 2 months", "<1 month → N days", to exit or today), `employmentType` (Full-time…), `status`, `workLocation`; `company.name, legalName, address` (from Org); `letter.reference, letter.issueDate`; `signatory.name, signatory.designation`; `salary.monthlyGross, salary.ctcAnnual` (₹ with 2 decimals, from the latest structure — **only** added for readers with `payroll.read`, so a template that needs them stays unfilled and cannot be issued by others); `comments.hr|manager|recommendation|performance`, `work.undertaken`; every typed input as `input.<name>` (ISO dates formatted "20 Jul 2026").
`renderTemplate(body, vars)`: replace `{{ key }}`; unknown keys stay visible; empty values drop their paragraph and a preceding short heading ending in ":" (<60 chars). `placeholdersIn`, `missingPlaceholders`.

**Pay-stating letters** (`lib/letters/pay.ts`): `statesPay = any input.pay || template uses a salary.* placeholder`; recorded on the letter when written/rebuilt. Without `payroll.read`: cannot draft/open/download; listed with subject hidden. **Own-record letters** (`own-record.ts`): a letter about yourself that states pay or is category exit is refused unless you can decide own.

**Numbering**: REF `{prefix}/HR/{year}/{NNNN}` (prefix = payslip prefix, default VWX; year of issue date; 4-digit). Flowbit: same shape with `nextSeq(orgId, 'letter:'+year)` at draft creation; never reused (discarded drafts leave a gap).

**Lifecycle**: draft (editable) → issued (locked, PDF stored, audited) → revoked (new: reason required, PDF kept, watermark "REVOKED" on re-download, never deleted). Discard is allowed only for drafts (hard delete OK).

**`/app/hr/letters`** (new list): all letters visible to the reader: reference, employee, template, category, issue date, status, emailed (or error); filters status/category/employee/search; pay letters locked for non-payroll readers; tab **Templates** (`letters.templates`): the 20 types with "customised" badge; edit subject/body with the placeholder reference panel (salary group hidden without payroll.read); reset to shipped (delete override). Permission `letters.read`. Empty: "No letters yet. Draft the first from a person's profile or here."

**`/app/hr/letters/new`**: pick employee (visible) + template (suggested first, grouped by category) → creates the draft with rendered text and redirects to `[id]` ("Experience Letter drafted for Aditi Singh. Check the wording, then issue it."). Permission `letters.write`.

**`/app/hr/letters/[id]`** (REF `people/[id]/letters/[letterId]/*`, `letters/actions.ts`, `draft-fields.ts`): editor with the template's inputs, issue date, signatory name + designation (default the actor, "Authorised Signatory"), subject and body textarea, live preview; buttons Save draft (back to the person's Letters tab: "Draft saved: Experience Letter for Aditi Singh."), Rebuild from template (overwrites hand edits; stays: "…rebuilt from the template and saved. Read it through, then issue it."), Issue (refuses while any `{{…}}` remains: "This letter still has placeholders that were never filled in: {{input.lastWorkingDay}}. Fill the fields and rebuild, or edit the text directly."; renders the PDF, stores it, status issued, audit; "Experience Letter issued to Aditi Singh and filed on their profile. Email it or download the PDF below."), Email (issued only; to work email with PDF; records emailedAt or emailError; "Email is not configured, so nothing was sent. The letter is still saved and can be downloaded."), Download PDF, Discard draft (confirm), Revoke (issued; reason). Validation: issue date real; date inputs real; number inputs plain digits with ≤2 decimals, ≥0 (no "1e5").
Letter PDF: letterhead, "Ref: …" and "Date: …", recipient name, subject (bold), body paragraphs split on blank lines, signature block (name, designation, org), footer "{reference} · This is a computer generated letter issued by {org}."

### 4.5 `/app/hr/reports` (REF `reports/page.tsx`, `api/reports/[report]/route.ts`, `reports/gratuity/page.tsx`)

Permission `hr.reports`; salary reports need `payroll.read`; attendance export needs a reader who sees everyone. All CSV (`toCsv`, quote fields containing `",\n`), month picker and payroll-month picker.

| report | columns |
|---|---|
| Employee master (all, incl. exited) | Employee ID, Name, Work Email, Phone, Department, Designation, Manager, Employment Type, Status, Date of Joining, Work Location (+ Date of Exit) |
| Attendance summary (month) | Employee ID, Name, Department, Working Days, Present, WFH, On Duty, Half Days, Paid Leave, Unpaid Leave, Absent, LOP Days, Payable Days |
| Leave (new; as-of date) | Employee ID, Name, Department, Leave Type, Opening, Accrued, Taken, Remaining (+ a requests export: Employee, Type, From, To, Days, Paid, Unpaid, Status, Decided by, Decided on) |
| Salary register (payroll month) | Employee ID, Name, Monthly Gross, Working Days, Payable Days, LOP Days, Earned Gross, Total Earnings, PF, ESI, Professional Tax, TDS, Total Deductions, Reimbursements, Net Pay, Employer PF, Employer ESI |
| PF / ESI / PT statutory (payroll month) | Employee ID, Name, UAN, PAN, PF Wage, Employee PF, Employer PF, ESI Wage, Employee ESI, Employer ESI, Professional Tax, TDS (+ PT State, LWF) — UAN/PAN/wages from the snapshot |
| Payroll journal (payroll month) | Account, Debit, Credit, Narration + TOTAL row |
| Claims (all) | Employee ID, Name, Expense Date, Category, Vendor, Purpose, Client/Project, Claimed, Approved, Status, Review Note |
| Gratuity (page + CSV) | Employee ID, Name, Status, Service From, Served (y m), Monthly Wage Base, Eligible, Qualified By, Years Counted, Amount, Capped, Qualifies On |

### 4.6 Bank change notice and joining checklist (self-service side)

- Bank change (REF `me/actions.ts updateMyDetails`, `me/bank-change-notice.ts`): when self-service changes account number or IFSC (compare before/after), in one transaction create `BankChange {changedBySelf:true, previousMasked, newMasked, newIfsc}` and notify every active member whose role holds `people.read_sensitive` (resolved from role records, `rolesHolding`), excluding the actor unless they can decide own: title "{name} changed their bank account", body "Verify it before the next payroll run.", href `/app/hr/people/{id}` (Bank & statutory tab). Audit `employee.bank_changed_self` (redacted). **Also** record a BankChange (changedBySelf false) when HR edits bank fields (REF doesn't). The payroll month page lists unverified changes as a warning.
- Joining checklist on `/app/me`: only the person's own groups (Contact, Statutory, Documents) via `ownChecklist`, progress over that subset; My details marks the same steps missing (`missingOnDetailsPage`, `openOnDetailsPage`).

### 4.7 `/app/me/*` self-service (REF `app/(app)/me/*`)

Available to any member with `member.employeeId`; otherwise each page shows "Your account is not linked to an employee record. Ask HR to link it." All data from the session's employee id.

- **`/app/me`** (REF `/me` + `/me/details`): greeting; quick links (apply leave, claims, payslips); My leave (balances; interns/contract: "No monthly leave on this engagement"; pending count "Waiting on a decision"); This month (payable days with hint "includes 3 not marked yet, 5 upcoming", LOP with hint); joining checklist (own groups) with "What HR still needs from you"; My details card (code, work email, phone, joining date, manager, location) and the **details form**: personal email, phone, DOB (own-age rule), emergency contact (name, phone, relation), address (≤400), PAN, UAN, bank name, holder, account number (6–20 digits), IFSC. Name, designation, dates, status and salary are HR's and not editable. Bank account history (masked, verified badge). Message lists what changed (`me/details/saved-message.ts`): "Saved your phone and account number. Someone in HR or Finance will verify the new account before the next payroll run." / nothing changed: "Nothing had changed, so your details are as they were." / one bad field: "PAN: use the format ABCDE1234F", several: "Please correct the highlighted fields." Validation per REF `me/actions.ts` schema; a field not posted keeps its value.
- **`/app/me/attendance`**: month switcher; tiles Working days, Payable days, LOP days, Paid leave; day list (`ownMonthDays`): recorded / calendar / assumed with notes ("Not marked yet", "Upcoming, unpaid until it is marked"); request a correction (day, "It should say" from the 4 correctable statuses, "What actually happened"; hint with the window); my corrections (status, stage); my comp-off and overtime claims with a raise form.
- **`/app/me/leave`**: balances panel "What I have left"; apply form (§3.8, split shown); my requests (Type, Dates, Days, Reason, Status, Withdraw for pending). Empty "No leave requests yet. Everything you apply for appears here."
- **`/app/me/payslips`** (REF `/me/pay` + `/me/payslips`): tiles Latest month, Status, Net paid this year, Deducted this year; callout when the latest month is generated but not released ("October 2026 is still with Finance"); month-by-month table (Month, Days paid payable/working, Earned, Deductions, Claims, Net pay, Status, Download when published). Months appear as soon as payroll is generated (figures from the entry), downloads only when the payslip is published. Empty "No payroll has been run for you yet."
- **`/app/me/claims`** (REF `/me/reimbursements`): tiles Awaiting review, Approved, Paid (₹); table (Date, Category, Purpose, Claimed, Approved, Status, review note); list of claim forms open to me now with "File a claim" → `/c/{slug}`. Empty "No claims yet."
- **`/app/me/letters`** (new): my **issued** letters (reference, template, issue date, download); drafts never shown; pay letters are shown to their owner.
- **`/app/me/documents`** (new): my documents on file (type, uploaded date, download — own documents allowed without `people.read_sensitive`), the checklist's missing required documents, and company policy documents.

---

## 5. Domain-logic file index

Port as pure, tested modules. "Tenancy" = what changes for orgId/new models. Paths in REF `src/`.

| REF path | exports | agent → Flowbit path | port notes |
|---|---|---|---|
| `lib/employment-lifecycle.ts` | LIFECYCLE, EMPLOYMENT_STATUSES, STAGE_LABELS, statusesByStage, statusLabel, isInDirectory, isOnPayroll, DIRECTORY_STATUSES, PAYROLL_STATUSES, hasLeft | a → `modules/muster/lifecycle/statuses.ts` | as is; add `transitions.ts` (§1.2) |
| `lib/attendance/calendar.ts` | buildMonthCalendar, summariseAttendance, payableFractionFor, LEAVE_COST, types | a → `modules/muster/attendance/calendar.ts` | fix holiday-under-policy and joiner divisor (§1.4, §6) |
| `lib/attendance/leave.ts` | computeLeaveDays, leaveAttendanceStatus, leaveDatesToMark | a → `modules/muster/leave/days.ts` | as is |
| `lib/attendance/correction.ts` | CORRECTABLE_STATUSES, isCorrectable, withinCorrectionWindow | a → `modules/muster/attendance/correction.ts` | merge `time/correction-window.ts` (IST wall clock, hint/messages) |
| `lib/data/attendance.ts` | getMonthAttendance, listHolidays | a → `modules/muster/attendance/queries.ts` | ctx.db; join AttendanceMark + AttendanceDay precedence; holidays/weekly offs from MusterSettings; no deletedAt exclusion for exits |
| `lib/mongo/guards.ts` | MonthLocked, assertAttendanceMonthOpen, assertAttendanceDateOpen, assertPayrollUnlocked | a (attendance) / b (payroll) → `modules/muster/attendance/lock.ts`, `modules/muster/payroll/lock.ts` | take ctx/orgId |
| `app/(app)/attendance/lock-check.ts`, `period.ts`, `empty-sheet.ts`, `unsaved-edits.ts`, `said.ts` | lockRefusal, periodProblem, emptySheetCopy, editsLeftAfterSave/cellKey, message builders | a → `modules/muster/attendance/` | as is |
| `lib/import/csv.ts` | parseCsv, normaliseHeader, toCsv | a → `modules/muster/shared/csv.ts` (or papaparse + `normaliseHeader`) | SPEC lists papaparse; keep header normalising and line numbers |
| `lib/import/attendance-import.ts` + `attendance/import/real-days.ts` | ATTENDANCE_COLUMNS, resolveStatus, validateRows, templateCsv, summarise, refuseImpossibleDays | a → `modules/muster/attendance/import.ts` | context keyed by org |
| `lib/import/employee-import.ts` + `people/import/{columns,row-rules,result-messages}.ts` | IMPORT_COLUMNS, validateRows, templateCsv, summarise, withheldColumns, withoutColumns, withoutWarningsOn, checkDaysAndAmounts, messages | a → `modules/muster/people/import.ts` | employment types, work_email alias, default structure lines |
| `lib/validation/employee.ts`, `people/employee-dates.ts`, `people/archive-input.ts`, `people/duplicate-key.ts`, `me/details/{birth-date,address}.ts` | employeeSchema, PAN/IFSC/UAN patterns, SENSITIVE_EMPLOYEE_FIELDS, withoutSensitive, normaliseEmployeeInput, defaultRevisionStart, revisionStartProblem, employeeDateErrors, withoutUnseenBlank, readArchiveInput, duplicatedField, duplicateRefusal, birthDateProblem, ownBirthDateProblem, toStoredAddress, ADDRESS_MAX_LENGTH | a → `modules/muster/people/validation.ts` (revision helpers to b's structures) | Flowbit field names; index names now `orgId_1_workEmailLower_1` etc. |
| `lib/exit/own-exit.ts`, `lib/auth/self-action.ts`, `lib/ids.ts` | ownExitRefusal, mayDecideOwn, OWN_RECORD_REFUSAL, sameId, isOwnRecord | a → `modules/muster/shared/own-record.ts` | `mayDecideOwn` = ctx.can('roles.manage') or owner/admin |
| `lib/approvals/{routing,actor,waiting,claimable}.ts` (+ `applicant.ts`, `managers.ts` queries) | stagesFor, routeOf, currentStage, canActOn, canSignHrStage, applicantCanApprove, approvalActorFor, mayDecideAt, hasSayIn, NOT_YOURS_TO_DECIDE, waitingStage, decidableBy, claimableEmployeeIds, routeForApplicant, reportingManagersOf | a → `modules/muster/approvals/` | applicant accounts = Members with that employeeId and their role permissions |
| `lib/leave/split.ts` | splitAgainstBalance | a → `modules/muster/leave/split.ts` | as is |
| `lib/leave/accrual.ts` | accruesLeave, leaveYearFor, previousLeaveYear, accruedDays, completedServiceYears, entitlementFor | a → `modules/muster/leave/accrual.ts` | employment types (`contract`), settle probation rule |
| `lib/leave/carry-forward.ts` | carryForward, openingBalanceFor, priorLeaveYears, MAX_CARRY_FORWARD_YEARS | a → `modules/muster/leave/carry-forward.ts` | as is |
| `lib/data/leave-balances.ts` | getLeaveBalances, listTeamLeaveBalances | a → `modules/muster/leave/balances.ts` | ctx.db; on_application quota rule; comp-off bucket |
| `app/(app)/leave/{leave-range,said}.ts` | leaveRangeProblem, message builders | a → `modules/muster/leave/` | as is |
| `lib/time/overtime.ts` | compOffEarned, compOffExpiry, leaveForExtraHours, overtimeHours, hourlyRate, overtimeAmount | a → `modules/muster/attendance/overtime.ts` | as is |
| `app/(app)/time/{worked-day,claim-hours,correction-change,said}.ts` | workedDayProblem, extraHoursProblem, unchangedCorrectionProblem, messages | a → `modules/muster/attendance/` | as is |
| `lib/onboarding/{checklist,record}.ts`, `me/joining-checklist.ts` | onboardingSteps, openStepKeys, onboardingProgress, REQUIRED_DOCUMENTS, filledInDatabase, CHECKLIST_RECORD_PROJECTION, ownChecklist, missingOnDetailsPage, openOnDetailsPage | a → `modules/muster/people/checklist.ts` | field paths (`bank.accountNumber`, `bank.ifsc`); `hasLogin` = memberId set |
| `lib/employee-documents.ts`, `people/[id]/documents/document-file.ts`, `lib/employee-remarks.ts`, `lib/nominee-schemes.ts` | DOCUMENT_TYPES, documentFileProblem, REMARK_KINDS, remarkSchema, NOMINEE_SCHEMES | a → `modules/muster/people/` | as is |
| `me/bank-change-notice.ts` | VERIFIES_BANK_CHANGES, rolesHolding, bankChangeNotices | a → `modules/muster/people/bank-change.ts` | use Flowbit roles/permissions resolution |
| `settings/{payroll-rules,holiday-date,in-use,company-profile,not-saved,field-set}.ts`, `settings/lists/list-rules.ts`, `lib/reference-lists.ts`, `lib/reference-data.ts` | readPayrollRules, holidayDateProblem, referenceInUse/referenceRemoved/holidayAddRefused/holidayInUse, componentEdit/isLockedComponent, salaryComponentSchema/leaveTypeSchema/claimCategorySchema, PROTECTED_COMPONENT_CODES, percentageLooksWrong, SALARY_COMPONENTS/LEAVE_TYPES/CLAIM_CATEGORIES | a (holidays, leave types, rules) / b (components, categories) | seed per org |
| `lib/settings.ts` | getCompanySettings + zod schemas/defaults | a → `modules/muster/settings/settings.ts` | MusterSettings per org; company fields from Org |
| `lib/money.ts` | percentOf, roundToRupee, ceilToRupee, prorate, sumPaise, amountInWords, formatINRCompact, formatINRForPrint | a → `modules/muster/shared/money.ts` | only what `lib/money` lacks |
| `lib/payroll/engine.ts` | SYSTEM_CODES, resolveStructure, computePayroll, types | b → `modules/muster/payroll/engine.ts` | PT/LWF per state input; keep pure; port `engine.test.ts` cases |
| `lib/payroll/statutory.ts` | schemas, DEFAULT_STATUTORY_SETTINGS, professionalTaxFor, parseStatutorySettings | b → `modules/muster/payroll/statutory.ts` | per-state arrays, month overrides |
| `lib/payroll/statutory-timeline.ts` | landsMidMonth, statutoryForMonth, versionFor, pendingTransitions | b → same folder | as is |
| `lib/data/statutory-versions.ts` | listStatutoryVersions, statutoryForPayrollMonth | b → `modules/muster/payroll/statutory-queries.ts` | ctx.db; return blockedBecause as a refusal (REF throws) |
| `lib/payroll/coverage.ts`, `company-wide.ts`, `wage-base.ts` | statutoryCoverage, partialViewRefusal, statutoryWageBase | b → same folder | coverage from `employee.statutory` |
| `lib/payroll/generate.ts` | generatePayrollForCycle, GenerationReport | b → `modules/muster/payroll/generate.ts` | inclusion rule, holds, adjustments by cycleId, transaction with orgId |
| `lib/payroll/payslips.ts`, `lib/pdf/payslip.tsx` | generatePayslipsForCycle, PayslipDocument, renderPayslipPdf | b → `modules/muster/payroll/payslips.ts(x)` | `lib/pdf/base` letterhead, `saveFile`, `sendMail`, skip held entries |
| `lib/payroll/journal.ts` | buildPayrollJournal | b → same | as is |
| `lib/payroll/gratuity.ts`, `lib/data/gratuity.ts` | DEFAULT_GRATUITY_RULES, serviceLength, gratuityFor, listGratuity | b → `modules/muster/payroll/gratuity.ts` | rules from MusterSettings; months > 6 |
| `app/(app)/payroll/{stage-rules,payroll-inputs,generation-message,step-messages,latest-result}.ts` | ADVANCE_FROM, ADVANCE_PERMISSION, advanceRefusal, alreadyTaken, REOPENABLE, canReopen, readPayrollMonth, paymentDateProblem, adjustmentAmountProblem, generationMessage, skippedDetail, all step messages | b → `modules/muster/payroll/` | permission keys renamed |
| `lib/data/payroll.ts` | listPayrollCycles, getPayrollCycle, getCurrentCycle, listPayrollEntries, getPayrollEntry, STAGE_ORDER, isAtLeast, isLocked, getMyPay | b → `modules/muster/payroll/queries.ts` | ctx.db |
| `lib/data/salary.ts`, `people/salary-figures.ts` | listSalaryComponents, listSalaryStructures, getStructureEffectiveOn, toComponentDefinition, toEngineStructure, salaryFigureErrors, salaryFigureSummary, MAX_MONTHLY_GROSS, MAX_ANNUAL_CTC | b → `modules/muster/payroll/structures.ts` | ctx.db |
| `lib/exit/{notice,settlement,signoff}.ts` | fixedMonthlySalary, grossSalary, noticePosition, noticeRecovery, requiredNoticeFor, buildSettlement, SIGNOFF_ORDER, signoffRefusal, nextSignoff, isFullyCleared, hasSettlement | b → `modules/muster/letters/settlement.ts` (optional) | use to prefill the Full and Final letter: recovery = fixed monthly ÷ 30 × (shortfall − waived) calendar days; wage dues within 2 working days, other dues 30 days; disputed recoveries held |
| `lib/claim-session.ts` | CLAIM_SESSION_*, OTP_TTL_SECONDS=600, OTP_MAX_ATTEMPTS=5, generateOtp, hashOtp, verifyOtpHash, signClaimSession, readClaimSession | b → `modules/muster/claims/session.ts` | add orgId to payload, APP_SECRET |
| `reimbursements/{claim-inputs,claim-state,form-window,own-claim,schedule-selection,review-drafts,empty-copy,claim-messages}.ts`, `r/[slug]/claim-link-messages.ts`, `lib/data/reimbursements.ts claimFormState/isClaimFormOpen/approvedClaimsForCycle` | claimWindowProblem, claimCapProblem, expenseDateProblem, claimAmountProblem, approvedAmountProblem, MAX_CLAIM_RUPEES, UNDECIDED, decisionRefusal, companyDay, lastClaimDay, formWindowLabel, barredEmployeeId, cannotReviewOwn, scheduleSelection, withTick, review draft helpers, emptyClaimsCopy, messages | b → `modules/muster/claims/` | as is |
| `lib/letters/{catalogue,default-bodies,render,pay,own-record}.ts`, `lib/letters/variables.ts`, `people/[id]/letters/draft-fields.ts` | LETTERS, LETTERS_BY_CODE, CATEGORY_LABELS, suggestedLetters, isLetterApplicable, DEFAULT_BODIES, renderTemplate, placeholdersIn, missingPlaceholders, VARIABLE_REFERENCE, statesPay, letterStatesPay, placeholderReference, isOwnLetterRefused, buildVariables, describeDuration, draftFieldErrors | b → `modules/muster/letters/` | company from Org; signatory default from member |
| `lib/data/letters.ts` | getTemplate, listTemplates, payLetterCodes, listLettersFor, getLetter, nextReferenceNumber | b → `modules/muster/letters/queries.ts` | nextSeq for numbers |
| `lib/reports/csv.ts`, `lib/reports/zip.ts` | toCsv, csvResponse, zip builder | b → `modules/muster/reports/` | as is |
| `me/attendance/own-days.ts`, `me/details/saved-message.ts`, `me/details/cards.ts` | ownMonthDays, payableDaysHint, LOP hint, changedDetails, detailsSavedMessage, detailsRefusedMessage | b → `modules/muster/me/` | as is |

Tests worth porting with the code (Vitest, next to each file): `engine.test.ts`, `calendar.test.ts`, `leave.test.ts`, `accrual*.test.ts`, `carry-forward.test.ts`, `split.test.ts`, `overtime.test.ts`, `gratuity.test.ts`, `journal.test.ts`, `statutory-timeline.test.ts`, `wage-base.test.ts`, `routing.test.ts`, `actor.test.ts`, `employee-import.test.ts`, `attendance-import.test.ts`, `render.test.ts`, `pay.test.ts`, `stage-rules.test.ts`, `claim-inputs.test.ts`, `claim-state.test.ts`, `money.test.ts`, `checklist.test.ts`, `notice.test.ts`, `settlement.test.ts`.

---

## 6. Bugs and gaps in REF (fix, don't copy)

1. **Mid-month joiners and leavers are paid a full month.** `buildMonthCalendar` marks days outside employment as non-working and `summariseAttendance` skips them, so `workingDays` = in-employment days and `prorate(full, payable, working)` returns the full amount (REF's own test: joined 10 Aug → workingDays 19, payable 19). OPERATIONS.md claims leavers are prorated. Divide by the whole month's working days.
2. **Archived people vanish from their exit month's payroll.** Archive sets `deletedAt`, and the month sheet (hence generation) only reads `deletedAt:null` employees. Also generation ignores status, so a `candidate`/`inactive` with a past join date would be paid. Use the employment window + status rule (§4.2).
3. **Leave split is never applied to the calendar.** The request stores paid/unpaid days, but approval writes the paid mark on every date, so the unpaid part never becomes LOP.
4. **On-application leave and WFH split as unpaid.** Their balance row is 0, so maternity/paternity/WFH requests are stored as fully "loss of pay" (marks are still paid). Grant on-application types up to their quota; exclude WFH from balances.
5. **Unmarked holidays count as absent/unmarked** under `weekly_off_only` when the unmarked policy is `absent`/`pending` (holidays are working days there); they block the lock and cost pay.
6. **Statutory coverage cannot be set.** `isPfCovered`, `isEsiCovered`, `isProfessionalTaxExempt`, `primaryWorkState`, `isOvertimeEligible`, notice terms and Aadhaar/PF number have no form field; import sets coverage false; so PF/ESI are never deducted unless the DB is edited.
7. **Bulk-imported salary structures have no lines** → zero earnings and a mismatch warning every month.
8. **Statutory settings card is dead.** It writes `Settings.statutory`, but generation reads only `StatutoryVersion`, and there is no UI to add a version (only `scripts/migrate-statutory-timeline.ts`). PT/LWF support one state only; MP's ₹212 month is not modelled; LWF has no per-employee exemption.
9. **`statutory.blockedBecause` is thrown, not returned** (outside the try), so the refusal surfaces as an error rather than a field message.
10. **Payroll cycle never moves to `attendance_locked`** after creation; locking/reopening attendance doesn't update it. Reopening attendance doesn't check payroll lock.
11. **Regenerating after HR review/Finance approval** resets status to `generated` but keeps the old review/approval stamps.
12. **Claims scheduled after generation are marked paid at release** without being in anyone's net pay.
13. **Holds/exclusions don't exist** (entry status enum only). Adjustments can't be removed; adjustments for skipped people can't be added (the form lives on the entry page).
14. **Letter reference numbers can collide**: `count + 1` at draft time; discarding a draft lowers the count and the next draft reuses an existing number (unique index error). Comment claims a retry that doesn't exist. No template-editing UI (model + permission exist). No revoke. Employees cannot download their own letters (route needs `letters.read`); no "my letters"/"my documents" pages.
15. **Claim category ceilings are never enforced** (REFERENCE-DATA.md says they are). `under_review` and `draft` claim statuses are never set. No OTP request throttle. Decision emails interpolate the reviewer's note into HTML unescaped.
16. **Optional holidays** are excluded from leave counts but included as paid holidays in the payroll calendar and as "days off" for comp-off.
17. **Proof requirements and `allowHalfDay`** on leave types are not enforced server-side; leave policy, notice policy and overtime/working-hours settings have no UI; approved leave cannot be cancelled; no leave calendar; approvers aren't notified when a request is raised.
18. **Accrual comments disagree with code** (credited on the 1st vs "last day"; join after the 15th skips the month vs "half"; probation excluded vs "including probation"). Pick one rule and test it. Leave year default is January in code while policy text says April–March.
19. **Gratuity rounding** uses `months ≥ 6`; the Act says more than six months.
20. **Payslip "Generated on"** uses render time, not the snapshot time; a re-send changes it.
21. HR edits to bank details don't create a BankChange record (only self-service does).
22. Salary structure deduction lines (e.g. recurring TDS/loan) are ignored by the engine; only earnings are resolved. Approved overtime amounts never reach payroll.

---

## 7. Seed data (`modules/muster/seed.ts`, October 2026, Indian names)

- MusterSettings defaults (§2.1); weekly off Sunday; leave year April.
- Departments: Design (DES), Development (DEV), Marketing (MKT), Operations (OPS), HR (HR). Designations: Founder, HR Manager, Senior Designer, Designer, Full Stack Developer, Frontend Developer, Marketing Executive, Intern.
- Holidays 2026: Gandhi Jayanti 2 Oct, Dussehra 20 Oct (or per calendar), Diwali 8–9 Nov, Christmas 25 Dec, Republic Day 26 Jan 2027; one optional (Guru Nanak Jayanti).
- Leave types (REF `LEAVE_TYPES`): PL (paid, monthly 1/month, quota 12), SL (paid, monthly 1/month, quota 12, proof after 3 days), MATERNITY_26 (182, on application, proof), MATERNITY_12 (84), PATERNITY (5), COMP_OFF (on application, half day ok), LWP (unpaid), WFH (paid, on application).
- Salary components (REF `SALARY_COMPONENTS`): Earnings BASIC (50% of gross, PF, wages, ESI, prorate, order 10), HRA (40% of basic, ESI), CONVEYANCE, SPECIAL, OTHER_ALW (fixed, ESI), VARIABLE (fixed, not recurring, ESI, no prorate), INCENTIVE, BONUS, ARREARS (fixed, not recurring, no prorate); Deductions PF_EE, ESI_EE, PT (computed, system), TDS, ADVANCE, LOAN, OTHER_DED (fixed); Employer PF_ER, ESI_ER (computed, system).
- Claim categories: TRAVEL, FUEL, FOOD, CLIENT (Client Meeting), OFFICE (Office Purchase), SOFTWARE, COURIER, OTHER; no ceilings.
- One confirmed StatutoryVersion from 2000-01-01 with defaults (PF 12/12 ceiling 15,000; ESI 0.75/3.25 limit 21,000; PT MP slabs; LWF MP disabled) and one **proposal** effective 2026-09-17, payroll from 2026-10-01, PF ceiling 25,000, note "EPF wage ceiling revised to 25,000 — payroll month proposed, confirm with CA".
- ~18 employees across statuses (mostly active/confirmed/probation, 2 interns, 1 notice_period with resignationDate, 1 exited in September, 1 joining_pending), managers set, coverage flags on for those under the PF ceiling, structures (₹18,000–₹1,20,000 gross) with BASIC/HRA/SPECIAL lines summing exactly, bank/PAN on most (leave two missing to show readiness gaps).
- September 2026: attendance fully marked and locked; payroll cycle at `payslips_published` with entries. October 2026: attendance partly marked, open; a cycle at `attendance_open`; pending leave (one crossing the balance), one correction, one comp-off for 27 Sep (Sunday) worked; an open claim form "October expenses" (`/c/<org>-oct-2026`) with submitted/approved/scheduled claims; letters: an issued Experience Letter for the September leaver and a draft Confirmation Letter.
