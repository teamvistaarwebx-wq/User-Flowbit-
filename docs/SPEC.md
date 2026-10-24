# Flowbit: build spec

The single source of truth for every agent working on this codebase. Read it whole before writing code.

Flowbit (Flowbit Technologies) is one SaaS for Indian teams of 6 to 150 people. It contains four products that share one login, one workspace, one design language and one subscription:

| Product key | Name | What it is | Accent token |
|---|---|---|---|
| `work` | Flowbit Work | Tasks, spaces, projects, teams, meetings, posts, time tracking, whiteboards, reports, Arc assistant | `--work` violet `#C084FC` |
| `muster` | Muster | HR and payroll: people, attendance, leave, reimbursements, payroll (PF/ESI/PT), HR letters, self-service | `--muster` mint `#5EEAB0` |
| `orbit` | Orbit | CRM: leads, deals, contacts, activities, pipeline reports. Owns the shared Clients pages | `--orbit` sky `#60A5FA` |
| `folio` | Folio | Billing (formerly "Billing OS"): GST invoices, quotes, receipts and allocation, ledger, aging, recurring retainers | `--folio` amber `#F5B85C` |

Plus the core: marketing site, auth, onboarding, the app shell, settings/admin, subscription, notifications and a platform admin for Flowbit staff.

The user's stance on AI: **AI reads, people decide.** Arc (the assistant in the Figma) searches and suggests. It never changes pay, attendance, letters, invoice amounts or anything else on its own. Every Arc suggestion needs an explicit click to apply.

---

## 1. Stack (fixed; do not add frameworks)

- Next.js 16 App Router, TypeScript strict, React 19, server components by default, `"use client"` only where needed.
- MongoDB through Mongoose 9. Local dev: `mongodb://127.0.0.1:27017/?replicaSet=rs0`, database `flowbit`. Transactions are available (replica set).
- Tailwind CSS v4 (CSS-first config in `src/app/globals.css`), Radix primitives for dialog/dropdown/popover/tooltip/select/tabs, `sonner` for toasts, `lucide-react` icons, `motion` for the few animations CSS can't do, `@dnd-kit` for drag and drop, `date-fns`, `zod` v4, `@react-pdf/renderer` for PDFs, `bcryptjs`, `papaparse` for CSV, `resend` for email (optional), `@excalidraw/excalidraw` for whiteboards (dynamic import, client only).
- Charts are hand-rolled SVG components in `src/components/charts` (no chart library).
- Tests: Vitest, for pure domain logic.
- Dev server: `npm run dev` on port **4100**.

## 2. Folder layout and ownership

```
flowbit/
  docs/SPEC.md                    this file
  docs/specs/<area>.md            per-area inventories written by reader agents
  scripts/seed.ts                 seed harness (foundation)
  src/
    proxy.ts                      Next 16 request proxy: session-cookie gate for /app and /platform (foundation)
    app/
      globals.css                 tokens, base styles, animations (foundation)
      layout.tsx                  root layout, Work Sans font, Toaster (foundation)
      (marketing)/                landing, pricing, products/[slug], contact, legal/*  (marketing agent)
      (auth)/                     login, signup, forgot-password, reset-password/[token], invite/[token], onboarding (foundation)
      app/                        the signed-in product. app/layout.tsx = shell (foundation)
        page.tsx                  Home dashboard (work-a agent)
        arc/                      (work-b)
        work/                     tasks, spaces, projects (work-a); teams, meetings, posts, time, whiteboards, reports (work-b)
        clients/                  shared client pages (orbit agent)
        hr/                       Muster admin/HR side (muster-a, muster-b)
        me/                       employee self-service (muster-b)
        orbit/                    (orbit)
        folio/                    (folio)
        notifications/            (settings agent)
        settings/                 (settings agent)
      platform/                   Flowbit staff admin (settings agent)
      c/[slug]/                   public reimbursement claim form (muster-b)
      api/                        route handlers. api/auth/* (foundation), api/files/* (foundation), api/<product>/* (owner of product)
    components/
      ui/                         design-system primitives (foundation only)
      charts/                     SVG charts (foundation only)
      shell/                      rail, side panel, top bar, command palette, check-in widget, notification bell (foundation only)
      <product>/                  product-specific components (that product's agent)
    lib/                          foundation only: db, auth, session, scope, catalog, plans, permissions, audit, notify, mail, files, money, dates, sequence, pdf base, sound, actions, validation helpers
    models/                       core models (foundation). models/<product>/ product models (that product's agent)
    modules/<product>/            server actions, queries, domain logic, seed for that product (that product's agent)
```

