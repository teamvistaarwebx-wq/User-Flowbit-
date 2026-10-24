# Flowbit Work: porting inventory (from the old Flowbit JS app)

Written by the work reader agent on 2026-10-01 from `~/Downloads/Vistaar (HRMS)/_ref/oss-main` (Next.js 16, JavaScript, Mongoose 8, NextAuth, React Query, S3, Slack, Liveblocks). Builders (work-a, work-b) should be able to build from this file without opening the reference. Where the reference and `docs/SPEC.md` disagree, **SPEC wins**; this file says so at each such point ("Port decision").

All reference paths below are relative to `_ref/oss-main/src/` unless written otherwise.

Contents
- Part 0. Ground rules for the port (mapping, statuses, dates, people, permissions)
- Part 1. Shared domain both agents read (task rules, visibility, search, activity, notifications)
- Part A. work-a: `/app` Home, `/app/work/tasks`, `/app/work/tasks/[id]`, `/app/work/spaces*`, `/app/work/projects*` + models
- Part B. work-b: `/app/arc`, teams, meetings, posts, time, whiteboards, reports + models
- Part C. Cross-cutting: attendance check-in and how Home shows it, roles and permissions, navigation, email preferences, what Work exposes to the Clients pages (reminders are in 1.5)
- Part D. Reference bugs and gaps (do NOT port these)

---

## Part 0. Ground rules for the port

### 0.1 What the old app is, in one paragraph
A ClickUp-style task manager for one agency (Vistaar). Hierarchy: Org → Space → Folder → FolderView ("Tasks" view per folder, plus doc/embed/whiteboard views) → Task → Subtask (checklist item). Tasks can also belong to a Project (which belongs to a Client) and to a Team. A user has "My Tasks" (assigned to me), "Personal Task" (private to-dos) and "All Tasks". Tasks have dynamic per-scope status sets, priority, impact, urgent flag, blocked flag with reason, start/due dates, multi-assignees, tags, attachments (S3), comments with @mentions/replies/reactions, an activity log, a timer and a manual timesheet. Side modules: teams with leads, projects with a health score, meetings created in Google Calendar, posts/announcements with read tracking and a popup, notifications (in-app + email queue + Slack DMs), HR (attendance check-in with breaks and GPS, leave, holidays, policies). Roles are permission bundles.

### 0.2 Mapping table (old → Flowbit)

| Old | Flowbit | Note |
|---|---|---|
| `session.user.orgId`, `Model.find({ orgId })` | `ctx.orgId`, `ctx.db(Model)` | never query without the org wrapper |
| `User` refs on product docs (`assigneeIds`, `createdById`, `userId`, `projectManager`, `members.userId`) | `Member` refs | SPEC 4: `assigneeIds [Member]`, `leadId`, `memberIds`. Show names via `Member → User.name` |
| `isClientUser` / "client portal" users and every `isClient(session)` branch | drop | Flowbit has no client logins. Remove all client-only paths (e.g. "clients may only assign to project managers") |
| Day-level `Date` fields (`dueDate`, `startDate`, `workDate`, attendance `date`) | `'YYYY-MM-DD'` strings in Asia/Kolkata | compare as strings; `todayIST()` from `lib/dates` |
| "Today" computed with server-local `setHours(0,0,0,0)` or UTC midnight | `todayIST()` | the reference mixes local and UTC midnight (Part D) |
| API route handlers + React Query | server components + server actions (`action()` from `lib/actions`) | return `{ ok, message }` / `{ ok:false, error, fieldErrors }` |
| `Notification.create` + `enqueueEmails` + Slack queue | `notify(ctx, { userIds, title, body, href, kind })`; optional `sendMail` | Slack is out of scope |
| S3 presigned uploads, `attachments[].s3Key` | `saveFile(ctx, { name, mime, data, kind, entity, entityId })` → `StoredFile`, `fileUrl(id)` | |
| `Counter` + `generateProjectCode` | `nextSeq(orgId, key)` | same idea, foundation owns it |
| `logActivity()` (task activity) | keep a Work-local `TaskActivity` collection (Part 1.6) + `audit()` only for important changes | audit log is not the task timeline |
| Google Calendar sync of tasks (`syncToCalendar`, `googleEventId`) | drop | not in SPEC; Google is sign-in only in Flowbit |
| Liveblocks whiteboard storage | Excalidraw scene saved in MongoDB | SPEC 6 |
| BlockNote rich text (posts `content`, docs) | plain text / markdown textarea | SPEC lists no rich-text editor; keep `message` string |
| Folder views of type `doc` / `embed` (`/docs/[viewId]`, embed tabs) | not ported | no route in SPEC catalog. Whiteboards become their own route |

### 0.3 Status model (Port decision)
Reference: statuses are dynamic. Each scope (`all_tasks` org board, `my_tasks` per-user board, `space`, `folder`) can own a **StatusSet** of up to N statuses, each `{ key, name, group, color, icon, order, isDefault }`, with groups `NOT_STARTED | ACTIVE | DONE | CLOSED`. A folder falls back to its space's set, everything else falls back to the seeded default. All "done/overdue/progress" logic keys off the **group** (`completedKeys = DONE + CLOSED keys`). Source: `lib/statuses/*`, `models/StatusSet.js`, `app/api/statuses/route.js`, `components/tasks/statuses/*`.

Seeded default set (`lib/statuses/defaultStatusSet.js`):

| key | name | group | color |
|---|---|---|---|
| TODO | To Do | NOT_STARTED (protected default) | #6B7280 |
| IN_PROGRESS | In Progress | ACTIVE | #3B82F6 |
| INTERNAL_REVIEW | Internal Review | ACTIVE | #8B5CF6 |
| CLIENT_REVIEW | Client Review | ACTIVE | #EAB308 |
| SCHEDULED | Scheduled | ACTIVE | #6366F1 |
| DONE | Done | DONE (protected) | #22C55E |

SPEC fixes `Task.status` to `'todo'|'in_progress'|'in_review'|'blocked'|'done'` because Home, Reports, Arc and Clients read it. **Use the fixed SPEC enum. Do not port StatusSets.** Mapping for seed data and for logic that used groups:

| SPEC status | old equivalents | group meaning | label | token |
|---|---|---|---|---|
| `todo` | TODO, SCHEDULED | not started, open | To do | `--text-3` |
| `in_progress` | IN_PROGRESS | active, open | In progress | `--info` |
| `in_review` | INTERNAL_REVIEW, CLIENT_REVIEW | active, open | In review | `--warning` |
| `blocked` | any status with `blocked: true` | open | Blocked | `--pink` |
| `done` | DONE (and CLOSED group) | completed | Done | `--success` |

- "Open" everywhere = `status !== 'done'`. "Completed" = `status === 'done'`. "Active/in progress" = `in_progress | in_review`.
- Board column order = the order above. Optional nicety (not required): `Space.statusLabels?: Record<status,string>` to rename columns per space; display only.
- If a builder ever needs custom status sets, the reference rules are: at least one NOT_STARTED and one DONE/CLOSED status ("You need at least one 'Not started' status" / "You need at least one 'Done' or 'Closed' status"), keys slugified from name + 6-char random suffix and stable across reorders, deleting a status that still has tasks returns 409 "Status "X" still has N task(s). Choose a status to move them to." and requires a remap that runs `updateMany({status:from} → {status:to})` over the scope's tasks. Not needed for v1.

### 0.4 Blocked (Port decision)
Reference: `blocked: Boolean` + `blockedReason: String` independent of status; zod refuses `blocked: true` without a non-empty reason ("Blocked reason is required when task is blocked"); the reason may contain @mentions which notify those people. Dashboard/board "Blocked" counts are `blocked && open`.
Flowbit: `status: 'blocked'` + `blockedReason` (required when moving to blocked, cleared when leaving blocked) + `blockedAt`, `blockedById`. Moving a card into the Blocked column on the board must open a small "Why is this blocked?" dialog before saving. Unblocking = choosing any other status.

### 0.5 Priority (Port decision)
Reference: `priority: 'HIGH'|'MEDIUM'|'LOW'|undefined` (optional, can be unset), plus `urgent: Boolean`, plus `impact: 'HIGH'|'MEDIUM'|'LOW'` (default MEDIUM) and `type: 'CLIENT'|'INTERNAL'` (default CLIENT). Only `priority` and `urgent` drive any logic (sorting, dashboard label). `impact`/`type` are only logged in activity.
Flowbit: `priority: 'low'|'medium'|'high'|'urgent'`, default `'medium'`. `urgent: true` in old data maps to `'urgent'`. Drop `impact` and `type`.
- Sort order (`priorityOrder`): urgent 0, high 1, medium 2, low 3, missing 4.
- Old dashboard label mapping: urgent → "Urgent", HIGH → "High", MEDIUM → "Normal", LOW/none → "Low". Flowbit label = capitalised value. Colours per SPEC 3: urgent/high `--danger`/`--orange`, medium `--warning`, low `--success`. Figma "Priority" cell = bar icon + coloured label.

### 0.6 People and assignment
- `assigneeIds` must have at least one member (reference: schema validator + zod "At least one assignee is required"; also refused on update with an empty array). Default on create = the creator.
- The reference keeps a legacy `assigneeId = assigneeIds[0]` mirror. Flowbit: only `assigneeIds`.
- "Assignable people" = active members (reference also excluded users whose Employee record is `inactive`: `lib/users/assignableUserFilter.js`). Flowbit: `Member.status === 'active'`.
- Mentions: the composer inserts `@NameWithoutSpaces`; the server parsed with regex `@(\w+)` and matched the first user whose space-stripped name *contains* the token (`lib/relatedUsers.js#parseMentions`). This is ambiguous (Part D). **Flowbit: the composer sends explicit `mentionIds: Member[]` chosen from the dropdown; the body keeps `@Name` for display.**

### 0.7 Permissions (old catalog → Flowbit intent)
Old permissions live in `lib/permissions/catalog.js`; roles are bundles (`lib/permissions/roleTemplates.js`); `can(session, key)` is an exact-match check with an owner short-circuit (`lib/authz.js`). The old rules are "creator/assignee baseline + elevated permission". Flowbit's catalog/roles are written by foundation (`lib/catalog.ts`, `lib/permissions.ts`); use whatever keys it exports. The intent to preserve:

| Old key | Meaning | Flowbit intent (suggested key) | Who gets it (SPEC roles) |
|---|---|---|---|
| task.view.own | see tasks I'm assigned to, created, or shared with | baseline for every Work user | member+ |
| task.view.team | also see tasks assigned to members of teams I lead | baseline for team leads (derived from TeamMember.role=lead, no permission needed) | — |
| task.view.any | see every non-personal task | `tasks.read_all` | owner, admin, manager |
| task.create | create tasks | `tasks.write` | member+ |
| task.update.any / task.delete.any | edit/delete tasks I'm not on | `tasks.manage` | owner, admin, manager |
| task.assign | reassign others' tasks without full edit | fold into `tasks.write` (any Work user may reassign tasks they can see) | member+ |
| task.share | manage sharing on others' personal tasks | drop (only the owner shares a personal task) | — |
| space.create / space.view.any / space.update.any / space.delete.any / space.share | spaces | `spaces.manage` for any-space power; creators always manage their own | manager+ |
| view.create / view.update.any / view.share / view.view.any | saved views | everyone can save personal views; `tasks.manage` can edit team-shared ones | — |
| project.view.assigned / project.view.any / project.create / project.update / project.delete / project.member.manage / project.team.manage | projects | `projects.read_all`, `projects.manage` (create/update/archive/members) | manager+ manage; members see projects they're on |
| team.view.own / team.view.any / team.create / team.update / team.member.manage | teams | `teams.manage`; everyone can view the team directory | manager+ |
| post.create / post.announcement.create / post.update.any / post.delete.any | posts | `posts.write` (discussion/idea/update), `posts.announce` (announcements, pinning), `posts.moderate` | member: write; manager/hr/admin: announce+moderate |
| comment.delete.any | delete others' comments | `tasks.manage` | manager+ |
| time_entry.edit.any / time_entry.delete.any / timesheet.edit.any / timesheet.delete.any / timesheet.approve | time | `time.approve` (approve/reject weeks of others; managers implicitly for direct reports via `Member.managerId`) | manager, admin, owner |
| attendance.checkin.self | check in | every member with an employee record (foundation/Muster) | all |

Old role templates for reference (not to copy literally): **member** = task.view.own, task.create, task.assign, view.create, space.create, space.view.own, leave.request, attendance.checkin.self, attendance.view.self, post.create, project.view.assigned, client.view.assigned, team.view.own. **team-lead** adds task.view.team, task.update.any, task.share, view.share, view.update.any, project.update, project.member.manage, leave.approve.member, attendance.view.any, team.member.manage. **chief-of-staff** ≈ Flowbit manager/admin for Work (task.view.any, space.*.any, project.*, team.*, post.*, timesheet.*, comment.delete.any). **admin** = all tenant permissions; **owner** = everything via short-circuit.

---

## Part 1. Shared domain (both agents read this)

### 1.1 Date and overdue rules (use everywhere)
- `today = todayIST()` ('YYYY-MM-DD').
- **Overdue**: `status !== 'done' && dueDate && dueDate < today`.
- **Due today**: `status !== 'done' && dueDate === today`.
- **This week**: reference used a rolling window `today ≤ dueDate ≤ today+7` and did *not* exclude done tasks (inconsistent). Flowbit: `status !== 'done' && today ≤ dueDate ≤ today+6` (7 days incl. today). Label "This week".
- **No due date**: `!dueDate && status !== 'done'`.
- **Active (dashboard)**: assigned to me, open, `dueDate >= today || !dueDate`.
- **Relative due label** (`components/dashboard/DashboardClient.jsx#getRelativeDue`): 0 → "Today", 1 → "Tomorrow", <0 → "{n}d overdue", >1 → "In {n}d". Absolute format per SPEC: "20 Jul 2026".
- Start ≤ due: the create modal refuses "Due date cannot be before start date. Please select a date on or after the start date." / "Start date cannot be after due date. Please select a date on or before the due date." Enforce on the server too.
- ISO week label (reference stored `weekLabel` like `2026-W40`, Monday-based; `lib/week.js#computeWeekLabel`): useful for timesheets (`weekStart` Monday 'YYYY-MM-DD' is simpler; store that instead).
- **completedAt**: the reference never recorded it (so no throughput history). Flowbit: set `completedAt = now` when status becomes `done`, clear it when leaving `done`. Also set `startedAt` (first time a task enters `in_progress`/`in_review`, never cleared) for Home sparklines and cycle time.