**Ownership rule:** an agent writes only inside the paths it owns. If it needs something from a path it doesn't own, it imports what exists. If what it needs doesn't exist, it builds a local version inside its own folder and lists the need in its final report. Never edit `lib/`, `components/ui`, `components/charts`, `components/shell`, `models/*.ts` (core) or `globals.css` unless you are the foundation agent.

**Build rule during the parallel build phase:** do NOT run `npm install`, `next build`, `next dev`, `tsc` on the whole project, or start any browser. The machine has 8 GB of RAM and parallel builds have crashed it before. You may run `npx vitest run <your own test files>`. Typecheck and build run later, one agent at a time.

## 3. Design language (from the Figma file "New Flowbit", dark theme only)

> **Superseded by `docs/DESIGN.md`** (values measured from the Figma captures). Where this section and DESIGN.md disagree (tokens, radii, rail width, status colours, bar thickness), DESIGN.md wins. The copy, behaviour and sound rules below still apply.

Brand kit: deep indigo `#210B5D`, orchid `#BB62A5`, blush `#EAC1DC`. Typeface **Work Sans** (400/500/600/700). The mark is an eight-ray burst around a centre dot ("connected nodes, flow in all directions"). The brand gradient runs indigo → orchid → blush, soft and blurred like a mesh.

Dark theme only. No light mode. Tokens (defined in `globals.css` as CSS variables and Tailwind theme colors):

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0A0F` | page background |
| `--bg-2` | `#121017` | side panel, top bar |
| `--surface` | `rgba(255,255,255,0.035)` | cards (glass) |
| `--surface-2` | `rgba(255,255,255,0.06)` | inputs, hovered rows, chips |
| `--border` | `rgba(255,255,255,0.08)` | card and input borders |
| `--border-strong` | `rgba(255,255,255,0.16)` | focused inputs, outline buttons |
| `--text` | `#F4F1F8` | primary text |
| `--text-2` | `#B7B0C2` | secondary text |
| `--text-3` | `#7E768C` | captions, placeholders |
| `--indigo` | `#210B5D` | brand |
| `--orchid` | `#BB62A5` | brand, active accents |
| `--blush` | `#EAC1DC` | brand, highlights, greeting name |
| `--chip-active` | `#4B2A8C` | selected chip / segmented control |
| `--success` | `#5EEAB0` | on time, completed, paid |
| `--warning` | `#E8B65C` | late, medium, part paid |
| `--danger` | `#F0507A` | absent, overdue, high priority, errors |
| `--info` | `#6366F1` | in progress |
| `--pink` | `#F9A8D4` | blocked |
| `--orange` | `#E8804F` | project done ring, high priority |

Gradients:
- `--grad-brand`: `linear-gradient(120deg, #210B5D 0%, #6B3A9E 40%, #BB62A5 70%, #EAC1DC 100%)`, animated by shifting `background-position` over a 200% canvas (12 s, ease-in-out, infinite).
- `--grad-button`: `linear-gradient(90deg, #EAC1DC 0%, #BB62A5 45%, #4B2A8C 100%)`. Primary pill buttons, with a light sweep (shimmer) on hover.
- `--grad-rail`: `linear-gradient(180deg, #2A0F66 0%, #4A1F7A 55%, #7A3A86 100%)`. The nav rail.
- Progress/timeline fill: `linear-gradient(90deg, #EAC1DC, #8B5CF6 60%, #4B2A8C)`.

Shapes and type: cards radius 20px, inputs and buttons fully rounded (pill), chips pill, rail radius 18px. Section labels are 11–12px uppercase, semibold, letter-spacing 0.08em, with a small icon before them (e.g. "PROJECT OVERVIEW", "ASSIGN TO ME", "MY ATTENDANCE"). Page greeting 28px semibold, with the person's name in `--blush`. Body 14px; tables 13px.

The shell (match the Figma):
1. **Logo top-left**: the burst mark plus "Flowbit" in gradient text.
2. **Nav rail** (72px wide, floating pill with `--grad-rail`, 18px radius, 12px from the edges): icon (20px) over a label (11px) per item. Active item: a white 4px bar on the rail's left edge and a white icon. Items come from the catalog: Home, Arc (special: a small tile with the gradient), Tasks, Spaces, Team, Project, Client, Meeting, Reports, then product groups HR (Muster), Orbit, Folio. Bottom: Invite, Settings. Locked products show a small lock and open the upgrade dialog.
3. **Side panel** (248px, `--bg-2`, border-right): workspace switcher (square gradient avatar + workspace name + chevron), a search pill (opens the command palette, ⌘K), then contextual sections from the catalog for the active product. For Work: "CREATE NEW PROJECT +" with recent projects, "TEAMS +" with teams, "TOOLS" with Whiteboard and Posts. At the bottom: the **check-in widget** card ("CHECK IN" label, live timer `02H 53MIN`, a glossy clock disc that is green while checked in, amber on break, grey when out) and an outline pill button: Check in / Take break / Resume / Check out.
4. **Top bar**: breadcrumb with an icon (e.g. a home icon + "Home"), and on the right a notification bell and the user's avatar circle with a menu (profile, settings, sound on/off, sign out).
5. **Content**: max-width none, 24–32px padding, cards on a 12-column grid with 16px gaps.