### 1.2 Task visibility (who sees which tasks)
Reference: `lib/api/taskVisibility.js#buildTaskVisibilityFilter`, `lib/api/taskScope.js#taskScopeByPermissions`, `lib/utils/taskAuthorization.js`, `lib/utils/taskAuthorization.server.js#canAccessTask`, `lib/utils/spaceAuthorization.js`.

Port this (simplified) rule as one pure function `taskVisibilityFilter(ctx, opts)` returning a Mongo filter fragment:
1. Personal tasks (`isPersonal: true`) are excluded from every list except the Personal page. On the Personal page show `isPersonal && (assigneeIds ∋ me || creatorId = me || sharedWith ∋ me)`.
2. `tasks.read_all` → all non-personal tasks in the org.
3. Otherwise the union of:
   - `assigneeIds ∋ me` OR `creatorId = me` OR `sharedWith ∋ me` OR `watcherIds ∋ me`
   - tasks whose `assigneeIds` intersect members of teams where I am `lead` (old `task.view.team` via `lib/utils/teamHelpers.js#getTeamMemberIdsForLead`: all members of all teams I lead, including me)
   - tasks in projects where I am lead or member (old `project.view.assigned`: `projectManager = me || members.userId = me || createdBy = me`)
   - tasks in spaces I have **full** access to (space creator, space member, or `spaces.manage`)
4. Space "scoped" access (reference): if I can't fully access a space but I'm assignee/creator of tasks in some of its folders, I can open that space but only see those folders and only my tasks. In Flowbit this falls out of rule 3 (I see my own tasks anywhere); the space page should show only folders containing tasks I can see.
5. Task detail access (`canAccessTask`): personal → creator, assignees, sharedWith, `tasks.read_all`; non-personal → stakeholder (creator/assignee) or `tasks.read_all` or full space access or project membership or team lead of an assignee. Refuse with a redirect to `/app/work/tasks` and toast "You don't have access to that task".

Edit rights (`taskAuthorization.js`): `canModifyTask` = creator or assignee or `tasks.manage`; `canDeleteTask` = same; `canAssignTask` = same (+ old `task.assign`); `canManageTaskSharing` = personal task only, creator/assignee. The PUT route split: changing only `assigneeIds` needs canAssign; changing anything else needs canModify.

### 1.3 Search (Tasks list search box and Arc)
Reference: `lib/taskSearch/searchUtils.js`, `lib/taskSearch/searchPipeline.js`, used by `app/api/tasks/route.js` and projects list.
- Escape the term with `escapeRegex` (`/[.*+?^${}()|[\]\\]/g → "\\$&"`). (The board API did NOT escape: Part D.)
- Term length ≤ 2 → "quick search": title only, case-insensitive substring.
- Longer → match any of title, description, tags, first-assignee name, project name, project code, client name, using "fuzzy" regex variants: the exact term; a vowel-flexible variant (middle vowels become `[v]*`, so "meting" matches "meeting"); single-optional-char variants for typos; and each word (>2 chars) of a multi-word query.
- Relevance score (added with `$regexMatch` on the exact term): title 10, tag 7, description 5, assignee name 5, project code 5, project name 3, client name 3. Sort by relevance desc, then the chosen sort.
- Projects list search: name only for ≤2 chars, else name or code.
- Posts search: escaped regex on title or message.

### 1.4 Sorting (Tasks list/board)
`sortBy` whitelist (reference `SORT_FIELD_MAP`): `status` (status order, Part 0.3), `title` (lowercased), `assignee` (first assignee name lowercased), `priority` (priorityOrder), `dueDate`, `startDate`, `createdAt` (default, desc), `updatedAt`. `sortOrder` ∈ asc|desc, default desc. Anything else falls back to createdAt desc. Labels (`components/tasks/TaskSortMenu.jsx`): Status, Task Name, Assignee, Priority, Due Date, Start Date, Date Created, Date Updated.

### 1.5 Notifications fan-out (events → recipients)
Reference producers: `app/api/tasks/route.js` (POST), `app/api/tasks/[taskId]/route.js` (PUT), `app/api/tasks/[taskId]/comments/route.js`, `app/api/posts/route.js`, `app/api/posts/[id]/replies/route.js`, `lib/services/taskDueDateService.js` (cron). Display config: `lib/notificationConfig.js`. In Flowbit every event below becomes one `notify()` call (never notify the actor) and optionally `sendMail` if the user's email preference is on.