Home dashboard (from the Figma): greeting "Good morning, {firstName}" + date; **workday timeline** bar (office hours with a gradient fill up to now, labelled hour ticks and a "Half day" marker); **Arc card** (logo "arc.ai", three suggestion chips "Outline Flowbit", "Breakdown task", "Progress update", and a big pill input "search your workspace and web in seconds"); three **stat cards** (In progress, Overdue, Completed) each with a count, a ±% pill and a glowing sparkline (indigo, red, green); **Project overview** card with a project dropdown, legend (Project done %, In progress %, Blocked %), concentric ring chart with the task count in the centre, and project details (status pill, assignee avatar stack, timeline date); **Assign to me** table with All task / Done / Due tabs and columns Task name, Priority (bar icon + coloured label), Due, Assignee; **My attendance** card with a segmented bar (On time %, Late %, Absent %) and a month calendar with coloured day pills and a big date with month switcher.

Auth screens (from the Figma): split screen. Left half: animated brand gradient, the logo and the line "Everything in flow. Nothing in the way". Right half: black with a glass card "Sign in to **Flowbit**" (Flowbit in gradient), "Use the email your team invited you with.", Email, Password with "Forgot password?" link in orchid, a terms checkbox, a gradient "Sign in →" pill, "Or continue with", and "Sign in with Google" as a pill with a multicolour gradient border. Decorative glossy 3D ribbon shapes (render them as blurred, rotated gradient bars in CSS/SVG) peek from the card's corners.

Onboarding (from the Figma): a glass card centred on a dark mauve gradient, a faint huge vertical word "workspace" behind it, two step bars at the top. Step 1 "Create your workspace — All your work — unified.": Workspace name*, Workspace URL* (slug, live-checked), "How many people will use this workspace?" chips (Just myself, 2–10, 11–50, 51–200, 200–500, 500+), "Invite team members (optional)" with an Add member button and the list, "Skip for now", "Continue". Step 2 "Choose how you want to work": two selectable cards, **Project-Based Workspace** (Tasks, subtasks & sprints; Milestones & time tracking; Team members & discussions; Reports across projects; "Workspace → Projects → Tasks → Subtasks"; best for agencies, startups, software & marketing teams) and **Personal Task Workspace** (Personal tasks & to-do lists; Reminders & daily planner; Notes & goals; Calendar events; "Workspace → My Tasks (no project setup)"; best for students, freelancers, personal productivity). A "Selected" tab sits on the chosen card. "Create Workspace" button.

Motion and sound (required everywhere):
- Animated gradients on the brand surfaces (auth left half, rail, primary buttons' shimmer, progress fills, hero sections).
- Hover lift (translateY -1px, brighter border), press scale 0.98, 150–200 ms.
- Sound effects through `lib/sound` (Web Audio, synthesized, no audio files): `click` on real action buttons (links, tabs and view switchers stay silent), `toggle` for switches/chips/checkboxes (on rises, off falls), `success` on a successful save, `error` on a refusal, `notify` for a new notification, `pop` for opening dialogs/menus, `whoosh` for page-level transitions like completing onboarding. The `Button` primitive plays `click` by default; `href` buttons are silent. Master level about -24 dB, repeats debounced, nothing before the first interaction, independent of reduced motion. No coloured dots before labels, no status dots inside pills, no pulsing live dots; legends use `Swatch` (a short line). `toast.success`/`toast.error` wrappers in `lib/toast` play `success`/`error`. Users can turn sounds off (avatar menu and Settings → Appearance); the choice is stored per user.
- Respect `prefers-reduced-motion`: no gradient animation, no lift.

Copy style: plain, specific, active voice. Messages name what happened to what: "Task 'Homepage copy' moved to Done", "Leave approved for Aditi Singh, 2 days". Errors say what to do. Indian conventions: ₹ with en-IN grouping, dates like "20 Jul 2026", Asia/Kolkata time zone.

## 4. Core architecture (foundation provides; everyone uses)

### Auth and sessions — `lib/auth/*`
- Email + password (bcrypt). Google OAuth via authorization-code flow in `app/api/auth/google/*`, enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set (the button shows "not configured" otherwise).
- Session = random 32-byte token in an httpOnly cookie `fb_session`; the `Session` model stores its SHA-256 hash, `userId`, `activeOrgId`, `expiresAt` (30 days, sliding).
- `getSession()` (React `cache`) → `{ user, session } | null`.
- `requireUser()` → redirects to `/login` when signed out.
- `requireMember()` → `Ctx` for the active org or redirect to `/onboarding`.
- Password reset by emailed token; invites by emailed token (`/invite/[token]`).

### Tenancy and context — `lib/ctx.ts`
Every product document has `orgId`. Never query without it. Use the context:

```ts
const ctx = await requireMember()           // in pages, layouts, actions
ctx.orgId, ctx.userId, ctx.member, ctx.org, ctx.user
ctx.can('tasks.write')                        // boolean
ctx.assert('payroll.run')                     // throws ForbiddenError → actions turn it into { ok:false }
ctx.has('orbit')                              // product entitled AND enabled
const Tasks = ctx.db(Task)                    // org-scoped wrapper
await Tasks.find({ status: 'todo' }).lean()   // orgId injected
await Tasks.create({ title })                 // orgId injected
await Tasks.updateOne({ _id }, { $set: {...} })
await Tasks.aggregate([...])                  // $match { orgId } prepended
```

The wrapper exposes `find, findOne, findById, countDocuments, exists, distinct, create, insertMany, updateOne, updateMany, findOneAndUpdate, deleteOne, deleteMany, aggregate`. All product models apply the `tenant` plugin from `lib/db/tenant.ts`, which adds `orgId: { type: ObjectId, ref: 'Org', required: true, index: true }` and `timestamps`.

### Server actions — `lib/actions.ts`
```ts
export type ActionResult<T = void> =
  | { ok: true; message?: string; data?: T; redirect?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export const action = <I, O>(schema: z.ZodType<I>, fn: (input: I, ctx: Ctx) => Promise<ActionResult<O>>, opts?: { perm?: Permission; product?: ProductKey })
```
`action()` parses FormData or a plain object with the schema, builds the ctx, checks permission and product entitlement, catches `ForbiddenError`/`ZodError`/known errors into `{ ok:false }`, and logs unknown errors server-side with a generic message. Call `revalidatePath` inside `fn` as needed.

Client side: `<ActionForm action={...} onDone?>` (in `components/ui`) runs the action with `useActionState`, disables the submit button with a pending label, shows a toast with sound, scrolls to the first field error, and follows `redirect`. For non-form buttons: `useAction(fn)` hook returning `[run, pending]` with the same toast/sound behaviour.

### Catalog, permissions, plans — `lib/catalog.ts`, `lib/permissions.ts`, `lib/plans.ts`
The catalog is the single source of truth for products, features, nav, routes and permissions. Shell nav, route guards, the modules page and the pricing page all derive from it. It is fully written by the foundation (section 6). Product agents must create a page at every `href` listed for their product.

Built-in roles (custom roles can be created in Settings → Roles by combining permissions):

| Role key | Label | Gets |
|---|---|---|
| `owner` | Owner | everything, including subscription and deleting the workspace |
| `admin` | Admin | everything except subscription and workspace deletion |
| `hr_admin` | HR admin | all Muster permissions, people read/write, payroll run/approve, letters, claims review |
| `hr_exec` | HR executive | Muster people/attendance/leave/claims/letters, no payroll approve or salary edit |
| `finance` | Finance | payroll approve/release, claims pay, all Folio permissions, reports |
| `manager` | Manager | Work full, approve leave/attendance/time for direct reports, Orbit read |
| `sales` | Sales | Orbit full, Clients write, Folio quotes |
| `member` | Member | Work tasks, own self-service, own claims and leave |

Self-service (`/app/me/*`) is available to every member who has a linked employee record, whatever the role.

Plans and subscription (`lib/plans.ts`): a workspace starts with a **15-day trial of everything**. Prices (INR, ex-GST, per month; yearly = 10 × monthly):

| Plan | Unit | Monthly | Minimum |
|---|---|---|---|
| Work | user | ₹59 | 5 users |
| Muster Starter (no payroll) | employee | ₹39 | 10 |
| Muster Business (payroll, PF/ESI/PT) | employee | ₹79 | 10 |
| Orbit | sales user | ₹149 | 2 |
| Folio | workspace | ₹399 flat, includes 3 users | 1 |
| **Suite (all four)** | person | **₹149** | 10 |

`Org.subscription = { status: 'trialing'|'active'|'past_due'|'canceled'|'expired', plan: 'trial'|'suite'|'custom', products: { work: boolean, muster: 'starter'|'business'|null, orbit: boolean, folio: boolean }, seats: number, cycle: 'monthly'|'yearly', trialEndsAt, currentPeriodEnd, razorpaySubscriptionId? }`. Muster Starter excludes `muster.payroll` features. After the trial ends without a plan, the workspace becomes read-only for 30 days (actions refuse with "Your trial has ended — choose a plan to keep editing"), then data stays but access is blocked except Settings → Subscription. `Org.enabledProducts` lets an owner switch entitled products off/on.

Payment: Razorpay Subscriptions when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set. Without keys, the checkout shows "Test mode" and a "Simulate payment" button that activates the subscription (local development only).

### Other core services
- `lib/audit.ts`: `audit(ctx, { action, entity, entityId, summary, meta? })` writes `AuditLog`. Call it for every create/update/delete that matters (people, salary, payroll stages, letters, invoices, receipts, roles, members, subscription).
- `lib/notify.ts`: `notify(ctx, { userIds, title, body?, href?, kind })` writes `Notification` (the bell polls `/api/notifications/unread` every 30 s and plays `notify` on new items).
- `lib/mail.ts`: `sendMail({ to, subject, html, text?, attachments? })` uses Resend when `RESEND_API_KEY` is set, otherwise stores the message in the `Outbox` collection and logs it. Always also stored in `Outbox` (Settings → Email log shows them).
- `lib/files.ts`: `saveFile(ctx, { name, mime, data: Buffer, kind, entity?, entityId? })` → `StoredFile` (local disk under `STORAGE_DIR`, default `./storage`); `GET /api/files/[id]` streams with an org check; `fileUrl(id)`.
- `lib/sequence.ts`: `nextSeq(orgId, key)` atomic counter (invoice numbers, letter references, employee codes, task keys).
- `lib/money.ts`: money is **integer paise** everywhere. `rupeesToPaise`, `paiseToRupees`, `formatINR(paise, { decimals? })`, `formatINRCompact`.
- `lib/dates.ts`: `todayIST()` → `'YYYY-MM-DD'`, `formatDate`, `formatDateTime`, `monthRange`, `workingDaysBetween`, `fiscalYear(date)` → `'2026-27'`, `greeting(date)`. Day-level fields are `'YYYY-MM-DD'` strings; timestamps are `Date`.
- `lib/pdf/base.tsx`: `PdfDocument` letterhead layout (org logo/name/address/GSTIN, Work Sans registered, page numbers, "computer-generated" footer) for invoices, payslips and letters.
- `lib/sound.ts` (client): `play(name)`, `useSoundPref()`.
- `lib/toast.ts` (client): `toast.success/error/info` wrappers with sound.
- `lib/serialize.ts`: `plain(doc)` converts ObjectIds/Dates for client components.
- `lib/validation.ts`: shared zod helpers (`objectId`, `isoDate`, `paise`, `email`, `phone`, `gstin`, `pan`, `ifsc`, `slug`).

### Core models — `src/models/*.ts` (foundation)
- `User` { email (unique, lowercased), name, passwordHash?, googleId?, avatarFileId?, prefs { sound: boolean }, isPlatformAdmin, lastLoginAt }
- `Session` { tokenHash, userId, activeOrgId?, expiresAt, userAgent }
- `Org` { name, slug (unique), logoFileId?, teamSize, mode: 'project'|'personal', address?, gstin?, state?, timezone 'Asia/Kolkata', officeHours { start '10:00', end '19:00', halfDayHours 4.5 }, workWeek [1..6], subscription {...}, enabledProducts [...], createdBy }
- `Member` { orgId, userId, role (built-in key or custom role id), status 'active'|'invited'|'disabled', title?, department?, managerId? (Member), employeeId? (Muster Employee), joinedAt }
- `Role` { orgId, key, label, permissions [Permission], builtIn }
- `Invite` { orgId, email, role, tokenHash, invitedBy, expiresAt, acceptedAt? }
- `PasswordReset` { userId, tokenHash, expiresAt, usedAt? }
- `AuditLog`, `Notification` { orgId, userId, title, body, href, kind, readAt? }, `Outbox`, `StoredFile`, `Counter`
- `Client` { orgId, name, displayName?, kind 'company'|'individual', email?, phone?, website?, gstin?, pan?, state? (2-letter code e.g. 'MP'), billingAddress { line1, line2, city, state, pincode, country }, contacts [{ name, email, phone, role, primary }], ownerId? (Member), tags [], source?, status 'lead'|'active'|'inactive', notes? } — shared by Work (projects), Orbit (deals/contacts) and Folio (invoices). Orbit owns the Clients pages.
- `AttendanceDay` { orgId, memberId, employeeId?, date 'YYYY-MM-DD', punches [{ type: 'in'|'break_start'|'break_end'|'out', at: Date, source: 'web'|'admin', note? }], status: 'present'|'late'|'half_day'|'absent'|'leave'|'holiday'|'weekoff'|'on_duty', workedMinutes, breakMinutes, firstIn?, lastOut?, locked: boolean, correctedBy? } with a unique index on { orgId, memberId, date }. The check-in widget writes punches through `lib/attendance.ts` (`punch(ctx, type)`, `todayState(ctx)`, `computeDay(day, org.officeHours)`); Muster builds the register, corrections and month locking on top.

### Cross-product models (owners must implement at least these fields, at these paths, so others can read them)
- `models/work/Task.ts` (work-a): `Task` { orgId, key (e.g. 'FB-42'), title, description?, status 'todo'|'in_progress'|'in_review'|'blocked'|'done', priority 'low'|'medium'|'high'|'urgent', assigneeIds [Member], creatorId, projectId?, spaceId?, folderId?, parentId? (subtask), dueDate? 'YYYY-MM-DD', startDate?, completedAt?, isPersonal, tags [], clientId?, estimateMinutes?, order }
- `models/work/Project.ts` (work-a): `Project` { orgId, code, name, description?, clientId?, status 'planning'|'active'|'on_hold'|'completed'|'cancelled', health 'on_track'|'at_risk'|'off_track', leadId, memberIds [], startDate?, endDate?, color }
- `models/muster/Employee.ts` (muster-a): `Employee` { orgId, code (e.g. 'VW-0001'), memberId?, firstName, lastName, workEmail, personalEmail?, phone?, gender?, dob?, designation?, departmentId?, managerId? (Employee), employmentType 'full_time'|'part_time'|'intern'|'contract', status (13 lifecycle statuses, see Muster spec), joinDate, exitDate?, workLocation?, ptState?, pan?, uan?, esicNumber?, bank { accountName, accountNumber, ifsc, bankName }, address, emergencyContact }
- `models/orbit/Deal.ts` (orbit): `Deal` { orgId, title, clientId?, leadId?, valuePaise, stage, probability, ownerId, expectedCloseDate?, status 'open'|'won'|'lost' }
- `models/folio/Invoice.ts` (folio): `Invoice` { orgId, number?, clientId, entityId, status 'draft'|'issued'|'part_paid'|'paid'|'void', issueDate?, dueDate?, totalPaise, balancePaise, currency 'INR' }

## 5. Quality bar (every agent)

- Every page listed for your area exists, loads real data from MongoDB through `ctx.db`, and every button, form, filter, tab and menu item works. No placeholder pages, no "coming soon", no dead links.
- Every list has search/filter where it helps, a designed empty state with the action to create the first item, and pagination (URL params `?page=&q=`) when it can grow.
- Every form validates with zod on the server, shows field errors, keeps input on refusal, toasts with sound on success, and lands where the user expects (detail page after create, back to the record after edit, stays for inline cards).
- Every destructive action uses `ConfirmDialog`. Records that are legal or financial (issued letters, issued invoices, released payroll) are never hard-deleted; they are voided/cancelled with a reason.
- Permission checks on the server for every read of sensitive data and every write (`ctx.assert`). Hide buttons the user can't use, but never rely on hiding.
- Write `audit()` for meaningful changes and `notify()` where someone needs to act (approvals, assignments, mentions).
- Seed realistic demo data for your area in `modules/<product>/seed.ts` exporting `seed(ctx: SeedCtx): Promise<void>` (see `scripts/seed.ts`), using Indian names, ₹ amounts and plausible dates around October 2026.
- Unit tests for pure domain logic (calculations, state machines, numbering) in `*.test.ts` next to the code.
- Keep code to the point: small files (200–400 lines, 800 max), small functions, no speculative abstractions, no dead code, no `console.log` left behind. Match the existing code's naming and style.
- Immutable updates in client state. Handle errors explicitly; never swallow them.

## 6. Catalog (the full route map)

Every `href` below must exist. `perm` is checked by the shell and the page. Products: `core` (always on), `work`, `muster`, `orbit`, `folio`.

**Core**
- `/app` Home dashboard (work-a)
- `/app/notifications` Notifications (settings)
- `/app/settings` → General (workspace name, slug, logo, address, GSTIN, office hours, work week) `org.manage`
- `/app/settings/profile`, `/app/settings/security` (password, sessions), `/app/settings/appearance` (sounds, reduced motion) — every member
- `/app/settings/members` `members.manage` (list, invite, change role, disable, resend invite)
- `/app/settings/roles` `roles.manage` (built-in + custom roles, permission matrix by product)
- `/app/settings/modules` `org.manage` (switch entitled products on/off; locked ones link to subscription)
- `/app/settings/subscription` `billing.manage` (current plan, trial countdown, seats used, plan picker with monthly/yearly and per-product or Suite, checkout, billing history with GST invoices from Flowbit)
- `/app/settings/integrations` `org.manage` (Google sign-in status, email provider status, Razorpay status, storage)
- `/app/settings/audit` `audit.read` (filterable audit log)
- `/app/settings/email-log` `org.manage` (Outbox)
- `/platform`, `/platform/orgs`, `/platform/orgs/[id]` — Flowbit staff only (`user.isPlatformAdmin`): all workspaces, plan, status, seats, MRR, extend trial, change plan, disable workspace.

**Work** (`/app/arc` and `/app/work/*`)
- `/app/arc` Arc assistant (work-b): workspace search across tasks, projects, clients, people, posts, meetings; quick actions (Outline a project → draft milestones and tasks for review; Break down a task → suggested subtasks for review; Progress update → generated summary of the week from real data). Uses Claude (model `claude-sonnet-5-5`) only when `ANTHROPIC_API_KEY` is set; otherwise deterministic templates and search. Nothing is created until the user clicks Apply.
- `/app/work/tasks` (work-a): views list | board (kanban by status, drag to move) | calendar (by due date) via `?view=`; filters (assignee, project, space, priority, status, due: today/overdue/this week, mine); saved views; bulk actions; quick add.
- `/app/work/tasks/[id]` (work-a): title/description edit, status, priority, assignees, dates, project/space/folder, tags, subtasks, checklist, comments with @mentions, attachments, activity timeline, time logged, watchers.
- `/app/work/spaces`, `/app/work/spaces/[id]` (work-a): spaces with folders and lists; tasks inside; colors/icons; members.
- `/app/work/projects`, `/app/work/projects/[id]` (work-a): project list (cards/table, health, progress), detail tabs Overview (progress ring, health, milestones, members), Tasks (board), Milestones, Files, Activity, Settings.
- `/app/work/teams`, `/app/work/teams/[id]` (work-b): teams, members, team workload.
- `/app/work/meetings`, `/app/work/meetings/[id]` (work-b): schedule (title, time, attendees, agenda, link), calendar/list, notes, action items that become tasks, RSVP.
- `/app/work/posts`, `/app/work/posts/[id]` (work-b): announcements with categories, pinning, read receipts, replies, reactions.
- `/app/work/time`, `/app/work/time/approvals` (work-b): timer and manual time entries against tasks/projects, weekly timesheet, submit week, manager approval.
- `/app/work/whiteboards`, `/app/work/whiteboards/[id]` (work-b): Excalidraw boards saved to MongoDB.
- `/app/work/reports` (work-b): task throughput, overdue, by assignee, project health, time by project, with date range and CSV export.

**Clients** (shared, built by orbit): `/app/clients`, `/app/clients/new`, `/app/clients/[id]` with tabs Overview, Contacts, Projects (Work), Deals (Orbit), Invoices and Ledger (Folio), Activity. Requires any of work/orbit/folio.

**Muster** (`/app/hr/*`, `/app/me/*`, `/c/[slug]`)
- muster-a: `/app/hr` HR dashboard; `/app/hr/people`, `/app/hr/people/new`, `/app/hr/people/import`, `/app/hr/people/[id]` (tabs: Profile, Job, Documents, Nominees, Bank & statutory, Remarks, Attendance, Leave, Letters, Payslips), `/app/hr/people/[id]/edit`; `/app/hr/attendance` (month register grid, mark/override, lock month), `/app/hr/attendance/corrections`; `/app/hr/leave` (requests and approvals), `/app/hr/leave/calendar`, `/app/hr/leave/balances`; `/app/hr/settings` (tabs: Departments, Designations, Holidays, Leave types & policy, Attendance rules, Policies documents).
- muster-b: `/app/hr/claims` (review queue), `/app/hr/claims/forms`, `/app/hr/claims/forms/[id]`, public `/c/[slug]` (work-email OTP verification, receipts upload, submit); `/app/hr/payroll` (cycles), `/app/hr/payroll/[id]` (8-stage workflow: attendance locked → claims closed → generated → HR reviewed → finance approved → locked → released → payslips published; entries table with holds/exclusions/adjustments), `/app/hr/payroll/structures` (salary components and structures, statutory settings PF/ESI/PT by state with effective dates); `/app/hr/letters`, `/app/hr/letters/new`, `/app/hr/letters/[id]` (20 templates, numbered references, PDF, email, never deleted, can be revoked); `/app/hr/reports` (employee master, attendance, leave, payroll register, PF/ESI/PT, claims, gratuity; CSV); `/app/me` (my profile and details), `/app/me/attendance`, `/app/me/leave`, `/app/me/payslips`, `/app/me/claims`, `/app/me/letters`, `/app/me/documents`.

**Orbit** (`/app/orbit/*`): `/app/orbit` pipeline dashboard (pipeline value by stage, won this month, conversion, follow-ups due today); `/app/orbit/leads` (table + board by stage), `/app/orbit/leads/new`, `/app/orbit/leads/[id]` (timeline of activities, follow-ups, convert to client + deal); `/app/orbit/deals` (kanban by stage with values, drag), `/app/orbit/deals/[id]` (won → create quote/invoice in Folio when entitled); `/app/orbit/contacts`, `/app/orbit/contacts/[id]`; `/app/orbit/activities` (calls, emails, meetings, notes, follow-ups; today / overdue / upcoming); `/app/orbit/reports` (cold vs warm conversion, by source, by owner, won/lost reasons); `/app/orbit/settings` (stages, sources, lost reasons, sectors).

**Folio** (`/app/folio/*`): `/app/folio` dashboard (receivables, overdue, collected this month, aging buckets, top debtors); `/app/folio/invoices`, `/app/folio/invoices/new`, `/app/folio/invoices/[id]`, `/app/folio/invoices/[id]/edit` (draft → issue with number series per entity and FY; GST: CGST+SGST within state, IGST across states, non-GST entity issues sale invoices with no tax; PDF; email to client; void with reason; record payment); `/app/folio/quotes`, `/app/folio/quotes/new`, `/app/folio/quotes/[id]` (quote/proforma → convert to invoice); `/app/folio/receipts`, `/app/folio/receipts/new` (money received against a client, then allocated to invoices; unallocated = advance); `/app/folio/recurring` (retainers that create monthly drafts); `/app/folio/credit-notes`; `/app/folio/ledger/[clientId]` (client statement, PDF); `/app/folio/reports` (aging, GST summary for GSTR-1 prep, collections, revenue by client/month; CSV); `/app/folio/settings` (business entities with GST/non-GST, logo, address, bank accounts, number series, tax rates, default terms, signatory).

## 7. Environment

`.env.local`: `MONGODB_URI`, `MONGODB_DB=flowbit`, `APP_SECRET`, `APP_URL=http://127.0.0.1:4100`, `STORAGE_DIR=./storage`, optional `RESEND_API_KEY`, `MAIL_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `ANTHROPIC_API_KEY`, `PLATFORM_ADMIN_EMAILS`.

Seed logins are written to `seed-logins.local.md` (git-ignored). Never print passwords in chat or logs.

## 8. Reference code on this machine (read, port, don't copy blindly)

| Area | Path | Use it for |
|---|---|---|
| Muster (HR) | `~/Downloads/Personal work/vistaar-peopleos` | payroll engine (`src/lib/payroll`), statutory PF/ESI/PT, attendance/leave arithmetic, letters catalogue and templates, CSV import, claims OTP, employee lifecycle, sound, UX rules (`docs/UX-FLOWS.md`) |
| Billing OS → Folio | `~/Downloads/Personal work/vistaar-billingos` | invoice state machine, numbering per entity/FY, GST math, receipts and allocation, ledger, aging, reminders, invoice PDF |
| Orbit (CRM) | `~/Downloads/Code & Tools/Invoice builder Code/vistaar-crm` (`FLOW.md`, `app/src`) | lead stages, cold vs warm conversion, sectors, owner/reviewer, activity log |
| Old Flowbit (JS) | `~/Downloads/Vistaar (HRMS)/_ref/oss-main` | task features: spaces/folders/views, kanban, task detail, subtasks, comments, timesheets, meetings, posts, reports, notifications, roles |
| Flowbit rewrite draft | `~/Downloads/Flow bite` | catalog/plans/entitlements pattern (`shared/catalog.ts`, `shared/plans.ts`), tenant isolation |
| Per-area inventories | `docs/specs/*.md` | written by reader agents from the above |