| Event | Recipients (minus actor) | Flowbit kind | Title (copy style per SPEC 3) | href |
|---|---|---|---|---|
| Task created with assignees | assignees | assignment | "{actor} assigned you 'Homepage copy'" | `/app/work/tasks/{id}` |
| Assignees added on edit | newly added assignees only | assignment | same | same |
| Status changed | creator, assignees, watchers | info | "Task 'Homepage copy' moved to Done" | same |
| Blocked | creator, assignees, watchers, project lead, members mentioned in the reason (mentioned get kind mention) | warning | "'Homepage copy' is blocked: {reason}" | same |
| Unblocked | creator, assignees, watchers | info | "'Homepage copy' is unblocked" | same |
| Comment with mentions | mentioned members | mention | "{actor} mentioned you on 'Homepage copy'" body = first 100 chars | `/app/work/tasks/{id}#comment-{cid}` |
| Comment (no mention) | watchers (new; reference didn't) | info | "{actor} commented on 'Homepage copy'" | same |
| Due today (daily, once) | assignees | reminder | "'Homepage copy' is due today" | task |
| Overdue (first time, then every 3 days) | assignees | reminder | "'Homepage copy' is {n} days overdue" | task |
| Project lead set on create/change | new lead | assignment | "You lead the project 'Website revamp'" | `/app/work/projects/{id}` |
| Meeting scheduled/updated/cancelled | attendees | info | "{organizer} invited you to 'Sprint review', 3 Oct, 11:00" | `/app/work/meetings/{id}` |
| Announcement posted | all active members (or target roles) except author | info | "New announcement: {title}" | `/app/work/posts/{id}` |
| Mention in post or reply | mentioned (deduped against announcement recipients) | mention | "{actor} mentioned you in '{title}'" | post |
| Reply to my post | post author | info | "{actor} replied to '{title}'" | post |
| Timesheet week submitted | approver (manager / `time.approve`) | approval | "{member} submitted 29 Sep – 5 Oct (38h 20m)" | `/app/work/time/approvals` |
| Timesheet week approved/rejected | member | success / warning | "Your timesheet for 29 Sep – 5 Oct was approved" / "...was sent back: {reason}" | `/app/work/time?week=...` |

Reference notes to not repeat: every task creation also notified every `task.view.any` holder ("overseers") which is noise; drop. The status-change emails got higher queue priority when the new status was CLIENT_REVIEW; irrelevant now. Reminders: "due today" sent at most once per day per task (`notifications.dueTodaySentAt` date-compared in org timezone), overdue reminders sent on first detection then at most every 3 days (`lastOverdueReminderAt`), only for open tasks. SPEC has no scheduler, so generate reminders idempotently on the first Home load of the day (or a cron route if foundation provides one) using those same two timestamp fields on Task.

### 1.6 Task activity log
Reference: `models/Activity.js`, `lib/activity.js` (`logActivity` swallows all errors; `getActivityDescription`), `app/api/tasks/[taskId]/activity/route.js` (latest 100, newest first, populated user).

Event types to keep (Flowbit `TaskActivity.type`), each with the description template (actor name first):
- `created` "created this task"
- `status_changed` (old → new) `changed status from "In progress" to "Done"`
- `assignees_changed` (old ids → new ids) "assigned Aditi Singh" / "removed Rahul Verma" (compute added/removed names)
- `priority_changed` `changed priority from "Medium" to "High"`
- `start_date_changed`, `due_date_changed` "changed due date from 20 Jul 2026 to 25 Jul 2026" (or "None")
- `description_updated` "updated the description"
- `title_changed` (new; reference didn't log)
- `blocked` "marked this task as blocked: {reason}", `unblocked` "unblocked this task"
- `project_changed`, `space_changed` (moved) (new)
- `tags_changed` (new)
- `estimate_changed` (reference tried `TIME_ESTIMATE_CHANGED` but it wasn't in the enum, so it silently failed)
- `comment_added` "added a comment"
- `subtask_added`, `subtask_completed`, `subtask_reopened` (+ `checklist_*` if checklist is separate)
- `attachment_added` "added an attachment: brief.pdf", `attachment_deleted`
- `timer_started`, `timer_stopped` (duration), `time_logged` "logged 2h 30m", `time_edited` "edited a time entry from 1h to 1h 30m", `time_deleted`
- `watcher_added` (new)
Duration text rule (`lib/activity.js`): h>0 and m>0 → "2h 30m"; only h → "2h"; else "30m".
The task detail "Activity" panel interleaves activity rows and comments by time.

### 1.7 Formatting helpers worth porting
From `lib/time-utils.js`: `formatDuration(sec)` → "2h 5m 3s" (drops zero parts, "0s" for 0); `formatTimerDisplay(sec)` → "02:05:03"; `formatHoursDecimal(sec)` → "2.08h"; `parseDuration("1h 30m" | "90m" | "1.5")` → seconds (units h/m; a bare number = hours); `isValidDuration`. Put pure versions in `modules/work/time/format.ts` with Vitest tests.

---
## Part A. work-a

### A1. `/app` Home dashboard

**Purpose.** The landing page after sign-in: what is on my plate today, how my projects are doing, and my attendance. Every member sees it (core route). Data is scoped to the viewer.

**Reference** (different layout, reusable queries): `app/dashboard/page.jsx` (SSR loaders), `components/dashboard/DashboardClient.jsx`, `lib/queries/dashboardStats.js`, `lib/queries/myWorkTodayTasks.js`, `lib/queries/overdueTasks.js`, `lib/api/taskScope.js`, `lib/api/taskFilters.js`, `hooks/api/useDashboard.js`. The old dashboard had: greeting + date, a "Create task" button, four focus chips (Due today, Overdue, In progress, Blocked → each links to a filtered task list), "My work today" (due today + overdue), "Active tasks" (assigned to me, due today or later), "Overdue tasks", "Projects needing attention" (3 projects with the lowest health). The old dashboard did **not** show attendance; check-in lived in the top bar (`components/attendance/CheckInOutButton.jsx`).

Old query rules worth keeping:
- Stats scope (`taskScopeByPermissions`): `task.view.any` → all non-personal org tasks; otherwise own (assigned/created) ∪ team-led members' tasks. Personal tasks always excluded.
- My work today: scope ∩ open ∩ (due today or overdue); sort `isOverdue desc, urgent desc, priorityOrder asc, dueDate asc`; limit 8; also return total.
- Active tasks: assigned to me ∩ open ∩ (due ≥ today or no due); sort createdAt desc; limit 7.
- Overdue list: scope ∩ open ∩ due < today; sort dueDate asc; show 8 + total.
- Projects needing attention: 10 most recently updated non-archived projects → compute stats + health per project → sort health asc then updatedAt desc → take 3. Card shows name, completion %, health label (≥80 "On track", ≥60 "At risk", else "Critical"), description truncated to 15 words ("No description").
- Quick complete (round checkbox on a row) set status to done.

**Flowbit layout (SPEC 3, Figma)** with the data rule for each widget:

1. **Greeting**: "Good morning, {firstName}" (`greeting()` from `lib/dates`: <12 morning, <17 afternoon, else evening; firstName = first word of User.name, in `--blush`) + today's date "Wednesday, 1 Oct 2026".
2. **Workday timeline** (new; no reference): a horizontal bar from `org.officeHours.start` to `.end` (default 10:00–19:00) with an hour tick per hour, a "Half day" marker at `start + halfDayHours` (4.5 h → 14:30), gradient fill from start to "now" (clamped to the bar). Overlay from today's `AttendanceDay` (via foundation `lib/attendance#todayState`): a dot at first `in`, break gaps between `break_start`/`break_end`, an end cap at `out`. Not checked in → show the bar with fill only and the caption "Not checked in yet". Weekoff/holiday → caption "Day off".
3. **Arc card**: logo "arc.ai", chips "Outline Flowbit", "Breakdown task", "Progress update" (link to `/app/arc?action=outline|breakdown|progress`), pill input "search your workspace and web in seconds" that submits to `/app/arc?q=...`.
4. **Three stat cards** (In progress, Overdue, Completed). Scope: tasks assigned to me (personal included; they are mine). Members with `tasks.read_all` get a small "Me | Everyone" toggle (`?scope=all`), matching the old permission scope.
   - In progress = status ∈ {in_progress, in_review}. (Old counted only the literal `IN_PROGRESS` key: Part D.)
   - Overdue = rule 1.1.
   - Completed = status done with `completedAt` in the last 7 days (label "Completed · 7 days").
   - Sparkline (14 daily points, oldest → today) and ±% pill (value today vs value 7 days ago; `round((now − then) / max(then,1) × 100)`; green when good: up for Completed, down for Overdue/In progress is neutral-coloured):
     - Completed(d) = count with `completedAt` on day d.
     - Overdue(d) = count with `dueDate < d` and (`completedAt` null or `completedAt ≥ d`).
     - In progress(d) = count with `startedAt ≤ d` and (`completedAt` null or `completedAt > d`).
     These are approximations (no status history); good enough and deterministic. Colours: indigo, red (`--danger`), green (`--success`) with a glow.
5. **Project overview card**: project dropdown (projects I lead or am a member of, non-archived; `projects.read_all` sees all; default = most recently updated). Legend + concentric ring: Project done % = done/total, In progress % = (in_progress + in_review)/total, Blocked % = blocked/total (round each; todo is the remainder, not drawn). Centre = total task count. Details row: project status pill, member avatar stack (max 4 + "+n"), timeline "20 Jul – 30 Sep 2026" and the health pill (A5.3). Empty state when no projects: "No projects yet" + "Create project" (if allowed).
6. **Assign to me table**: tabs **All task** (assigned to me, open, sorted overdue first then dueDate asc then priority), **Done** (assigned to me, done, completedAt desc, last 30 days), **Due** (due today or overdue, open; the old "My work today" sort). Columns: Task name (click → detail; round checkbox = quick complete with confirm-free toast "Task 'X' moved to Done" + undo), Priority (bar icon + label), Due (relative label, red when overdue), Assignee (avatar stack). Show 8 rows + "View all" → `/app/work/tasks?mine=1&...`. Empty states per tab: "Nothing assigned to you" + "Create task"; "No tasks done in the last 30 days"; "Nothing due. Nice."
7. **My attendance card** (current month, viewer's `AttendanceDay`s): segmented bar On time % / Late % / Absent % where base = working days elapsed this month (dates ≤ today in `org.workWeek`, not holiday/leave/weekoff): On time = status `present` (and `on_duty`), Late = `late` + `half_day` (tooltip splits them; Figma has three segments only), Absent = `absent` or a past working day with no record (the reference computed absent on read, not stored: `lib/utils/attendanceUtils.js#calculateAttendanceForDate`). Month calendar with coloured day pills (present → success, late/half_day → warning, absent → danger, leave → info, holiday/weekoff → muted, future → blank) and a big selected date with month switcher; the reference blocked navigating to future months. Clicking a day shows check-in, check-out, total hours, breaks (reference popover `components/attendance/AttendanceCalendar.jsx`). Members without an employee record see "Attendance isn't set up for you" (hide the card if Muster is off).

**Actions on Home**: quick complete, create task (opens quick-add dialog), project switcher, Arc search, month switcher. **Permission**: any member; widgets respect visibility (1.2). **Empty org**: show the greeting, an onboarding card "Create your first project" / "Add a task", and hide charts with zero data.

---

### A2. `/app/work/tasks` (Tasks list / board / calendar)

**Purpose.** Find and work on tasks across the workspace. **Reference**: `app/tasks/page.jsx` (SSR prefetch + redirects), `components/tasks/TasksClient.jsx` (2.4k lines: header, view tabs, filters, list), `EnhancedKanbanBoard.jsx`, `EnhancedKanbanColumn.jsx`, `KanbanCard.jsx`, `CalendarView.jsx`, `CreateTaskModal.jsx`, `QuickFilterModal.jsx`, `FilterRow.jsx`, `FilterTypeSelector.jsx`, `FilterValueSelectors/*`, `AssigneeFilterSidebar.jsx`, `TaskSortMenu.jsx`, `BreadcrumbNavigation.jsx`, `ViewContextMenu.jsx`, `ViewShareModal.jsx`; APIs `app/api/tasks/route.js` (GET list, POST create), `app/api/tasks/board/route.js`, `lib/api/boardPipeline.js`, `lib/predefinedTaskViewFilters.js`, `lib/taskPages.js`, `lib/api/taskFilters.js`.

**URL state** (Flowbit; old names in brackets):
- `view=list|board|calendar` [old `view=kanban|list|calendar|overview` or a predefined slug]; default board.
- Filters: `mine=1` [old `myTasks=true&filter=assignToMe`], `created=1` [old `filter=assignByMe`], `personal=1` [old `filter=personalTask`], `assignee=<memberId,...>`, `project=<id,...>`, `space=<id>`, `folder=<id>`, `client=<id,...>`, `priority=<p,...>`, `status=<s,...>`, `due=today|overdue|week|none` [old `duePreset=today|overdue|this-week|no-date`], `tag=<t>`, `q=<search>`, `sort=<field>`, `order=asc|desc`, `page=<n>`, `saved=<savedViewId>` [old `pageId`].
- Predefined views (old `lib/taskPages.js#getPredefinedTaskPages`; slug = lowercased hyphenated name) become quick links in the sidebar/filter bar: All tasks (no filter), My tasks (`mine=1`), High priority (`priority=high,urgent`), Due today (`due=today`), Overdue (`due=overdue`), This week (`due=week`), Blocked (`status=blocked`).
- Unknown/forbidden `space`/`folder` → redirect to `/app/work/tasks?mine=1` (reference `validateSpaceNavigation`).

**Header**: breadcrumb (Tasks › Space › Folder when scoped), view switcher (List | Board | Calendar), search pill (expands; Esc collapses when empty; debounce 300 ms), Filter button with active-count badge (opens the quick filter panel: rows of {type, value} with types Status, Priority, Due date, Blocked, Assignee, Client, Project; add row / clear all / apply), "Me" toggle chip (filter to my tasks), Sort menu, Saved views menu, "+ Task" primary button. Active filters render as chips with ✕ each ("Clear all" when ≥1).

**List view**: 25 rows per page (`?page=`), columns: checkbox (bulk), Name (status icon in status colour + title + badges: Blocked, Personal, subtasks "2/5", project code), Assignee (avatars), Due (relative/red if overdue), Priority (bar + label), row menu (Copy link, Move to…, Delete). Row click → detail. Empty: `No tasks found` or `No tasks found for "{q}"` + "Create your first task".

**Board view (kanban by status)** (`boardPipeline.js` + `EnhancedKanbanBoard.jsx`):
- Columns = the five statuses in order (0.3). Initial load: one `$facet` aggregate (one branch per status, each sorted by the chosen sort and limited to 50, plus a `totals` branch grouping by status) after the shared `$match`. Infinite scroll per column: when a column's sentinel is visible and `hasMore`, request the next 50 for that status only, using the last card's sort value as a cursor (`$lt` for desc, `$gt` for asc). Totals always come from the separate group (not the paged results).
- Column header: status name + count, "+" (quick add with that status), menu (Rename column label: only if `statusLabels` is implemented).
- Card: title, priority flag, due pill (red if overdue), assignee avatars, project chip, subtasks "2/5" (click expands an inline checklist with toggles + quick add), personal-task shared avatars, hover menu (Copy link → "Link copied", Share (personal only), Delete with ConfirmDialog).
- Drag and drop (`@dnd-kit`, pointer activation distance 8 px, `closestCorners`): column-to-column moves change status (optimistic, revert on refusal with an `error` sound and toast "Couldn't move 'X'. {reason}"); dropping on a card means that card's column. Into Blocked → reason dialog first. Into Done → sets completedAt. The reference had **no within-column ordering**; SPEC Task has `order`, so optionally support reordering inside a column (store `order` as a float midpoint between neighbours) when sort = manual.
- With `status=blocked` filter, hide the Done column (reference rule).
- Empty column: "No tasks".

**Calendar view** (`CalendarView.jsx`): month grid Sun–Sat (Flowbit: Mon–Sun to match Indian weeks), prev / next / Today; a task spans from `startDate` (or createdAt) to `dueDate` inclusive as a bar; tasks without due date are not shown (list them in a "No due date" tray). Click an empty day → quick add with that due date. **Fix**: the reference fed the calendar only the currently loaded list page (25 tasks); query by the visible date range instead.

**Saved views** (reference `models/TaskPage.js`, `app/api/task-pages/*`, `lib/utils/viewAuthorization.js`). Port a smaller `SavedView` (A6): name, the URL query (filters + view + sort), owner, `shared: boolean` (visible to everyone who can see the tasks), optional `spaceId` (shown only inside that space). Rules carried over: owner edits/deletes; `tasks.manage` can edit shared ones; leaving a shared view isn't needed. Old extras not ported: protected flag, per-user share lists, embed views (url/sheets/docs/figma/html iframes), group-by.

**Bulk actions** (not in reference; SPEC requires): select rows → bar with Set status, Set priority, Assign to…, Set due date, Move to project, Delete. Each is one server action over `ids[]` that applies the same permission check per task (skip and report forbidden ones: "Updated 8 tasks; 2 skipped (no access)") and logs activity per task.

**Quick add** (SPEC): an inline row at the top of list/board columns: title + Enter creates a task with current context defaults (status of the column, space/folder/project from filters, assignee = me, due from calendar cell). Title ≥ 3 chars.

**Create task dialog** (reference `CreateTaskModal.jsx` + `taskCreateSchema` in `lib/validation.js` + POST `app/api/tasks/route.js`). Fields and rules:
- Title* (trim, ≥3 chars "Title must be at least 3 characters", ≤200).
- Description (textarea).
- Status (default todo, or the column/context status). The reference coerced an unknown status to the first status of the resolved set; Flowbit: zod enum.
- Priority (default medium).
- Assignees* (≥1; default me). Inactive members not selectable.
- Start date / Due date (due ≥ start).
- Project (optional), Space → Folder ("location"): if a space is picked, a folder (list) is required ("Tasks live inside a list. Pick a list in this space."). Space must be one I can fully access ("You don't have permission to create tasks in this space").
- Client (optional; defaults to the project's client when a project is chosen).
- Tags (free text chips, trimmed, unique, ≤50 chars each).
- Estimate (minutes; presets below).
- Blocked toggle → reason required.
- Attachments (uploaded after the task is created; partial failure message "Task created, but 1 attachment failed to upload").
- Personal: only when created from the Personal view (`personal=1`) and with no space/folder. Then `isPersonal = true` is decided **on the server from context, never from a client flag**, and the only allowed assignee is the creator ("Personal tasks are assigned to you only."). Sending `isPersonal: true` from elsewhere → refuse "Personal tasks can only be created from the Personal view."
- Old "you must join a team before creating tasks" gate: drop.
On success: toast "Task 'X' created", stay on the list (dialog) and highlight the new row; activity `created`; notify assignees (1.5); `key = {PREFIX}-{nextSeq(orgId,'task')}` (prefix = org initials, e.g. "VW", or "FB" if none; foundation's `nextSeq`).

**Personal tasks** (`lib/tasks/personalTaskContext.js`): private to-dos. Visible to creator, assignees, explicit `sharedWith` members (share dialog: search members, toggle; only creator/assignee manage it), and `tasks.read_all`. Never in All tasks, board totals, dashboards for others, reports, or project stats.

**Permissions**: page = any member with Work; list contents = 1.2; create = `tasks.write`.

---

### A3. `/app/work/tasks/[id]` (Task detail)

**Purpose.** Everything about one task. **Reference**: `app/tasks/[taskId]/page.jsx` (SSR with `canAccessTask`, redirects on no access), `components/tasks/TaskDetailClient.jsx`, `TaskHeader.jsx`, `TaskAttributes.jsx`, `fields/*` (StatusField, DateFields, TimeEstimateField, TagsInputField, AssigneeField, PriorityField, BlockedField, TrackTimeField), `TaskDescription.jsx`, `TaskSubtasksTab.jsx`, `TaskQuickSubtask.jsx`, `TaskAttachments.jsx`, `TaskTimesheet.jsx`, `EditTimesheetModal.jsx`, `TaskActivityTab.jsx` (comments + activity), `ShareTaskModal.jsx`, `TaskStatusActions.jsx`, `TaskDetailsTab.jsx`; APIs `app/api/tasks/[taskId]/route.js` (GET/PUT/DELETE), `.../comments`, `.../subtasks`, `app/api/subtasks/[subtaskId]`, `app/api/comments/[commentId]` (+`/reactions`), `.../attachments`, `.../activity`, `.../related-users`, `.../share`, `.../time-entries*`, `.../timesheet`.

**Layout**: back link; key + inline-editable title (click to edit; Enter saves, Esc reverts, blur saves when changed and non-empty; empty → revert); attribute grid; description; subtasks; checklist; attachments; time; right column (or tab) with Activity & comments; watchers; share (personal only); delete.

**Fields and editing rules** (each edit = one server action, optimistic UI, activity row, toast with sound):
- **Status** select (0.3). Suggested next-step buttons (reference `TaskStatusActions.jsx`): todo → "Start progress"; in_progress → "Send for review", "Mark done"; in_review → "Mark done"; blocked → "Unblock…".
- **Priority** select.
- **Assignees** multi-select with search; add/remove; refuse removing the last one ("A task needs at least one assignee"). Newly added people get notified.
- **Start / Due date** pickers with quick presets: Today, Tomorrow (+1), Next week (+7), 2 weeks (+14), 4 weeks (+28), 8 weeks (+56) and a "Clear" action (**fix**: the reference sent `null` and its zod schema refused it, so dates could not be cleared). Presets must be computed in IST (reference used `toISOString()` which shifts the date before 05:30 IST). The reference also listed "Later" and "Next weekend" with hard-coded hints ("8:46 pm", "29 Nov") that did nothing: drop.
- **Estimate**: presets 15 min, 30 min, 1 h, 2 h, 4 h, 8 h, 1 day, 2 days, 3 days, 1 week, 2 weeks, plus free input via `parseDuration`. Store `estimateMinutes`. Reference stored hours and used 1 day = 16 h, 1 week = 80 h (inconsistent); Flowbit: one constant `WORKDAY_MINUTES = 480` (8 h), so 1 day = 8 h and 1 week = 5 days = 40 h. Show "Logged 3h 20m of 8h" with an overrun colour.
- **Tags** chip input (Enter or comma adds; trims; dedupes; ✕ removes).
- **Project / Space / Folder** pickers ("Move to…"); moving into a space requires full space access.
- **Blocked**: via status (0.4); the reason input supports @mentions (dropdown of members, related people first).
- **Description**: textarea, saves on blur when changed (reference `TaskDescription.jsx`). Markdown rendering optional.
- **Watchers** (new; the reference had none, though one filter referenced a non-existent `followers` field): `watcherIds` auto-includes creator, assignees and anyone who comments or is mentioned; "Watch / Unwatch" button; watchers get status-change and comment notifications.
- **Share** (personal tasks only): member picker; shows up to 3 avatars + "+n".
- **Delete**: ConfirmDialog "Delete task 'X'? Subtasks, comments and time entries go with it." Allowed for creator/assignee/`tasks.manage`. **Fix**: cascade deletes subtasks (child tasks), comments, activity and the task's time entries (the reference left them orphaned), or refuse when time is approved (time entries in an approved week must not vanish: refuse with "This task has approved time. Remove it from the timesheet first.").

**Subtasks and checklist (Port decision).** The reference "Subtask" is a lightweight checklist item (`models/Subtask.js`: title, done, optional priority LOW/MEDIUM/HIGH, createdById; sorted createdAt asc; progress bar = done/total × 100; inline add "Add a subtask...", toggle, rename, set priority None/Low/Medium/High, delete with confirm). SPEC has both `parentId` (real subtasks) and a checklist. Implement:
- **Checklist** = embedded `checklist: [{ _id, title, done, doneAt?, doneById? }]` on Task (the old Subtask behaviour, minus priority). Activity `checklist_item_done`.
- **Subtasks** = child `Task` documents with `parentId` (inherit project/space/folder/client from the parent on create; own status/assignees/dates). Detail shows them as a mini list with status dot, assignee, due; "Add subtask" quick input. Parent cards show "done/total" from children (`$lookup` count like the reference board pipeline did for Subtask). One level only (a subtask can't have subtasks).
- Board/list default: hide subtasks (`parentId: null`) unless filtered by parent; show the count on the parent.
- Reference subtask routes had no permission checks and logged nothing even though activity types existed: apply canModify on the parent and log.

**Comments** (reference `models/Comment.js`, `app/api/tasks/[taskId]/comments/route.js`, `app/api/comments/[commentId]*`, `TaskActivityTab.jsx`):
- Top-level comments newest first; replies one level deep, oldest first under their parent (`parentId`). Reply to a reply attaches to the top-level parent.
- Composer: textarea, `@` opens a member dropdown (related people first: assignees, creator, project lead, project members, recent commenters; reference priorities 100/95/90/80/70; then all active members alphabetically, searched with debounce and paged); selecting inserts `@Name` and records the member id in `mentionIds`. Body required, trimmed, ≤5000 chars ("Comment cannot be empty").
- Edit own comment (sets `editedAt`, shows "edited"); **fix**: the reference edit route checked `session.user.userId` (undefined) so edits always failed. Delete own, or any with `tasks.manage` (old `comment.delete.any`); deleting a parent deletes its replies (reference orphaned them).
- Reactions: quick set 👍 ❤️ 😊 🎉 👏 🔥 ✅ 👀; toggle semantics: if this member already reacted with this emoji remove it, else add `{ emoji, memberId, at }`.
- On create: activity `comment_added`, notify mentioned members (kind mention) and watchers (kind info), add author + mentioned to watchers.
- Reference reads comments for any task in the org without checking task access: Flowbit checks `canAccessTask` for reading and writing.

**Attachments** (reference `TaskAttachments.jsx`, `app/api/tasks/[taskId]/attachments/route.js`, `lib/s3/constants.js`):
- Two kinds: **file** (upload) and **link** (URL must be a valid URL, title required: "Title is required").
- Allowed extensions: pdf doc docx xls xlsx ppt pptx txt csv jpg jpeg png gif webp svg zip rar. Max 50 MB per task file (reference limits: tasks 50 MB, projects 100 MB, clients 50 MB). Flowbit: `saveFile(ctx, { kind: 'task_attachment', entity: 'Task', entityId })`; store `{ fileId }` in the attachment row.
- Preview images and PDFs inline (modal), download others. Delete = canModify; removes the StoredFile. Activity `attachment_added/deleted` with the file name.

**Time on the task** (reads/writes work-b's TimeEntry; see B5): "Start timer / Stop" button with live hh:mm:ss (reference `TrackTimeField.jsx` + `RunningTimer.jsx`; starting a timer here auto-stops any other running timer of mine), "Log time" form (hours 0–23, minutes 0–59, total > 0 "Total time must be greater than 0", date default today, note ≤1000 "Describe what you worked on"), list of entries (who, date, duration, note, status pill), edit/delete own unless the week is submitted/approved. Header shows "Logged 3h 20m" (sum of entries) vs estimate. Work-a renders this block by importing work-b's actions/components if they exist; otherwise a local read-only summary and a link to `/app/work/time?task={id}` (list the need in the final report).

**Activity timeline**: 1.6 types with descriptions, interleaved with comments; filter chips All | Comments | Activity.

**Permission**: view = `canAccessTask`; edit = canModify; assign = canAssign; delete = canDelete. Not found / no access → redirect + toast. **Empty states**: no comments "No comments yet. Start the conversation."; no subtasks "Break this task into subtasks"; no attachments "Drop files here or add a link"; no time "No time logged yet".

---

### A4. `/app/work/spaces` and `/app/work/spaces/[id]`

**Purpose.** Organise tasks by area (e.g. Marketing, Development) with folders/lists inside. **Reference**: `models/Space.js`, `models/Folder.js`, `models/FolderView.js`; `app/api/spaces/route.js`, `app/api/spaces/[spaceId]/route.js`, `.../share/route.js`, `app/api/folders/route.js`, `app/api/folders/[id]/route.js`, `app/api/folder-views/*`, `app/api/tasks/overview/route.js`; `lib/utils/spaceAuthorization.js`, `lib/utils/folderViewAuthorization.js`, `lib/api/taskCounts.js`; UI `components/tasks/CreateSpaceModal.jsx`, `CreateFolderModal.jsx`, `RenameSpaceModal.jsx`, `RenameFolderModal.jsx`, `SpaceShareModal.jsx`, `SpaceItem.jsx`, `SpaceFolderOverview.jsx`, `components/layout/sidebar/*` (tree with expand toggles and row action menus), `components/layout/SidebarClient.jsx`.

**Hierarchy (Port decision)**: Space → Folder (= "list" in SPEC) → Tasks. The reference added FolderViews (one auto-created "Tasks" view per folder that can't be deleted, plus doc/embed/whiteboard views): drop FolderViews; a folder simply shows its tasks with the list/board/calendar switcher.

**Access tiers** (reference): **full** = space creator, a member in `sharedWith`, or `spaces.manage`; **scoped** = no full access but I'm assignee/creator of tasks in some folders (I see those folders and only my tasks in them); **none** otherwise. Folder structure changes (create/rename/delete folder) need full access. Clients never have access (drop).

**`/app/work/spaces` (list)**: grid of space cards (colour/icon tile, name, description, folder count, open/total task count, member avatars, "Shared with you" badge), sorted by `order` asc then createdAt desc; "Archived" tab (`?archived=1`); search `?q=`. Actions: New space (dialog), card menu: Rename, Edit colour/icon, Share/members, Archive, Delete. Empty: "No spaces yet. Spaces group lists of tasks by team or area." + "Create space". Task counts per space via one aggregate grouped by `spaceId` (reference `getTaskCountsByField`).

**Create/edit space**: Name* (trim, required "Space name is required", ≤80), Description (≤500), Colour (presets #3B82F6, #10B981, #F59E0B, #EF4444, #8B5CF6, #EC4899, #06B6D4, #F97316; map to tokens in the dark theme), Icon (lucide name, default "folder"). New space `order = max(order)+1`. Create needs `tasks.write` (old `space.create` was in the member role). Creator is a full member.

**`/app/work/spaces/[id]` (detail)**: header (icon, name, members avatars + "Share", menu). Left: folders/lists (colour dot, name, task count; "+ New list"; drag to reorder → `order`). Main: tabs **Overview** | **Tasks** (embeds the A2 list/board/calendar with `space=` / `folder=` preset; default Overview for full access, Tasks for scoped) | **Members**.
- **Overview** (reference `/api/tasks/overview`): "Recent" (10 most recently updated tasks in the space/folder: title, list name, updated time), "Lists" (folders with colour; for a folder: progress `doneTasks / totalTasks`), "Resources" (attachments across the space's tasks, newest first, max 30: file name/size or link title, which task), status breakdown chips (todo/in progress/in review/blocked/done counts). The reference "Bookmarks" was an empty placeholder and "Docs" are not ported.
- **Members**: list of `members` with "Remove"; add via member search; creator can't be removed. Removing yourself is always allowed (reference rule). Sharing a space = adding members.

**Folder (list) rules**: Name* ("List name is required", ≤80), description, colour (presets incl. #6B7280 grey default). New folder `order = max+1`. Delete: default = archive (`archivedAt`); "Delete permanently" (ConfirmDialog) moves its tasks out of the folder (unset `folderId`, keep `spaceId`) then deletes (reference `hardDelete=true`). Archived folders hidden unless `?archived=1`.

**Space delete rule** (reference): if the space has any tasks → archive instead and say so ("Space archived because it still has tasks"); otherwise hard delete. Restore from the Archived tab (PUT `isArchived:false` existed in the reference). Permission: creator or `spaces.manage` (old `space.update.any` / `space.delete.any`); share/members: creator or `spaces.manage`.

---

### A5. `/app/work/projects` and `/app/work/projects/[id]`

**Reference**: `models/Project.js`, `lib/projectHealth.js`, `lib/projectCode.js`, `app/api/projects/route.js` (GET with per-project stats via one aggregate, POST), `app/api/projects/[projectId]/route.js` (GET with stats+recent tasks, PUT, DELETE archive/hard), `.../stats/route.js`, `.../members/*`, `.../teams/*`, `lib/utils/resourceAuthorization.js`; UI `components/projects/ProjectsClient.jsx`, `ProjectCard.jsx`, `ProjectFilters.jsx`, `ProjectQuickFilterModal.jsx`, `ProjectSortMenu.jsx`, `CreateProjectModal.jsx`, `ProjectDetailClient.jsx`, `ProjectOverview.jsx`, `ProjectTasks.jsx`, `ProjectPeople.jsx`, `AddProjectPeopleModal.jsx`, `ProjectKeyPoints.jsx`, `ProjectCalendar.jsx`, `ProjectActivity.jsx` (mocked), `ProjectSettings.jsx`. Also `PROJECT_FEATURES_SUMMARY.md` at the repo root.

#### A5.1 Fields (old → SPEC)
| Old | Flowbit (SPEC 4 `Project`) | Rule |
|---|---|---|
| name (≤100, required) | name | "Project name is required" |
| code (≤20; unique per org; auto `PROJ-001` via counter seeded to current max) | code | auto when blank: `PROJ-{nextSeq(orgId,'project') padded to 3}`; user-entered codes uppercase `[A-Z0-9-]{2,20}`; duplicate → 'Project code "WEB" is already in use' (unique index `{orgId, code}`); on a race with an auto code, retry with the next number (reference retried 3×) |
| clientId | clientId | optional; shared `Client` |
| description (≤1000) | description | |
| status ACTIVE / INTERNAL / ARCHIVED | status planning / active / on_hold / completed / cancelled + `archivedAt` | map ACTIVE→active, INTERNAL→active with no client, ARCHIVED→`archivedAt` set |
| color (#RRGGBB, default #3B82F6), icon (default "briefcase"), logo | color (+ optional `icon`) | hex validation "Color must be a valid hex color" |
| startDate, targetEndDate, actualEndDate (never set) | startDate, endDate | 'YYYY-MM-DD'; end ≥ start |
| projectManager (User) | leadId (Member) | lead always counts as a member |
| members [{ userId, role PROJECT_MANAGER/DEVELOPER/DESIGNER/QA/STAKEHOLDER, addedAt, addedManually }] | memberIds [] (+ optional `memberRoles` map) | SPEC keeps a flat list; keep `teamIds` + a `manualMemberIds` set if you port team sync |
| teams [{ teamId, addedAt }] | teamIds (optional) | see A5.5 |
| tags | tags | ≤50 chars each |
| slackEnabled / slackChannelEmail | drop | |
| — | health, healthScore | computed (A5.3) and persisted |
| — | milestones (separate model) | new (A5.6) |

#### A5.2 Visibility and permissions
- List: `projects.read_all` → all; otherwise projects where I'm lead or member or creator (reference `getAssignedProjectsFilter`). Detail: same check (`canAccessProject`); stats must use the same check (the reference stats route didn't: Part D).
- Create/update/archive/members/teams: `projects.manage` (old project.create/update/delete/member.manage/team.manage). Lead can update their own project's details and members even without the permission (sensible extension; reference had no lead override).
- Hard delete: owner/admin only (old `project.delete`).

#### A5.3 Stats, progress and health (formulas to reuse)
Inputs per project: all its **non-personal top-level and sub tasks** (decide: count top-level only, `parentId: null`, so subtasks don't inflate; reference had no subtask tasks).
- `totalTasks`, `completedTasks` (done), `inProgressTasks` (in_progress + in_review), `blockedTasks` (blocked), `overdueTasks` (rule 1.1, open and dueDate < today; the reference list used `< now` and the detail used start of today: unify on today IST).
- `completionPercentage = total > 0 ? round(completed / total × 100) : 0` (this is "progress"; ring on Home and Overview).
- **Reference health score** (`lib/projectHealth.js#calculateHealthScore`):
  - total = 0 → 75 (neutral).
  - completion = completed/total × 40
  - onTime = max(0, (total − overdue − completed)/total) × 30  ← **bug**: completed tasks are excluded from "on time", so a 100 %-done project scores 40+0+20+10 = 70 (At risk). The reference's own doc example (20 tasks, 15 done, 3 overdue, 1 blocked) scores 62 "At risk" though 75 % done.
  - nonBlocked = (total − blocked)/total × 20
  - workload = 10 (constant placeholder)
  - score = clamp(round(sum), 0, 100). Levels: ≥80 HEALTHY (#10B981 "Healthy"/"On track"), 60–79 AT_RISK (#F59E0B "At risk"), <60 CRITICAL (#EF4444 "Critical").
- **Flowbit formula (corrected; put in `modules/work/projects/health.ts` with tests)**:
  - total = 0 → score 75, health `on_track`.
  - completion = completed/total × 40
  - onTime = (total − overdue)/total × 30 (completed and not-yet-due tasks both count as on time)
  - nonBlocked = (total − blocked)/total × 20
  - schedule = 10 × (1 if no endDate or completion% ≥ timeElapsed% − 10, else max(0, 1 − (timeElapsed% − 10 − completion%)/50)) where timeElapsed% = clamp((today − startDate)/(endDate − startDate) × 100, 0, 100). This replaces the constant "workload 10" with something meaningful; if you want strict parity, use the constant 10.
  - score = clamp(round(sum), 0, 100); `health = score ≥ 80 ? 'on_track' : score ≥ 60 ? 'at_risk' : 'off_track'`.
  - Recompute and persist `healthScore`/`health` on the project after any task create/update/delete in that project and after project date changes (cheap aggregate on `{orgId, projectId}`). Lists may also compute on read with one `$group` by `projectId` (reference approach: `app/api/projects/route.js` GET).
- **Timeline progress** (reference stats route): if start and end: `timeProgress = clamp((now − start)/(end − start) × 100, 0, 100)` rounded, `daysRemaining = ceil((end − now)/1 day)`, `isOverdue = now > end`. Show "12 days left" / "5 days over".
- **Breakdowns** (stats route): by status, by priority, team workload per assignee `{ name, totalTasks, completedTasks, inProgressTasks }` (**fix**: reference counted only the first assignee; count every assignee).

#### A5.4 `/app/work/projects` (list)
- Views: Cards (default) | Table (`?view=table`). Search `?q=` (name ≤2 chars, else name/code). Filters: Status, Client, Health (**fix**: the reference UI had a health filter that was never sent to the API), Archived (`?archived=1`), "My projects" toggle. Sort: Name, Date created, Date updated, Health, Progress (reference schema allowed healthScore/progress but never implemented them; with persisted fields they are plain sorts). Pagination `?page=` (12 cards / 25 rows).
- Card: colour/icon tile, name, code, client, status pill, health pill, progress bar with %, counts Total / Done / Overdue, member avatar stack, end date. Menu (`projects.manage`): Edit, Archive (ConfirmDialog "Archive 'X'? It disappears from the list; you can restore it from Archived."), Delete (owner/admin).
- Table columns: Code, Name, Client, Lead, Status, Health, Progress, Due, Members.
- Empty: "No projects yet" + "Create your first project" (if allowed); filtered empty: "No projects match these filters" + "Clear filters".

#### A5.5 Create / edit project
Dialog or `/app/work/projects?new=1`: Name*, Code (auto if blank), Client (select + "New client" link to `/app/clients/new` if Orbit/clients route exists), Description, Status (default active; planning allowed), Colour (8 presets), Start / End date, Lead (member), Teams (multi; optional), Members (multi; optional), Tags. Validate with zod; on success go to the detail page; notify the lead (1.5); audit `project.created`.
**Team sync rules** (reference POST + `/teams` routes), port if you keep `teamIds`:
- On create with teams: add every member of those teams (role DEVELOPER, `addedManually: false`); explicitly chosen members override (`addedManually: true`).
- Adding a team later: add its members who aren't already on the project.
- Removing a team: remove members who came from that team only, keeping the lead, manually added members, and anyone also in another linked team. If no teams remain, keep only lead + manual members (among that team's people).
- Removing a member: just remove (the lead can't be removed: change lead first).

#### A5.6 `/app/work/projects/[id]` (detail tabs per SPEC)
Header: back, icon/colour, name, code, client link, status pill, health pill, lead avatar, "Edit" (Settings tab), menu (Archive/Restore, Delete).
- **Overview**: progress ring (completion %), health card (score bar + level + the three drivers in words: "3 overdue tasks", "1 blocked", "40 % of time used, 55 % done"), stat cards Total / Completed / In progress / Overdue, "Task progress breakdown" bars (completed/total, overdue/total, blocked/total; reference `ProjectOverview.jsx`), timeline (start → end with today marker and days left), milestones summary (next 3 with due dates), members (avatars + role text), description, client "Key points" (reference showed `Client.overviewItems` bullets: "No Client Connected" / "No Key Points Available"; show only if the Client model has such a field, else skip).
- **Tasks**: the A2 board (and list toggle) pre-filtered `project=<id>`; "+ Task" pre-fills project and client. Reference tab was a simple table with status/priority filters and search.
- **Milestones** (new; no reference): list ordered by due date: title*, due date*, description, status open/done (checkbox), linked tasks count (tasks can carry `milestoneId`), progress = done linked tasks / linked tasks. Actions add/edit/complete/delete (ConfirmDialog; deleting unlinks tasks). Empty: "No milestones yet. Milestones mark the big moments in a project." Overdue milestone = open and due < today.
- **Files** (new): uploads to the project (`saveFile` entity 'Project', limit 100 MB per reference) + read-only roll-up of task attachments in this project (like the space Resources list). Delete own uploads or with `projects.manage`.
- **Activity** (the reference was **mocked**: generated "Project created", "X was assigned as project manager", "Team Y was assigned", "Z joined as DEVELOPER" from fields): build a real feed = `ProjectActivity` rows written on project created/updated (field names), status changed, lead changed, member added/removed, team linked/unlinked, milestone added/completed, file uploaded, plus task events in this project (task created, task completed) read from TaskActivity by `projectId`. Newest first, paginated.
- **Settings**: edit form (A5.5 fields), "Danger zone": Archive (refused while open tasks exist: "Can't archive: 4 tasks are still open. Close or move them first."; reference message "Cannot archive project with active tasks"), Restore (sets `archivedAt` null; missing in reference though its copy promised it), Delete permanently (owner/admin; refused when any task exists: "Can't delete a project that has tasks. Delete or move its tasks first.").
Old extra tabs: People (teams + members grouped by team with lead badges, job titles from Employee records, add/remove) → fold into Overview "Members" + Settings; Calendar (project timeline + task due dates on a month grid) → the Tasks tab calendar view covers it.

---

### A6. work-a data models (Mongoose; all apply `tenant` plugin → `orgId`, timestamps)

```ts
// models/work/Task.ts  (SPEC cross-product fields first)
Task {
  key: string                       // 'VW-42', unique {orgId,key}, from nextSeq(orgId,'task')
  title: string                     // 3..200
  description?: string              // ≤ 10000
  status: 'todo'|'in_progress'|'in_review'|'blocked'|'done'   // default 'todo'
  priority: 'low'|'medium'|'high'|'urgent'                    // default 'medium'
  assigneeIds: ObjectId<Member>[]   // min 1
  creatorId: ObjectId<Member>
  projectId?: ObjectId<Project>
  spaceId?: ObjectId<Space>
  folderId?: ObjectId<Folder>       // requires spaceId
  parentId?: ObjectId<Task>         // subtask (one level)
  milestoneId?: ObjectId<Milestone>
  clientId?: ObjectId<Client>
  dueDate?: string                  // 'YYYY-MM-DD'
  startDate?: string                // 'YYYY-MM-DD'
  completedAt?: Date                // set on → done, cleared on leave
  startedAt?: Date                  // first time in_progress/in_review
  isPersonal: boolean               // default false; decided server-side
  sharedWith: ObjectId<Member>[]    // personal tasks only
  watcherIds: ObjectId<Member>[]
  tags: string[]
  estimateMinutes?: number          // int ≥ 0
  loggedMinutes: number             // denormalised sum of TimeEntry (work-b keeps it in sync); default 0
  order: number                     // float, manual ordering in a column
  blockedReason?: string            // required when status='blocked'
  blockedAt?: Date
  blockedById?: ObjectId<Member>
  checklist: { _id, title: string, done: boolean, doneAt?: Date, doneById?: ObjectId<Member> }[]
  attachments: { _id, kind: 'file'|'link', fileId?: ObjectId<StoredFile>, url?: string, title: string,
                 size?: number, mime?: string, uploadedById: ObjectId<Member>, uploadedAt: Date }[]
  reminders: { dueTodaySentOn?: string, overdueFirstSentAt?: Date, overdueLastSentAt?: Date }
}
// indexes: {orgId,key} unique; {orgId,assigneeIds}; {orgId,status}; {orgId,projectId}; {orgId,spaceId,folderId};
// {orgId,parentId}; {orgId,dueDate}; {orgId,isPersonal,status}; {orgId,completedAt}; text {title, description}

// models/work/TaskComment.ts
TaskComment { taskId, authorId: Member, body (1..5000), parentId?: TaskComment (top-level only),
  mentionIds: Member[], reactions: { emoji, memberId, at }[], editedAt?: Date }
// indexes {orgId,taskId,createdAt:-1}; {parentId,createdAt}

// models/work/TaskActivity.ts
TaskActivity { taskId, projectId? (denormalised for project feed), actorId: Member,
  type: (Part 1.6 list), from?: Mixed, to?: Mixed, meta?: { commentId?, fileName?, minutes?, ... } }
// index {orgId,taskId,createdAt:-1}; {orgId,projectId,createdAt:-1}

// models/work/SavedView.ts
SavedView { name (1..60), ownerId: Member, query: string /* URL search string */, view: 'list'|'board'|'calendar',
  shared: boolean, spaceId?: Space, order: number }

// models/work/Space.ts
Space { name (1..80), description?, color (hex, default '#3B82F6'), icon (default 'folder'), order: number,
  createdById: Member, members: { memberId, addedById, addedAt }[], archivedAt?: Date, statusLabels?: Map<string,string> }
// indexes {orgId,archivedAt,order}; {orgId,'members.memberId'}

// models/work/Folder.ts
Folder { spaceId, name (1..80), description?, color (default '#6B7280'), order, createdById, archivedAt? }
// index {orgId,spaceId,order}

// models/work/Project.ts  (SPEC fields first)
Project { code (unique per org), name (1..100), description? (≤1000), clientId?, status: 'planning'|'active'|'on_hold'|'completed'|'cancelled',
  health: 'on_track'|'at_risk'|'off_track', healthScore: number, leadId: Member, memberIds: Member[],
  startDate?: string, endDate?: string, color: string, icon?: string, tags: string[],
  teamIds?: Team[], manualMemberIds?: Member[], archivedAt?: Date, createdById: Member }
// indexes {orgId,code} unique; {orgId,status}; {orgId,clientId}; {orgId,memberIds}; {orgId,leadId}; {orgId,archivedAt}

// models/work/Milestone.ts (new)
Milestone { projectId, title (1..120), description?, dueDate: string, status: 'open'|'done', doneAt?: Date, order: number }

// models/work/ProjectActivity.ts (new)
ProjectActivity { projectId, actorId: Member, type: 'created'|'updated'|'status_changed'|'lead_changed'|'member_added'|'member_removed'|
  'team_linked'|'team_unlinked'|'milestone_added'|'milestone_done'|'file_added'|'archived'|'restored', meta?: Mixed }
```

### A7. work-a source files to port (logic, not UI code)
- `lib/projectHealth.js` → `modules/work/projects/health.ts` (fix onTime; tests).
- `lib/projectCode.js` → use `nextSeq`; keep the "skip codes already taken" loop.
- `lib/api/taskVisibility.js`, `lib/api/taskScope.js`, `lib/utils/taskAuthorization.js`, `lib/utils/taskAuthorization.server.js`, `lib/utils/spaceAuthorization.js`, `lib/utils/teamHelpers.js` → `modules/work/tasks/access.ts` (one pure filter builder + `canModify/canDelete/canAssign/canAccess`).
- `lib/predefinedTaskViewFilters.js`, `lib/taskPages.js`, `lib/api/taskFilters.js` → `modules/work/tasks/filters.ts` (URL params → Mongo filter, pure; tests for due presets with a fixed "today").
- `lib/api/boardPipeline.js` → `modules/work/tasks/board.ts` ($facet per status + totals + cursor).
- `lib/taskSearch/searchUtils.js`, `searchPipeline.js` → `modules/work/search.ts` (shared with Arc).
- `lib/activity.js#getActivityDescription` → `modules/work/tasks/activity.ts`.
- `lib/relatedUsers.js#getRelatedUsers` (priority ordering only; replace `parseMentions` with explicit ids).
- `lib/api/taskCounts.js` (group counts by spaceId/folderId/projectId).
- `lib/week.js` (only if you keep ISO week labels).
- `app/api/tasks/overview/route.js` (space overview data shape).
- `app/api/projects/route.js` GET aggregate (per-project stats in one `$group`).
- `app/api/projects/[projectId]/teams/[teamId]/route.js` (team removal pruning logic).
- `components/dashboard/DashboardClient.jsx` helpers `getRelativeDue`, `getGreeting`, `mapPriority`.

---
## Part B. work-b

### B1. `/app/arc` (Arc assistant)

**Reference**: none in code. The old app only had keyword task search (Part 1.3) and a design brief `FLowbit/Flowbit_AI_Features.docx` (repo root) whose principles match SPEC: preview every AI change before applying, AI is opt-in, show what data is used, everything must still work with AI off. Features it listed that map to Arc: break a task into subtasks, auto-description, standup/weekly report from activity, "Ask Flowbit" Q&A ("Show me all overdue tasks for Acme", "What is blocking the release?"), meeting notes → tasks, health explainer.

**Page**: big search pill (autofocus; `?q=` in URL), three quick-action cards (Outline a project, Break down a task, Progress update), results area, history of the last 10 queries (per user, localStorage is fine).

**Workspace search** (deterministic, always available): run the Part 1.3 matcher across these collections in parallel, each limited to 5 results, all through `ctx.db` and the same visibility rules as their pages:
- Tasks: title/description/tags/key; show key, title, status pill, assignee, due. Respect 1.2 (no others' personal tasks).
- Projects: name/code; status, health, progress.
- Clients: name/displayName/email (only if work/orbit/folio has clients access).
- People: member user name/email/title/department (active members).
- Posts: title/message (non-deleted).
- Meetings: title/agenda (meetings I organise or attend, or all with `tasks.read_all`).
Exact key match (`VW-42`) jumps straight to the task. Empty: "Nothing matches '{q}'. Try a task key like VW-42 or a project code."

**Quick actions** (nothing is written until the user clicks Apply; SPEC: AI reads, people decide):
1. **Outline a project**: input = project name + one-line goal (+ optional start/end). Output = draft milestones with tasks. With `ANTHROPIC_API_KEY` (model `claude-sonnet-5-5`): prompt with the goal and workspace context (team names, typical durations); require JSON `{ milestones: [{ title, dueOffsetDays, tasks: [{ title, estimateMinutes, priority }] }] }`, validate with zod, retry once on invalid JSON. Without a key: a template keyed by simple keywords (website/app → Discovery, Design, Build, QA, Launch; marketing/campaign → Brief, Creative, Production, Launch, Report; default → Plan, Do, Review, Close), 3–4 tasks each. Editable preview table (rename, delete rows, change dates) → Apply creates the project (or picks an existing one), milestones and tasks in one transaction, then links to the project.
2. **Break down a task**: pick a task (search) → suggested subtasks (3–7) with estimates; template fallback = split on the task's description lines/sentences, else generic "Research / Draft / Review / Finalise". Apply creates child tasks (A3) under the parent.
3. **Progress update**: period (this week default, last week, custom) and scope (me / a project / a team). Built from real data only: tasks completed (grouped by project, with titles), tasks created, now overdue (with days), blocked (with reasons), time logged (by project), upcoming due in the next 7 days, meetings held. Deterministic text template ("This week the team closed 14 tasks across 3 projects...") always; with an API key, Claude rewrites it into a short narrative from the same JSON (never invents numbers: pass the numbers, ask it to keep them). Actions: Copy, "Post as update" (opens the post composer prefilled, category Update).
4. Answer-style questions (optional nicety): if the query starts with a verb pattern like "overdue", "blocked", "due today", map to the Tasks page with those filters ("Open in Tasks").

**Permission**: any Work user; results filtered by their visibility. **Errors**: API failure → fall back to the template with an info toast "Arc used a template because the AI service didn't respond."

---

### B2. `/app/work/teams` and `/app/work/teams/[id]`

**Reference**: `models/Team.js`, `models/UserTeam.js`, `app/api/teams/route.js`, `app/api/teams/[teamId]/route.js`, `.../members/route.js`, `.../members/[userId]/route.js`, `app/api/teams/join/[teamId]/route.js`, `app/api/teams/leave/[teamId]/route.js`, `lib/utils/teamAuthorization.js`, `lib/utils/teamHelpers.js`; UI `components/team/TeamPageClient.jsx`, `TeamCard.jsx`, `TeamDetailModal.jsx` (1k lines), `CreateTeamModal.jsx`, `JoinTeamPrompt.jsx`.

**Rules carried over**:
- Team: name required, ≤100, unique per org ("Team name already exists"); description ≤500; `isActive`.
- Membership (`TeamMember`): one row per (team, member), role `lead | member`. **At most one lead per team** ("This team already has a lead. Make them a member first."). Self-removal (leave) always allowed; adding/removing others or changing roles needs `teams.manage` (old `team.member.manage`). Adding members: ≥1 active member; duplicates ignored. `memberCount` was denormalised in the reference; compute with a count instead (or keep and update in the same action).
- Join: anyone who can see the directory may join an active team as `member` ("You're already in this team"). Leave: remove own row.
- Delete team: `teams.manage`; refused while tasks reference it via `teamId` in the reference. Flowbit tasks have no `teamId` (SPEC), so: delete removes memberships and unlinks the team from projects' `teamIds` (ConfirmDialog "Delete team 'Design'? 6 members will be removed from it; their tasks stay.").
- Visibility: reference had team.view.own (my teams) vs team.view.any (directory). Flowbit: every member sees the directory (it's a small company tool); `teams.manage` edits.
- Team lead powers elsewhere: sees tasks assigned to team members (1.2), may approve their timesheets if they are also their `Member.managerId` (B5). Muster may use leads for leave approvals (Muster's call).
- Reference "custom fields" per team (text/number/select/date/boolean definitions) were never filled anywhere: **drop**.
- Reference "Join your team first" gate on task creation: drop.

**`/app/work/teams` (list)**: search `?q=`; sections "My teams" (count) and "All teams"; card: name, description ("No description"), lead (crown icon) or "No team lead", member avatars + count, open tasks count, "Join" (if not a member) / "Leave" (ConfirmDialog "Leave Design?") / menu (Edit, Delete) for `teams.manage`. "+ New team" (`teams.manage`): name*, description, initial members, lead. Empty: "No teams yet. Teams group people who work together." + "Create team"; search empty: "No teams found. Create one or adjust your search."

**`/app/work/teams/[id]` (detail)**: header (name, description, edit inline for `teams.manage`), tabs **Members** | **Workload**.
- Members: table (avatar, name, title/department from Member, role chip Lead/Member, joined date, actions: Make lead / Make member / Remove (ConfirmDialog)), "+ Add people" (search active members not in team).
- **Workload** (new; SPEC requires; no reference): for each member, over a selectable period (this week default):
  - Open tasks assigned (non-personal), of which overdue, due this week, blocked.
  - Completed in period (`completedAt` in range).
  - Estimated open minutes (sum `estimateMinutes` of open tasks).
  - Logged minutes in period (sum TimeEntry).
  - Capacity = working days in period × `WORKDAY_MINUTES` (480) minus approved leave days (if Muster data is available; else ignore leave).
  - Load % = logged / capacity; Planned load % = estimated open due in period / capacity. Bar per member coloured: <70 % `--success`, 70–100 % `--warning`, >100 % `--danger`.
  - Team totals row; click a member → Tasks page filtered `assignee=<id>`.
- Empty team: "No members yet" + "Add people".

---

### B3. `/app/work/meetings` and `/app/work/meetings/[id]`

**Reference**: `models/Meeting.js`, `models/MeetingAttendee.js`, `app/api/meetings/route.js`, `app/api/meetings/[meetingId]/route.js`, `lib/services/meetingsService.js`, `lib/services/calendarService.js` (Google), `app/api/calendar/status`, `app/api/calendar/re-consent`; UI `components/meetings/MeetingsClient.jsx`, `CreateMeetingModal.jsx`, `MeetingDateTimePicker.jsx`, `MeetingCard.jsx`, `MeetingDayCard.jsx`, `MeetingsCalendar.jsx`.

**How the reference worked**: creating a meeting first created a Google Calendar event on the organiser's account (conference data → Google Meet link, `sendUpdates: 'all'` so Google emails invites, reminders email 24 h before + popup 15 min before), then stored the Meeting with the required unique `googleEventId` and `meetLink`, then inserted one MeetingAttendee per attendee with `needsAction`. Update/cancel also called Google (`updateEvent`, `deleteEvent` with `sendUpdates:'all'`). If the user's Google token lacked calendar scope → `ReConsentRequiredError` → 401 `RE_CONSENT_REQUIRED` → client redirected to a consent URL. RSVPs were never synced back from Google (no webhook), so statuses stayed `needsAction`. Meetings could not be created at all without Google.

**Flowbit (Port decision)**: meetings are plain MongoDB records; no Google Calendar API (Google is sign-in only). The organiser pastes a meeting link (Meet/Zoom/Teams URL, validated as URL) or a location.

**Validation** (reference `meetingCreateSchema` + route + modal):
- Title* ("Title is required", ≤150); agenda (≤5000).
- Start* and end* (datetime-local in IST, parse as Asia/Kolkata, not server time); end > start ("End time must be after start time"); max duration 12 h; start may be in the past only when editing.
- Attendees*: ≥1 ("Pick at least one attendee"), all active members of the org ("One or more attendees aren't in this workspace"). Organiser is implicitly an attendee (accepted).
- Location (optional) and link (optional URL). **Bug in reference**: `location` was not in the zod schema, so it was silently dropped.
- Only the organiser (or `tasks.manage`/admin) edits or cancels ("Only the organiser can change this meeting"). Reference update deleted and re-inserted all attendees, resetting every RSVP: Flowbit keeps existing RSVPs for attendees who remain and adds new ones as `pending`.
- Cancel = set `status: 'cancelled'` + `cancelledAt` (keep the record; show struck through), notify attendees. ConfirmDialog "Cancel 'Sprint review'? Attendees will be notified."

**RSVP** (SPEC; reference statuses `needsAction|accepted|declined|tentative`): attendee buttons Accept / Maybe / Decline on the detail page and on cards; organiser sees counts ("4 going, 1 maybe, 2 no reply").

**Notes and action items** (SPEC; new): detail page has a Notes textarea (organiser + attendees can edit; autosave on blur, `notesUpdatedAt/By`) and an Action items list: `{ title*, assigneeId?, dueDate?, taskId? }`; "Create task" on an item creates a Task (title, assignee, due, description "From meeting 'X' on 3 Oct") and stores `taskId` (button becomes "Open task"); "Create all tasks" bulk. Arc can later read notes to suggest items.

**`/app/work/meetings` (list/calendar)**: toggle List | Calendar (`?view=`). Filters: All / Upcoming (`endTime ≥ now`, with count) / Past; "Organised by me"; search `?q=`. Reference UI: mini month calendar with day selection and dots; selected-day list headed "Today, October 1, 2026"; the next upcoming meeting highlighted; cards with title, time range ("11:00 – 11:30"), organiser ("by Aditi Singh"), attendee avatar stack (max 4 + "+n"), "Join" button when a link exists and the meeting isn't past, organiser menu Edit / Cancel. Scope: meetings I organise or attend; `tasks.read_all` may see all (reference showed every org meeting to everyone: Part D). Sorted by start asc (upcoming) / desc (past); paginate 20.
Empty: "No meetings scheduled" + "Schedule meeting"; past empty: "No past meetings".

**`/app/work/meetings/[id]`**: title, time, organiser, location/link (Join), agenda, attendees with RSVP chips, my RSVP buttons, notes, action items, linked tasks, Edit/Cancel (organiser). Not attendee and no `tasks.read_all` → 404-style redirect.

**Notifications**: created/updated (time or attendees changed)/cancelled → attendees (1.5); optional email with an `.ics` attachment is out of scope.

---

### B4. `/app/work/posts` and `/app/work/posts/[id]`

**Reference**: `models/Post.js`, `models/PostReply.js`, `models/PostRead.js`, `app/api/posts/route.js` (GET feed, POST, `formatPost`), `app/api/posts/[id]/route.js` (GET/PATCH/DELETE), `.../replies/route.js`, `.../read/route.js` (POST read, PUT dismiss), `.../react/route.js`, `app/api/posts/unread/route.js`; UI `components/posts/PostFeed.jsx`, `PostComposer.jsx` (BlockNote editor), `PostCard.jsx`, `PostReplies.jsx`, `PostTypeSelector.jsx`, `components/announcements/AnnouncementPopup.jsx`.

**Fields and validation** (reference zod): title 1–200 ("Title is required"/"Title too long"), message 1–5000, type `announcement|discussion|idea|update` (default announcement) → Flowbit **category** with the same four values (labels Announcement, Discussion, Idea, Update), priority `LOW|MEDIUM|HIGH|URGENT` (default MEDIUM; drives popup styling; announcements only), `expiresAt` (optional; expired announcements stop popping up), audience `visibility: org|roles|private` + `targetRoles` (default ['ALL']), `mentionIds`. Flowbit adds `pinned`, `pinnedAt`, `pinnedById`.

**Permissions**: announcement → `posts.announce` (old post.announcement.create); other categories → `posts.write` (old post.create, in the member role); edit → author or `posts.moderate` (old post.update.any); delete → author or `posts.moderate`; pin/unpin → `posts.announce`.

**Create flow** (reference POST): save; then notifications: announcement → every active member in the audience (`targetRoles` contains 'ALL' → all members; else members whose role key is in targetRoles) except the author; plus mentioned members not already notified (mention); other categories → mentioned members only. Set `lastActivityAt = now`.

**Replies**: body 1–5000 ("Reply can't be empty"); on create `replyCount += 1` and `lastActivityAt = now` atomically; notify the post author (unless self) and mentioned members, deduped. Flowbit adds edit (sets `editedAt`, shows "edited"; the reference model had `isEdited/editedAt` but no route) and soft delete (author or moderator; decrement `replyCount`).

**Reactions** (posts and replies; reference grouped storage `reactions: [{ emoji, users: [id] }]`): toggle = if a group for the emoji exists and contains me → pull me, then pull empty groups; else if the group exists → addToSet me; else push `{ emoji, users: [me] }`. Returned per group: `count`, `hasReacted`. The reference UI only offered a single 👍 "like" on posts (no reaction UI on replies though the model supported it); Flowbit offers the quick set 👍 ❤️ 🎉 👏 🙌 😂 on posts and replies.

**Read tracking and read receipts**:
- `PostRead` per (post, member): `readAt` (opened/acknowledged) and `dismissedAt` (closed the popup without reading). Opening a post detail (or clicking "Got it" on the popup) upserts `readAt = now` and marks that member's notifications for this post read.
- Read receipts (SPEC; new UI): on the post, "Seen by 12 of 20"; author and `posts.moderate` can open the list (Seen with time / Not seen yet). Audience size = members in the post's audience at view time.
- **Unread announcement popup** (reference `AnnouncementPopup.jsx` + `/api/posts/unread`): on app load (and every 5 min), fetch active (`isActive`), non-deleted, non-expired announcements targeted at 'ALL' or one of my roles, not authored by me, without a `readAt` for me; newest first. Show one modal at a time styled by priority (URGENT/HIGH stronger accent); "Got it" = mark read; closing (✕/backdrop) = dismiss for this browser session (sessionStorage) and record `dismissedAt`; it shows again next session until read. Posts belong to Work, so show the popup only when Work is enabled for the workspace.

**`/app/work/posts` (feed)**: composer at the top (title, category select (Announcement only if allowed), message textarea with @mention dropdown, priority + expiry for announcements, audience select for announcements: Everyone / Roles…), filters: category tabs (All, Announcement, Discussion, Idea, Update; the reference disabled Idea/Update), "Mentioned me" toggle, author filter, search `?q=` (escaped regex on title/message), sort Newest | Oldest | Most active (`lastActivityAt`). Pinned posts first (sorted by `pinnedAt` desc) then the chosen sort. Pagination 20 per page (reference used `_id` cursors; with the "Most active" sort that cursor is wrong: use `?page=` offsets or a compound cursor `(lastActivityAt,_id)`). Card: author avatar/name, category chip, priority chip (announcements), title, message (clamped to 5 lines, "Read more"), reactions, reply count + up to 3 recent repliers' avatars, "Seen by" (author/moderator), menu (Pin, Edit, Delete).
Empty states (reference copy): "No posts yet" + "Write the first post"; "No posts match your search"; "No posts where you're mentioned".

**`/app/work/posts/[id]`**: full post, reactions, read receipts, replies (oldest first) with composer, edit/delete per permissions. Opening marks it read. Deleted post → "This post was removed" page.

**Audience enforcement (fix)**: the reference feed ignored `visibility`/`targetRoles`, so role-targeted and private posts were visible to everyone. Flowbit filters the feed and detail: org → everyone; roles → members whose role key ∈ targetRoles (+ author + moderators); private → author + mentioned members.

---

### B5. `/app/work/time` and `/app/work/time/approvals`

**Reference**: two separate concepts.
1. **TimeEntry** (timer): `models/TimeEntry.js` (seconds, `startedAt`, `stoppedAt`, `isRunning`, `entryType TIMER|MANUAL`, `billable`, `description ≤500`, `editedAt`), routes `app/api/tasks/[taskId]/time-entries/route.js` (GET list + totals, POST manual), `.../start`, `.../stop`, `app/api/time-entries/[entryId]/route.js` (PUT/DELETE), `app/api/users/me/active-timer/route.js`; UI `components/tasks/fields/TrackTimeField.jsx`, `components/tasks/time-tracking/*` (RunningTimer, TimeEntryList, TimeEntryItem, AddTimeEntryModal, EditTimeEntryModal, TimeTrackerModal), `components/layout/GlobalTimerIndicator.jsx` (top bar pill polling every 30 s and on timer events).
2. **Timesheet** (manual log with approval per entry): `models/Timesheet.js` (`workDate`, `hours 0–23`, `minutes 0–59`, `totalMinutes = h×60+m`, `workNotes ≤1000`, `status draft|approved|rejected`, `approvedBy/At`, `rejectedBy/At`, `rejectionReason` never set), routes `app/api/tasks/[taskId]/timesheet/route.js` (GET/POST), `app/api/timesheet/[entryId]/route.js` (PUT incl. status, DELETE); UI `components/tasks/TaskTimesheet.jsx`, `EditTimesheetModal.jsx`. There was **no approvals screen and no weekly view**; `Task.timeTracked` (seconds) was a denormalised total of timer entries only.

Reference rules worth keeping:
- One running timer per user across all tasks. Starting a timer when one is running auto-stops the old one (duration = floor((now − startedAt)/1000) s, credited to its task, activity `timer_stopped`) then starts the new one (activity `timer_started`).
- Stop: no running timer for this task → "No running timer found for this task".
- A running entry can't be edited or deleted ("Cannot edit a running timer. Stop it first.").
- Edit/delete own entries; others' need `time_entry.edit.any/delete.any` / `timesheet.edit.any/delete.any`. Editing duration adjusts the task total by the difference; deleting subtracts.
- Manual log: hours int 0–23, minutes int 0–59, at least one > 0 ("Total time must be greater than 0"); `workDate` default today, normalised to a calendar date (`lib/calendarUtils.js#normalizeWorkDateInput`).
- Approval: setting status approved/rejected required `timesheet.approve` and stamped approver/time; activity `TIMESHEET_APPROVED/REJECTED`.
- Live total on a task = sum of stopped durations + elapsed of the running entry.

**Flowbit (Port decision; SPEC: "timer and manual time entries against tasks/projects, weekly timesheet, submit week, manager approval")**: one `TimeEntry` model for both timer and manual, plus a `TimesheetWeek` per member per week.
- `TimeEntry`: member, `taskId?` (then `projectId` = task's project), `projectId?` (time against a project without a task), `date` 'YYYY-MM-DD' (IST date of the work; timer → date of start), `minutes` (int; timer seconds rounded to nearest minute, minimum 1), `source timer|manual`, `startedAt?`, `endedAt?`, `isRunning`, `note ≤500`, `billable` (default true if the project has a client, else false), `weekStart` (Monday 'YYYY-MM-DD'), `status draft|submitted|approved|rejected` (mirrors the week), audit fields. At least one of taskId/projectId ("Pick a task or project").
- Keep `Task.loggedMinutes` in sync (inc/dec in the same action) so task detail and reports read it cheaply.
- Week lifecycle: `draft` → (member clicks "Submit week") `submitted` → approver `approved` or `rejected` (reason required, ≥5 chars) → rejected weeks become editable again and can be resubmitted. Submitted/approved weeks are locked for the member ("This week is submitted. Ask your manager to send it back to edit."). A running timer blocks submit ("Stop your timer before submitting"). Empty week can't be submitted ("Log some time before submitting").
- Approver = the member's `Member.managerId`, or anyone with `time.approve` (owner/admin/manager). Nobody approves their own week ("You can't approve your own timesheet").
- Timer from anywhere: task detail button, Tasks list row menu "Start timer", and the top-bar pill (foundation's shell may not own it; work-b can provide a `RunningTimerPill` component in `components/work/` and list the need for the shell to render it). The pill shows task key/title + hh:mm:ss ticking locally from `startedAt`, click → task, ■ stop.

**`/app/work/time` (my time)**:
- Top: running timer card (or "Start timer" with task/project picker + note), today's total.
- **Weekly timesheet grid** (`?week=YYYY-MM-DD` Monday; prev/next/This week): rows = task or project (+ note), columns Mon–Sun (respect `org.workWeek`, greyed off-days), cells editable minutes in "h:mm" (`parseDuration`), row totals, day totals, week total vs expected (working days × 8 h). "+ Add row" (pick task/project). Status pill for the week and "Submit week" button. Rejected week shows the reason banner.
- Entries list below (date, task/project, note, duration, source icon, billable toggle, edit/delete while editable).
- Filters: project, billable. Empty: "No time logged this week" + "Start timer" / "Log time".

**`/app/work/time/approvals`** (`time.approve` or has direct reports): tabs Pending (submitted weeks of my reports / everyone for admins) | Approved | Rejected; row: member, week range ("29 Sep – 5 Oct"), total, billable total, submitted at; expand → day-by-day grid and entries; actions Approve, Reject (reason dialog), bulk approve. Notify the member (1.5). Empty: "No timesheets waiting for you".

---

### B6. `/app/work/whiteboards` and `/app/work/whiteboards/[id]`

**Reference**: whiteboards were "personal views" (`models/FolderView.js` with `type: 'whiteboard'`, `isPersonal: true`, `userId`), created through `app/api/personal-views/route.js` (POST `{ name: 'Untitled whiteboard', type: 'whiteboard' }`; name required ≤100), renamed via PATCH, deleted via DELETE (soft: `isArchived`), shared via `app/api/folder-views/[viewId]/share/route.js` (owner or `view.share`; userIds must be org users; "All users already have access"; anyone can remove themselves). Landing UI `app/whiteboard/WhiteboardLandingClient.jsx`: grid of my boards + "Shared with me", sort Date updated / Date created, "New whiteboard", inline rename (trim, non-empty), delete with confirm, share modal. Editor `app/whiteboard/[viewId]/page.jsx`, `ExcalidrawApp.jsx`, `Room.jsx`, `useExcalidrawSync.js`: Excalidraw with **Liveblocks** storage (`elements` as a LiveMap keyed by element id, pushes throttled per animation frame, remote changes merged by element version). **Nothing was saved to MongoDB.**

**Flowbit**: `Whiteboard` documents in MongoDB; Excalidraw loaded with `next/dynamic` (client only). No realtime collaboration (single editor at a time is fine); last write wins with a version check.
- List page: grid cards (thumbnail SVG/PNG preview if stored, title, owner, updated "2 h ago"), tabs Mine | Shared with me | All (`tasks.read_all`), search `?q=`, sort Updated/Created, "New whiteboard" (creates "Untitled whiteboard" and opens it), card menu Rename (inline), Share, Duplicate, Delete (ConfirmDialog; soft `archivedAt`). Empty: "No whiteboards yet" + "New whiteboard".
- Editor: title editable in the header, Share button (member picker; owner manages; shared members can edit), "Saved"/"Saving…"/"Unsaved changes" indicator, back link. Autosave debounced ~1.5 s after the last change and on page hide; payload = `{ elements, appState: { viewBackgroundColor, gridSize, theme:'dark' }, files }`, with `version` (increment; refuse a stale save with "This board changed elsewhere. Reload to see the latest." and offer Reload). Images pasted into the board: store binary as StoredFile (`saveFile`) and keep only `fileId`s in the scene; keep the document well under 16 MB (refuse saves over ~8 MB: "This board is too large to save. Remove some images.").
- Optional: link a whiteboard to a project/space (`projectId?`, `spaceId?`) so it shows on those pages.
- Permission: owner and shared members edit; `tasks.read_all` views; others get a redirect.

---

### B7. `/app/work/reports`

**Reference**: `app/reports/page.jsx` (one live card "Task & time calendar"; "Time by project" and "Utilization summary" were "Coming soon"), `components/reports/TaskCalendarClient.jsx`, `TaskCalendarFilterPanel.jsx`, `TaskCalendarAssigneePicker.jsx`, `TaskCalendarDayDrawer.jsx`, `TaskCalendarFilterChips.jsx`, `app/api/tasks/calendar/route.js`. The task & time calendar: for one member (default me) and a month (or date range), it found Timesheet entries in range, then the tasks those entries belong to (optionally filtered by project/status/priority), and returned `tasksByDate` (only days with logged time) and `timesheetsByDateAndTask`; the UI showed per day: tasks grouped by project with "Project • 3h 20m" totals and a day drawer. **Bug**: any user could pass any `assigneeId` (no permission check).

**Flowbit reports page** (SPEC: throughput, overdue, by assignee, project health, time by project; date range; CSV). One page with a date-range bar (This week, Last week, This month (default), Last month, This quarter, Custom `?from=&to=`), scope filters (project, team, assignee), and sections (tabs or stacked cards). All numbers exclude personal tasks and respect visibility (members see their own + teams they lead + projects they're on; `reports.read`/`tasks.read_all` see all). Each section has "Export CSV" (papaparse; filename `flowbit-{section}-{from}-{to}.csv`; Indian date format in cells, durations as decimal hours and "h:mm").
1. **Throughput**: per day (≤31 days) or week (longer): created (by `createdAt`) vs completed (by `completedAt`) as a two-line SVG chart; totals; average cycle time = mean(`completedAt − (startedAt ?? createdAt)`) in days (1 dp) for tasks completed in range. CSV: date, created, completed.
2. **Overdue**: current snapshot (not range): open tasks with dueDate < today; aging buckets 1–3, 4–7, 8–14, 15+ days; table task key, title, project, assignees, due, days overdue, priority; grouped counts by assignee and by project. CSV of the table.
3. **By assignee**: per member: open assigned, completed in range, overdue now, on-time completion % (completed with `completedAt ≤ dueDate end of day` / completed with a due date), avg cycle time, logged hours in range, estimate vs logged on completed tasks (variance %). Sort by any column. CSV.
4. **Project health**: per non-archived project: code, name, client, lead, status, health level + score, completion %, open, overdue, blocked, timeline progress % vs completion % ("ahead/behind by n pts"), days left, logged hours in range. Uses A5.3. CSV.
5. **Time by project**: TimeEntry minutes in range grouped by project (entries with taskId use the task's project; entries with neither → "No project"), split billable / non-billable, with a member breakdown (stacked bars), and drill-down to tasks. Only approved time toggle (default: all non-rejected). CSV: project, member, date, task, minutes, hours, billable, status.
6. **Task & time calendar** (port of the reference): month grid for one member (self by default; others only for their approver/`tasks.read_all` (fix)); days with logged time show total; clicking a day lists tasks with logged entries grouped by project with per-entry durations and notes.
Empty states: "No data for this period" with the active filters listed and "Reset filters".

---

### B8. work-b data models (all with `tenant` plugin)

```ts
// models/work/Team.ts
Team { name (1..100, unique per org), description? (≤500), isActive: boolean (default true), createdById: Member }
// index {orgId,name} unique

// models/work/TeamMember.ts
TeamMember { teamId, memberId, role: 'lead'|'member', addedById?: Member, joinedAt: Date }
// indexes {orgId,teamId,memberId} unique; {orgId,memberId}; partial unique {orgId,teamId} where role='lead' (one lead)

// models/work/Meeting.ts
Meeting { title (1..150), agenda? (≤5000), startAt: Date, endAt: Date, timezone: 'Asia/Kolkata',
  organizerId: Member, location?: string, link?: string /* URL */,
  attendees: { memberId, rsvp: 'pending'|'accepted'|'tentative'|'declined', respondedAt?: Date }[],
  status: 'scheduled'|'cancelled', cancelledAt?: Date, cancelledById?: Member,
  notes?: string, notesUpdatedAt?: Date, notesUpdatedById?: Member,
  actionItems: { _id, title, assigneeId?: Member, dueDate?: string, taskId?: Task, done: boolean }[],
  projectId?: Project }
// indexes {orgId,startAt}; {orgId,'attendees.memberId',startAt}; {orgId,organizerId}

// models/work/Post.ts
Post { authorId: Member, title (1..200), message (1..5000), category: 'announcement'|'discussion'|'idea'|'update',
  priority: 'low'|'medium'|'high'|'urgent' (announcements; default 'medium'),
  audience: 'org'|'roles'|'private', targetRoles: string[] (default ['ALL']), mentionIds: Member[],
  pinned: boolean, pinnedAt?: Date, pinnedById?: Member,
  reactions: { emoji: string, memberIds: Member[] }[], replyCount: number, lastActivityAt: Date,
  expiresAt?: Date, editedAt?: Date, deletedAt?: Date }
// indexes {orgId,deletedAt,pinned,createdAt:-1}; {orgId,category,createdAt:-1}; {orgId,lastActivityAt:-1}; {orgId,mentionIds}

// models/work/PostReply.ts
PostReply { postId, authorId: Member, body (1..5000), mentionIds: Member[], reactions: same shape, editedAt?: Date, deletedAt?: Date }
// index {orgId,postId,deletedAt,createdAt}

// models/work/PostRead.ts
PostRead { postId, memberId, readAt?: Date, dismissedAt?: Date }
// index {orgId,postId,memberId} unique; {orgId,memberId,readAt}

// models/work/TimeEntry.ts
TimeEntry { memberId, taskId?: Task, projectId?: Project, date: string, minutes: number (int ≥ 0; ≤ 1440),
  source: 'timer'|'manual', startedAt?: Date, endedAt?: Date, isRunning: boolean, note? (≤500), billable: boolean,
  weekStart: string, status: 'draft'|'submitted'|'approved'|'rejected', editedAt?: Date }
// indexes {orgId,memberId,weekStart}; {orgId,taskId}; {orgId,projectId,date}; partial unique {orgId,memberId} where isRunning=true

// models/work/TimesheetWeek.ts
TimesheetWeek { memberId, weekStart: string, status: 'draft'|'submitted'|'approved'|'rejected', totalMinutes: number,
  billableMinutes: number, submittedAt?: Date, approverId?: Member, decidedAt?: Date, decidedById?: Member, reason?: string }
// index {orgId,memberId,weekStart} unique; {orgId,status,weekStart}

// models/work/Whiteboard.ts
Whiteboard { title (1..100, default 'Untitled whiteboard'), ownerId: Member, sharedWith: Member[],
  scene: { elements: Mixed[], appState: Mixed, files: Record<string, { fileId: ObjectId, mimeType: string }> },
  version: number, thumbnailFileId?: StoredFile, projectId?: Project, spaceId?: Space, lastEditedById?: Member, archivedAt?: Date }
// indexes {orgId,ownerId,updatedAt:-1}; {orgId,sharedWith}
```

### B9. work-b source files to port (logic)
- `lib/time-utils.js` (format/parse durations) → `modules/work/time/format.ts`.
- `lib/calendarUtils.js` (`calendarDateRangeBounds`, `toCalendarDateKey`, `normalizeWorkDateInput`, `generateCalendarGrid`, month helpers) → use `lib/dates` where it overlaps.
- `app/api/tasks/[taskId]/time-entries/start/route.js` + `stop/route.js` (single-running-timer rule, auto-stop).
- `app/api/time-entries/[entryId]/route.js` (running-entry lock, total adjustment).
- `app/api/timesheet/[entryId]/route.js` (approval stamping; fix the permission order: Part D).
- `app/api/tasks/calendar/route.js` (task & time calendar grouping).
- `app/api/posts/route.js#formatPost`, `getRecentRepliersByPostIds` (last 3 distinct repliers per post via two `$group`s), `.../react/route.js` (toggle algorithm), `.../replies/route.js` (counter + dedup notifications), `.../read/route.js`, `unread/route.js` (popup query).
- `app/api/teams/[teamId]/members/[userId]/route.js` (single-lead rule), `join`/`leave` routes.
- `lib/services/meetingsService.js` (attendees fetched in one `$in` query, grouped by meeting) and `lib/services/calendarService.js#formatMeetingEvent` only as a reference for reminders/fields (no Google in Flowbit).
- `lib/taskSearch/*` (shared with work-a) for Arc.

---
## Part C. Cross-cutting

### C1. Attendance check-in (reference rules) and how Home shows it
Ownership in Flowbit: foundation owns `lib/attendance.ts` (`punch`, `todayState`, `computeDay`) and the side-panel check-in widget; Muster owns the register, corrections and rules. Work-a only **reads** `AttendanceDay` for the Home timeline and "My attendance" card (A1 items 2 and 7). The reference rules below are for whoever implements punches (copy them to foundation/Muster if useful).

Reference files: `models/Attendance.js`, `app/api/attendance/check-in/route.js`, `check-out/route.js`, `break/start/route.js`, `break/end/route.js`, `status/route.js`, `route.js` (list/stats), `config/route.js`, `lib/utils/dateUtils.js`, `lib/utils/locationUtils.js`, `lib/utils/attendanceUtils.js`, `lib/attendanceLeaveSync.js`, `components/attendance/CheckInOutButton.jsx` (top-bar widget), `components/attendance/AttendanceCalendar.jsx`, `components/hr/attendance/*` (`attendanceMonthStats.js`, `attendanceBreakUtils.js`, `attendanceCalendarUtils.js`).

Old record (one per user per day, unique `{orgId,userId,date}`): `checkIn`, `checkOut`, `totalHours` (decimal hours, 2 dp, breaks excluded), `status on-time|late|absent|half-day|present|on-leave`, `expectedCheckIn/Out` (Dates), `expectedHours` (default 8), `overtimeHours`, `undertimeHours`, `location { latitude, longitude, address, verified, officeLocationId }`, `breaks [{ type, startTime, endTime, duration (hours), notes ≤200 }]`, `totalBreakTime` (hours), `isOnBreak`, `currentBreakStart`, `halfDaySession first_half|second_half`. Org config `settings.attendance { expectedCheckIn '09:00', expectedCheckOut '18:00', expectedHours 8, gracePeriod 15 (0–60 min) }`, `officeLocations [{ name, address, latitude, longitude, radius: number | { mobile, desktop, default }, isActive }]`.

Rules:
- **Check-in**: needs `attendance.checkin.self`; refused if already checked in today ("You have already checked in today"). Employees with `workMode: 'office'` must send GPS: lat+lng required together; **gate 1** refuse if accuracy > 5000 m ("Location could not be verified (N m accuracy)... enable GPS"); must be within an active office's radius (Haversine distance; radius by device from user agent: mobile default 100 m, desktop default 2500 m when the radius is an object); **gate 2** inside the radius but accuracy > radius → refuse ("You appear to be at the office, but your GPS accuracy (Xm) is not precise enough..."); outside every office → 403 "You appear to be {d}m from the office. Check-in requires you to be within {r}m of the office location". No offices configured → "No office locations configured. Please contact HR...". Remote employees may send location (stored unverified).
- **Late**: `late` if `checkIn > expectedCheckIn + gracePeriod` (expected time built in the org timezone), else `present`. Message "Checked in (Late)" / "Checked in successfully".
- **Half-day leave today** (approved leave of type "Half Day"): first-half leave → expected 14:00–19:00 (5 h); second-half leave → 10:00–14:00 (4 h). Hard-coded times (should come from `org.officeHours` + `halfDayHours`).
- **Breaks**: types Lunch Break, Tea Break, Coffee Break, Personal Break, Rest Break, Other; can't start before check-in, after check-out, or while already on a break ("You are already on a break. Please end the current break first."); ending computes duration (hours, 2 dp) and recomputes `totalBreakTime`. Check-out auto-ends an open break.
- **Check-out**: must be checked in and not already out; `totalHours = (out − in) − totalBreakTime`; overtime = max(0, total − expected), undertime = max(0, expected − total); half-day with undertime < 0.5 h → 0; a `present` status is re-evaluated to `on-time` or `late`.
- **Live status** (widget polls): `hoursWorked = (now − checkIn) − totalBreakTime − currentBreakElapsed`; the client ticks every second between polls. GPS warm-up uses `watchPosition({ enableHighAccuracy:true })`, accepts early at ≤50 m, rejects >5000 m; error codes GEOLOCATION_UNSUPPORTED, PERMISSION_DENIED, ACCURACY_TOO_LOW, LOCATION_TIMEOUT each with a human message.
- **Absent is derived** at read time: for an active employee on a working day (weekend config incl. "which Saturdays" patterns, holidays) with no record and no approved leave → `absent`; with approved leave → `on-leave`. Not stored.
- **Month self stats** (`attendanceMonthStats.js#computeMonthStats`): present = on-time+present+late; late; absent; onLeave; halfDay; totalDays.

Mapping to Flowbit `AttendanceDay` (SPEC 4): punches `in`/`break_start`/`break_end`/`out`; `workedMinutes`, `breakMinutes`; status `present|late|half_day|absent|leave|holiday|weekoff|on_duty`; `org.officeHours { start '10:00', end '19:00', halfDayHours 4.5 }`, `org.workWeek [1..6]`. Grace period and GPS are not in SPEC (Muster "Attendance rules" may add grace; suggest default 15 min). Widget states per SPEC 3: green disc while checked in, amber on break, grey when out; buttons Check in / Take break / Resume / Check out; timer "02H 53MIN" = workedMinutes live.

How the old app displayed it: only the top-bar button (status, live hours, break dropdown) and the HR "My attendance" calendar; the dashboard showed nothing. Flowbit Home shows the timeline + "My attendance" card (A1).

### C2. Roles and permissions summary for Work
See Part 0.7 for the mapping. Built-in Flowbit roles and their Work powers (SPEC 4): owner/admin = everything; manager = "Work full" (`tasks.read_all`, `tasks.manage`, `projects.manage`, `spaces.manage`, `teams.manage`, `posts.announce`, `posts.moderate`, `time.approve`, reports all); member = Work tasks (create/edit own, see own + team-led + project + shared spaces, post discussions/ideas/updates, log time, see own reports); hr_admin/hr_exec = member-level Work + `posts.announce` (HR announcements) (suggestion); finance = member-level Work + reports read + time read (billable) (suggestion); sales = member-level Work. Server checks every write with `ctx.assert`; hide buttons the user can't use.

Reference anti-escalation (only matters for Settings → Roles, settings agent): a role assigner can grant only permissions they hold, where `x.y.any` covers `x.y.own|self|team|assigned|member|hr|cos` (`lib/permissions/catalog.js#permissionCovers`). Platform permissions can never be granted by tenants.

### C3. Work navigation (for foundation's catalog; reference `components/layout/SidebarClient.jsx`)
Old sidebar: Dashboard; Tasks ▸ All Tasks, My Tasks ▸ (Assign to me, Personal Task), personal docs/embeds + "Shared with me"; Spaces ▸ tree (space → folders → views, with row menus: rename, colour, share, archive/delete, new folder); Team; Projects; Clients; Meetings; Reports ▸ Task & time calendar; Posts; Whiteboard. Flowbit SPEC side panel for Work: "CREATE NEW PROJECT +" with recent projects, "TEAMS +" with teams, "TOOLS" with Whiteboard and Posts. Suggested extra quick links inside the Tasks page (not the shell): All, My tasks, Created by me, Personal, Due today, Overdue, Blocked, saved views.

### C4. Email preferences (settings agent, reference `models/User.js#emailNotifications`)
Per-user toggles: taskAssigned (on), statusChanged (on), taskDue (on), comments (on), mentions (on), dailyDigest (off). Flowbit `User.prefs` currently has only `sound`; if email-per-event toggles are added, these are the defaults. In-app notifications are always on.

### C5. What Work exposes to the shared Clients pages (orbit builds them)
Reference: `app/api/clients/[clientId]/stats/route.js`, `app/api/clients/[clientId]/projects/route.js`, `components/clients/ClientProjects.jsx`, `ClientOverview.jsx`, `ClientKeyPoints`. The client detail showed a Projects tab and stats computed from Work data:
- Projects: total, active (status active and not archived), internal; list with health and progress (A5.3).
- Tasks (all tasks whose `clientId` is the client or whose project belongs to the client): total, completed, in progress, to do, overdue (open and due < today), completion % = round(completed/total × 100).
Work-a should export a small query helper `getClientWorkSummary(ctx, clientId)` in `modules/work/projects/queries.ts` returning exactly these numbers plus the project list, so orbit's Clients page can import it (orbit lists the need if it doesn't exist yet). Old Client extras that orbit may want: `accountManager` (owner), `overviewItems` (bullet "key points" shown on the project page), `contractType` (one-time/recurring/hourly/fixed), `relationshipStartDate`, `industry`, `companySize`.

---

## Part D. Reference bugs and gaps (do NOT port; fixes are described in place)

Security / data isolation
1. `GET /api/tasks/board` reads `orgId` from the **query string** (`searchParams.get("orgId")`) instead of the session: any signed-in user could read another org's board by passing its id. (`app/api/tasks/board/route.js`)
2. Missing permission checks: `PUT /api/statuses` (any member can rewrite the org-wide All Tasks statuses and remap everyone's tasks); `GET /api/projects/[id]/stats` (no project access check for internal users); `GET /api/tasks/calendar` (any user can pass any `assigneeId` and read their logged time); subtask create/update/delete (no task permission check); comments GET (no personal-task access check); meetings list (every org meeting visible to everyone); posts feed ignores `visibility`/`targetRoles`.
3. Board search builds a regex from raw user input (not escaped) → errors / ReDoS on special characters.

Broken behaviour
4. **Project health formula** excludes completed tasks from "on time", so a fully finished project scores 70 = "At risk"; the repo's own doc example (75 % done) scores 62 "At risk". Corrected formula in A5.3.
5. Blocking a task when anyone else is related creates notifications with type `BLOCKED`/`UNBLOCKED`, which are not in the Notification enum → validation error → the PUT returns 500 "Failed to update task" even though the task was saved.
6. Activity types `START_DATE_CHANGED` and `TIME_ESTIMATE_CHANGED` are logged but not in the Activity enum; `logActivity` swallows the error, so those changes never appear in the timeline.
7. Editing a comment always fails: the route checks `session.user.userId` (undefined). Deleting a parent comment orphans its replies.
8. Clearing a start/due date sends `null`, which the zod update schema rejects (400). `timeEstimate` sent on create is ignored (not passed to `Task.create`).
9. Task deletion doesn't cascade: subtasks, comments, activity, time entries and timesheets stay orphaned.
10. Reassignment never creates an in-app notification: the PUT route deletes `data.assigneeId`/`data.assigneeIds` before saving and later checks `changes.assigneeChanged && data.assigneeId`, which is always false. Only Slack DMs to newly added assignees go out.
11. Hard-coded status keys survive inside "dynamic status" code: dashboard quick-complete sets `DONE`; dashboard `inProgressTasks` counts only `IN_PROGRESS`; project stats/team workload use `["IN_PROGRESS","INTERNAL_REVIEW","CLIENT_REVIEW"]`; client stats count `TODO`/`BACKLOG`; project lists compute completion with the All-Tasks set only, ignoring space/folder custom statuses.
12. Date handling: "today" is server-local midnight in some places, UTC midnight in attendance (an IST check-in between 00:00 and 05:30 lands on the previous day), `< now` vs `< startOfToday` for overdue in different screens; "This week" preset doesn't exclude done tasks; date presets use `toISOString()` (UTC) for local dates; half-day expected hours are hard-coded (10–14 / 14–19).
13. Meeting `location` is not in the zod schema → silently dropped. Meeting edits delete and recreate all attendees, resetting RSVPs. RSVPs are never updated (no Google push sync). Meetings can't be created without Google Calendar consent.
14. Notification display config reads `meta.taskName` and `meta.taskId`, but producers write `meta.taskTitle` and a top-level `taskId` → generic text and every link falls back to `/tasks`. `ANNOUNCEMENT` links to `/announcements/{announcementId}` (route doesn't exist; meta has `postId`). `POST_MENTION`/`POST_REPLY` have no display config.
15. Mentions: `parseMentions` matches the first user whose space-stripped name *contains* the token (e.g. "@Aditi" can pick "Aditi Singhania" instead of "Aditi Singh"); `getRelatedUsers` reads `team.members`, which doesn't exist on Team (members live in UserTeam), so team members are never suggested.
16. The My-Tasks "following" filter queries `followers`, a field that doesn't exist on Task.
17. Posts: "Most active" sort paginates with an `_id` cursor (skips/repeats posts); PostReply has `isEdited/editedAt` but no edit or delete route; no pinning; no read-receipt view.
18. Projects: Activity tab is **mocked** from project fields; health filter in the UI is never sent to the API; sort by health/progress declared but not implemented; the archive dialog says "you can restore it later" but no restore exists; `actualEndDate` never set; team workload counts only the first assignee.
19. Timesheets: no approvals screen or weekly view; a user with `timesheet.approve` but not `timesheet.edit.any` gets 403 before the approval code runs; owners can edit already-approved entries; `rejectionReason` is never stored; timer entries and manual timesheet entries are separate totals (task "time tracked" ignores timesheet hours).
20. SLA: `Task.slaBreached` and `Org.settings.slaRules` (HIGH 2 d, MEDIUM 5 d, LOW 7 d) exist and the UI shows "SLA Status", but nothing ever computes it.
21. Team custom fields can be defined but values are never collected anywhere. Task `customFieldValues` likewise.
22. Whiteboard scenes live only in Liveblocks; nothing is persisted in MongoDB.
23. Reports: only the task & time calendar works; "Time by project" and "Utilization summary" are "Coming soon".
24. Every task creation notifies all `task.view.any` holders (noise); notification emails get queue priority bumps for `CLIENT_REVIEW` (legacy).
25. Calendar view only plots tasks from the currently loaded list page (25), not the visible month. Date presets "Later" and "Next weekend" show hard-coded hints ("8:46 pm", "29 Nov") and do nothing. Time-estimate presets use 1 day = 16 h and 1 week = 80 h.
26. Spaces/tasks use `isArchived` on Task queries in the overview route, a field Task doesn't have (harmless but misleading).
