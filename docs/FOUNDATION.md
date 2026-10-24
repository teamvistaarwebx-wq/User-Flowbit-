# Flowbit foundation: API reference for product agents

Read this with `docs/SPEC.md`. Everything below exists and was typechecked (`npx tsc --noEmit`), unit-tested (`npx vitest run`) and boot-checked (`next dev`, `/login`, `/signup`, `/app` all 200). Patch 1 (§0) was typechecked and unit-tested; it was not boot-checked in a browser. Import only what is listed here; if you need something that is missing, build a local version in your own folder and report it.

Contents: 0a redesign (patch 2) · 0 changes in patch 1 · 1 rules · 2 layout · 3 context and auth · 4 models · 5 server actions · 6 lib reference · 7 UI components · 8 charts · 9 shell · 10 catalog and permissions · 11 recipes · 12 gotchas

---

## 0a. Redesign to the Figma (patch 2, 2 Oct 2026)

The visual language now follows `docs/DESIGN.md` (measured from the Figma). Every change is backwards compatible: no prop, export or token name was removed. Typechecked (`tsc` 0 errors) and `npx vitest run` green (80 files, 768 tests); screens checked in a browser against the Figma captures.

- **Token values changed, names kept.** `--bg` `#171717`, `--bg-2` `#1A1A1A`, `--text` `#FFF`, `--text-2` `#A3A1A4`, `--text-3` `#858386`, `--border` white 10%, `--border-strong` white 18%. Status: `--success` `#08AD93`, `--warning` `#E4BD6D`, `--danger` `#FF4540`, `--info` `#6160FF`, `--pink` `#FAB5E8`, `--orange` `#E68763`. `--chip-active` is the Figma violet `#56397D`; `--violet` stays a readable lavender (`#9A80CC`) for data and badges. Gradients `--grad-brand` (mesh), `--grad-button` (Sign in), `--grad-rail`, `--grad-progress` (workday fill), `--grad-text` (wordmark), `--grad-mauve` hold the Figma stops; workspace brand colours still override them.
- **New tokens** (CSS vars, and Tailwind colours where named): `--line` `#535353` (`border-line`, `bg-line`), `--line-soft` (`bg-line-soft`), `--surface-solid` (`bg-solid`), `--surface-table`, `--control` `#171717` (`bg-control`), `--control-active` `#313131` (`bg-control-active`), `--menu` `#1F1F1F` (`bg-menu`), `--text-4` (`text-fg-4`, placeholders), `--icon-muted` (`text-icon-muted`), `--name` (`text-name`), `--link` `#CA81B8` (`text-link`), `--violet-2` `#5D4083` (`bg-violet-2`), `--mint` `#70F3C3`, `--absent` `#F5548C`, `--ring-track`, `--day-ink`, `--grad-button-alt` (onboarding Continue), `--grad-google`, `--grad-selected`, `--grad-step`, `--grad-page`, `--edge`, `--edge-bright`.
- **Radius scale pulled in** (nothing above 16): `rounded-xl` 10px, `rounded-2xl` 12px, `rounded-3xl` 16px, `rounded-card` 12px, new `rounded-hero` 16px; `rounded-rail` 10px.
- **Materials.** `glass` is now real glass: translucent fill, `backdrop-filter: blur(20px) saturate(120%)`, a lit 1px translucent-white hairline (`::before`, brighter top-left) and a soft inner highlight; it lives in the components layer, so any utility on the same element wins (`sticky`, `rounded-*`, `bg-*`). New: `glass-hero` (sign-in/onboarding/dialog glass; tint via `[--hero-fill:…]`), `lit-edge` / `lit-edge-bright` (the hairline alone), `card-solid` (opaque `#27272B`, My attendance, in-app forms), `card-table` (the Assign-to-me surface), `edge-stroke` (a gradient hairline from `[--stroke:…]`), `edge-selected` (3px white-to-orchid stroke), `bg-grad-button-alt`, `bg-grad-page`, `bg-surface-table`. Shadows are gone from cards (`--shadow-card` is an inset highlight only).
- **Motion.** The brand mesh drifts (`bg-grad-brand` and the new `BrandMesh`: blobs on 38/46/52s loops, transform only), primary buttons drift ±6% over 9s with one light sweep on hover, the workday fill has a 7s sheen, the app glow wanders over 40s, ribbons float 14/17s; charts draw once on mount. Keyframes: `mesh-shift`, `button-drift`, `blob-a/b/c`, `breathe`, `glow-wander`, `ribbon-float(-b)`, `sheen`, `draw-line`, `reveal-x`. `animate-float` now means the subtle ribbon float. All stop under reduced motion (OS or `data-motion="reduce"`).
- **Icons**: lucide's default 2px stroke is thinned to 1.5px globally (explicit `strokeWidth` props are untouched).
- **Logo** (`@/components/ui/logo`): `Logo` and `BurstMark` render the brand-kit vectors in `public/brand/` (`flowbit-logo-gradient.svg`, `flowbit-logo-white.svg`, `flowbit-mark-gradient.svg`, `flowbit-mark.svg`); new prop `variant: 'gradient' | 'white'`; `size` = rendered height; `textClassName` is accepted and ignored (deprecated). New `ArcMark` (the Arc assistant mark). App icon: `src/app/icon.svg` (mesh tile, white mark without the centre dot). `FLOWBIT_MARK_PNG` (`@/lib/pdf/base`) puts the mark on Flowbit-issued PDFs.
- **Primitives** (same props): `Button` adds `variant="violet"` (solid "Add Member"); `secondary` (the default) is the `#171717` pill with a translucent hairline; `lg` is 46px. Inputs: translucent fill + white 18% hairline, orchid focus ring; `FormField` labels are 14/500 white with a red `*`. `Badge`/`StatusPill` are filled pills (Figma "In progress"); new `TONE_TEXT` export. `PriorityLabel` uses the Figma signal-bars icon and colours. `Card` adds `variant: 'glass' | 'solid' | 'table'`. `SectionLabel` is 13–14/600 white uppercase. `StatCard` is the Figma card (label, count, accent-filled ±% pill over a glowing sparkline with an end marker, corner wash); `icon` is accepted but not drawn. `Progress` adds `size="lg"` (42px, label inside) and `md` is 16px; `SegmentedBar` is 48px (`size: 'md' | 'lg'`), with ticks and % above, and segments take an optional exact `color`. `MonthCalendar` draws 34 x 22 status-filled day pills, now **Sunday-first by default** (`weekStartsOn={1}` for Monday), and adds `hideHeader`. `Swatch` is the Figma 12px legend key (`shape: 'square' | 'round'`). `Tabs`/`LinkTabs`/`Segmented` are the Figma segmented control (`#171717` track, `#313131` active). `ChipGroup` selected = `#56397D`. `RadioCards` = Figma option cards with the "Selected" tab. `Dialog` = hero glass over a 55% scrim; menus, popovers, selects and tooltips are `#1F1F1F` with a white 12% border, radius 10, 36px items. `EmptyState` = a plain 32px outline icon, one sentence, one line, one action. `DataTable` sits on the `card-table` surface with a ruled header row. `Avatar` initials use muted fills; stacks have the white 1.5px ring.
- **New components**: `BrandMesh` (`@/components/ui/brand-mesh`, server-safe, the animated brand mesh as a container), `GlossyClock` (`@/components/shell/glossy-clock`).
- **Charts**: `Sparkline` adds `marker` (end-marker index) and `draw` (reveal on mount, default true); `area` now defaults to false. `RingChart` defaults to the Figma geometry (186px, 15/14/13px strokes, `#505050` tracks, butt caps) and draws on mount.
- **Shell** (layout only; `useShell()` unchanged): the Figma frame. Flowbit lockup top-left in a 89px logo row; 93px gradient rail abutting a 274px hairline-divided side panel (workspace row, search pill, sections, then the check-in card right under them); an outlined main panel with a 68px top bar; on md+ the content scrolls inside `<main id="main">` (not the window), so `sticky top-0` sticks under the top bar. Content padding is 28px left, 33px right (the shell adds it; pages still add none). The workspace logo and name moved from the top bar to the side panel's workspace row. Notification count is a numeral beside the bell, never a dot. The check-in card has the glossy clock (green in, amber on break, grey out) with real-time hands.
- **Auth and onboarding** rebuilt to the Figma frames: animated mesh half, glass card with the elbow ribbons, gradient Sign in, Google pill with the multicolour stroke, mobile hero; onboarding glass card on the mauve glow with the vertical "workspace" word, step bars, chips, invite row (role per invitee), option cards with the "Best for" band.

## 0. Changes in patch 1 (1 Oct 2026)

Everything below is additive; nothing documented earlier was removed or renamed. Typechecked and `npx vitest run` green (11 files, 75 tests).

- **New pages in `PAGES`** (build them): Folio `/app/folio/receipts/[id]`, `/app/folio/recurring/plans/new`, `/app/folio/recurring/plans/[id]`, `/app/folio/credit-notes/new`, `/app/folio/credit-notes/[id]`, `/app/folio/ledger` (index), `/app/folio/collections`; Muster `/app/hr/reports/gratuity`. Folio side panel gained a **Money in** section (Collections, Ledgers). Two page perms changed: `/app/hr/people/import` now needs `people.import`, `/app/hr/claims` needs `claims.read`. Full list in §10.
- **New permissions**: Muster `people.read_all`, `people.read_team`, `people.read_sensitive`, `people.import`, `attendance.lock`, `approvals.escalated`, `claims.read`, `payroll.lock`, `payroll.unlock`, `letters.templates`; Orbit `orbit.view_all`, `orbit.close`; Folio `collections.write`. Role grants in §10. `people.salary` now means "edit salary structures" (= the Muster spec's `salary.write`); `payroll.read` is the switch that exposes pay.
- **Models** (§4): `Org.subscription` gains `quantities, currentPeriodStart, amountPaise, cancelAtPeriodEnd, canceledAt, pastDueSince, endedAt, pendingChange, razorpayPlanId, pendingCheckout, billing, manual`; `Org.disabledAt/disabledBy/disabledReason/deletedAt`; `User.prefs.motion`; `Notification.event` + `dedupeKey` (unique partial index); `AuditLog.actorMemberId/actorRole/ip/userAgent/platform` + indexes; `Outbox.cc/kind/entity/entityId`, attachment `mime/fileId`; `Invite.name/title/employeeId/sentAt/sendCount`. `Session.createdAt` (timestamps) and `lastSeenAt` are documented and refreshed every 5 minutes.
- **Access** (§6 `@/lib/plans`): `effectiveStatus`, `accessLevel`, `PAST_DUE_GRACE_DAYS` (7), `readOnlyMessage`, `READ_ONLY_SUBSCRIPTION_MESSAGE`. `accessState` now follows the platform spec state machine: an `active` plan past `currentPeriodEnd` is past due (7 days full, then 30 read-only, then blocked); deleted orgs are blocked. Read-only refusals say "trial" or "subscription" by reason.
- **New lib modules**: `@/lib/platform` (`requirePlatformAdmin`, `platformDb`, `platformAction`, `elevated`, `getPlatformCtx`), `@/lib/billing` (`quoteSelection`, `subscriptionInvoiceTotals`, `supplyTypeFor`, `prorate`, `addPeriod`, `capacity`), `@/lib/india-states` (the one state table, re-exported from `@/lib/validation`), `@/lib/audit-diff` (`diff`, `maskAccount`), `@/lib/request` (`requestIp`, `requestUserAgent`).
- **Changed helpers** (backwards compatible): `audit()` records actor member/role, IP and user agent and accepts `changes: { before, after }`; `auditAsPlatform()`; `notify()` takes `event` and `dedupeKey` and returns the number created; `notifyPermission()` / `userIdsWithPermission()`; `sendMail()` takes `kind`, `entity`, `entityId`, `cc`, attachment `mime`/`fileId`; `ctx.db(...).create/insertMany/deleteOne/deleteMany/countDocuments` accept `{ session }` and refuse a document carrying another org's `orgId`; `PdfDocument` takes `issuer` and `watermark`; `nextSeq(PLATFORM_ORG_ID, key)`; `RATE_LIMITS` + `assertRateLimit`; `dates`: `WEEKDAY_SHORT`, `DEFAULT_WORK_WEEK`, `formatWorkWeek`, `dayBoundsIST`; `env`: `RAZORPAY_WEBHOOK_SECRET`, `FLOWBIT_*`, `SUPPORT_EMAIL`, `flowbitSupplier()`, `razorpayMode()`, `isRazorpayWebhookConfigured()`; `setMotionPrefAction`; `files`: SVG no longer accepted, scriptable types always download, avatars render across shared workspaces.
- **Auth**: every sign-in path (password, Google, reset) promotes `PLATFORM_ADMIN_EMAILS` users to `isPlatformAdmin` (never demotes). Rate limits now cover login, signup, forgot password, reset, invite accept; `assertRateLimit('passwordChange', userId)` and `'contact'` are ready for settings/marketing. Accepting an invite audits `member.joined`, notifies the inviter, and copies the invite's `title`/`employeeId` onto the Member.
- **Shell**: the rail and side panel scroll on short viewports (the rail's item list had no `min-h-0`, so HR/Orbit/Folio fell off below ~700 px); `short:` (max-height 760px) and `tiny:` (600px) variants tighten them; the active rail item scrolls into view. A platform-disabled workspace renders a full-page notice instead of the shell. Command palette also finds invoices (by number), leads and deals. `<html data-motion="system|reduce|full">` drives motion.
- **Conventions**: `workWeek` uses JS `getDay()` numbering (0 = Sunday ... 6 = Saturday; default `[1..6]` = Mon–Sat). For a member linked to an employee, `Employee.managerId`/`departmentId` (Muster) are the source of truth; `Member.managerId`/`department` mirror them for people without an employee record.
- **Seed**: `scripts/seed.ts` also runs `src/modules/{settings,subscription,marketing}/seed.ts` (each only when present), after the four products. `.env.example` lists the new variables. Reserved slugs add `c, static, assets, contact, legal, products`.

## 1. Rules that bite

- **Ownership.** Never edit `src/lib/**`, `src/components/{ui,charts,shell}/**`, `src/models/*.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(auth)/**`, `src/app/app/layout.tsx`, `src/proxy.ts`, `scripts/seed.ts`.
- **No heavy commands** during the parallel phase: no `npm install`, `next dev/build`, whole-project `tsc`, browsers. `npx vitest run src/modules/<you>/...` is fine. All packages you may need are already installed (see §12).
- **Next 16**: `params` and `searchParams` are `Promise`s (`const { id } = await params`). Middleware is `src/proxy.ts`.
- **Server-only modules** (`lib/ctx`, `lib/actions`, `lib/auth/*`, `lib/audit`, `lib/notify`, `lib/mail`, `lib/files`, `lib/attendance`, `lib/search`, `lib/seats`, `lib/platform`, `lib/request`, `components/shell/data`) import `server-only`. Do not import them from client components, tests or seed files.
- **Client components** must take the `ActionResult` type from `@/lib/action-types`, never from `@/lib/actions`.
- Money is **integer paise**. Day fields are **'YYYY-MM-DD' strings** in Asia/Kolkata. Timestamps are `Date`.
- Every query goes through `ctx.db(Model)` (org-scoped). Never query a product model without `orgId`. Cross-org access exists only through `@/lib/platform` (`platformDb`, `elevated`), and only for `/platform`, webhooks and token lookups.
- `workWeek` and `weekday()` use JS `getDay()` numbering: **0 = Sunday ... 6 = Saturday**.

## 2. Layout

```
src/
  proxy.ts                         cookie gate for /app, /platform, /onboarding
  app/layout.tsx                   Work Sans (next/font), dark, sonner Toaster
  app/globals.css                  tokens, @theme, gradients, animations
  app/(auth)/(split)/{login,signup,forgot-password,reset-password/[token],invite/[token]}
  app/(auth)/onboarding            two-step workspace wizard
  app/app/layout.tsx               shell (requireMember + getShellData + <AppShell>)
  app/app/page.tsx                 starter Home — work-a REPLACES it with the Figma dashboard
  app/app/{denied,locked}          redirect targets of requireMember()
  components/shell/disabled-workspace.tsx  full-page notice for Org.disabled
  app/app/{loading,error}.tsx      default skeleton and error boundary for /app
  app/api/auth/google[/callback]   Google OAuth
  app/api/auth/signout             POST sign-out
  app/api/files/[id]               org-checked file streaming
  app/api/notifications/unread     bell polling
  app/api/search                   command palette search
  components/ui/*  components/charts/*  components/shell/*
  lib/*  models/*.ts  (core)
  models/<product>/*.ts            YOUR models
  modules/<product>/*              YOUR actions, queries, domain logic, seed.ts, tests
  components/<product>/*           YOUR components
scripts/seed.ts                    calls modules/<product>/seed.ts, then modules/{settings,subscription,marketing}/seed.ts
```

## 3. Context and auth

### `requireMember(opts?)` — `@/lib/ctx` (pages, layouts)
```ts
requireMember(opts?: {
  perm?: Permission; anyPerm?: Permission[]
  product?: ProductKey; anyProduct?: ProductKey[]
  feature?: FeatureKey            // 'muster.payroll' needs Muster Business
  allowBlocked?: boolean          // only Settings → Subscription
}): Promise<Ctx>
```
Redirects: signed out → `/login`; no workspace → `/onboarding`; product off → `/app/locked?product=`; feature off → `/app/locked?feature=`; missing perm → `/app/denied`; blocked workspace → `/app/settings/subscription`. Soft-deleted workspaces (`Org.deletedAt`) are skipped as if the membership did not exist. A platform-disabled workspace (`Org.disabled`) is blocked, and `app/app/layout.tsx` renders a full-page "disabled by Flowbit" notice (reason + `SUPPORT_EMAIL` + sign out) instead of the shell.
```ts
const ctx = await requireMember({ product: 'folio', perm: 'folio.read' })
```

### `getCtx()` — same fields, returns `null` instead of redirecting (route handlers).

### `Ctx`
| Field | Type | Notes |
|---|---|---|
| `user` | lean User | `name, email, prefs, isPlatformAdmin, …` |
| `session` | lean Session | |
| `org` | lean Org | `name, slug, officeHours, workWeek, subscription, enabledProducts, address, gstin, state` |
| `member` | lean Member | `role, title, department, managerId, employeeId` |
| `userId`, `orgId`, `memberId` | `Types.ObjectId` | |
| `role` / `roleLabel` | `string` | built-in key or custom role id / human label |
| `permissions` | `ReadonlySet<Permission>` | |
| `access` | `'full' \| 'read_only' \| 'blocked'` | trial/plan state |
| `readOnly` | `boolean` | `access !== 'full'`; `assertWritable()` throws `readOnlyMessage(org)` (trial or subscription wording) |
| `isOwner` | `boolean` | |
| `can(perm)` / `canAny(...perms)` | `boolean` | hide buttons with these |
| `assert(perm, message?)` | throws `ForbiddenError` | use in actions and sensitive reads |
| `has(product)` | `boolean` | entitled AND enabled |
| `hasFeature(key)` | `boolean` | e.g. `ctx.hasFeature('muster.payroll')` |
| `assertProduct(product)` | throws | |
| `assertWritable()` | throws `ReadOnlyError` | `action()` calls it for you |
| `db(Model)` | `Scoped<M>` | see below |

### `ctx.db(Model)` — `@/lib/db/scoped`
`find, findOne, findById, countDocuments, exists, distinct, create, insertMany, updateOne, updateMany, findOneAndUpdate (returns new doc by default), deleteOne, deleteMany, aggregate` — all inject `orgId`; `aggregate` prepends `{ $match: { orgId } }`. Also `.model` (the raw model) and `.orgId`.
```ts
const Tasks = ctx.db(Task)
const rows = await Tasks.find({ status: 'todo' }).sort({ order: 1 }).lean()   // typed lean docs
const one = await Tasks.findById(id).lean()                                    // null if not in this org
await Tasks.create({ title, creatorId: ctx.memberId, assigneeIds: [] })
await Tasks.updateOne({ _id: id }, { $set: { status: 'done' } })
const byStatus = await Tasks.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }])
```
`create`/`insertMany` accept plain arrays for subdocument arrays and ObjectId or string ids (`CreateInput<T>`). `RawOf<typeof Task>` gives the raw document type.

Transactions: `create(doc, { session })`, `insertMany(docs, { session })`, `deleteOne/deleteMany(filter, { session })`, `countDocuments(filter, { session })`; `find/findOne/findById/findOneAndUpdate/updateOne/updateMany` already take Mongoose options (pass `{ session }`). A document that already carries a different `orgId` throws `cross-tenant write blocked`. `$lookup`/`$unionWith` sub-pipelines are **not** scoped: add `{ $match: { orgId } }` inside them yourself, and never use `populate()` on org data.

### Sessions and auth helpers — `@/lib/auth/*` (server-only)
| Export | Signature |
|---|---|
| `getSession()` | `() => Promise<{ user, session } \| null>` (React-cached) |
| `requireUser()` | redirects to `/login` |
| `createSession(userId, activeOrgId?)` | sets the `fb_session` cookie (actions/route handlers only) |
| `destroySession()` / `destroyOtherSessions(userId, keepCurrent = true)` | sign out / sign out other devices |
| `setActiveOrg(orgId)` | switch workspace |
| `hashPassword(plain)` / `verifyPassword(plain, hash)` / `passwordSchema` | bcrypt cost 12; zod rule: 8+ chars, a letter and a number |
| `createInvite(ctx, { email, role, name?, title?, employeeId? })` | creates/links User (named `name` if new), adds `invited` Member, stores `sentAt`/`sendCount`, emails `/invite/<token>` (Outbox kind `invite`), audits `member.invited` |
| `resendInvite(ctx, memberId)` | fresh link for a pending invite |
| `findInvite(token)` / `acceptInvite(token, userId)` | accept activates the Member, copies the invite's `title`/`employeeId`, audits `member.joined` and notifies the inviter (event `member.joined`) |
| `requestPasswordReset(email)` / `resetPassword(token, password)` | |
| `isSlugAvailable(slug)` / `suggestSlug(base)` / `createWorkspace(ownerId, input)` | `@/lib/workspace` (not server-only) |

Auth server actions (`@/lib/auth/actions`): `loginAction`, `signupAction`, `forgotPasswordAction`, `resetPasswordAction`, `acceptInviteAction`, `createWorkspaceAction`, `checkSlugAction(slug)`, `signOutAction()`.

Session cookie `fb_session` (httpOnly, 30 days, sliding). `Session.createdAt` = signed in; `Session.lastSeenAt` and `expiresAt` are refreshed at most every 5 minutes (use `lastSeenAt` for "last active"). `createSession()` promotes `PLATFORM_ADMIN_EMAILS` users to `isPlatformAdmin` on **every** sign-in (password login, signup, Google, reset); it never demotes. The seed owner `sanskaar@vistaarsws.com` has it.

Rate limits (`@/lib/rate-limit` `RATE_LIMITS`, per process, keyed by IP and email/user): login 8 / 15 min, signup 10 / 15 min, forgot password 3 / 15 min, reset 5 / 15 min, invite accept 10 / 15 min, password change 5 / 15 min, contact 5 / hour. The auth actions apply them; settings and marketing call `assertRateLimit('passwordChange', String(ctx.userId))` / `assertRateLimit('contact', ip)` (throws `UserError` "Too many attempts. Try again in N minutes.").

## 4. Models

### Core models (`@/models/<Name>` or `@/models`)
`User, Session, Org, Member, Role, Invite, PasswordReset, AuditLog, Notification, Outbox, StoredFile, Counter, Client, AttendanceDay` — fields exactly as SPEC §4, plus:
- `User.prefs.reducedMotion` (legacy boolean, kept in sync), `User.prefs.motion: 'system' | 'reduce' | 'full'` (default `'system'`), `User.lastOrgId`, `User.phone`
- `Org.officeHours.graceMinutes` (default 15); `Org.workWeek` in getDay numbering (0 = Sun; default `[1,2,3,4,5,6]` = Mon–Sat)
- `Org.disabled` (boolean, platform) plus `disabledAt`, `disabledBy` (User), `disabledReason`; `Org.deletedAt` (owner soft delete; requireMember skips the org)
- `Org.subscription` (SPEC fields plus): `quantities { work, muster, orbit }` (custom-plan billed quantities, default 0; Folio is flat), `currentPeriodStart`, `currentPeriodEnd` (exclusive), `amountPaise` (per period ex-GST, frozen at purchase), `cancelAtPeriodEnd`, `canceledAt`, `pastDueSince`, `endedAt`, `pendingChange { plan, products, quantities, seats, cycle, amountPaise, effectiveAt, requestedBy }`, `razorpaySubscriptionId`, `razorpayPlanId`, `pendingCheckout` (Mixed: `{ razorpaySubscriptionId, razorpayPlanId, selection, amountPaise, totalPaise, createdAt }`), `billing { legalName, gstin, email, phone, address { line1, line2, city, stateCode, pincode } }`, `manual { note, setBy, setAt }`. Always read status through `effectiveStatus()` (§6), never the stored `status` alone.
- `Session`: `tokenHash, userId, activeOrgId, expiresAt, userAgent, lastSeenAt, createdAt, updatedAt`
- `Client.sector`; `Client.contacts[]` keep their `_id` (Orbit edits contacts by id)
- `AttendanceDay.note`
- `Notification.product`, `Notification.event` ('<area>.<event>', e.g. `task.assigned`), `Notification.dedupeKey` (unique per `{ orgId, userId, dedupeKey }` via a partial index; set it through `notify({ dedupeKey })`)
- `AuditLog`: `actorId` (User; the spec's `actorUserId`), `actorMemberId`, `actorName`, `actorRole` (snapshots), `action`, `entity`, `entityId` (string), `summary`, `product`, `meta { before?, after?, reason?, ... }`, `ip`, `userAgent`, `platform` (true for Flowbit staff/system rows), `createdAt`. Indexes `{orgId, createdAt}`, `{orgId, action, createdAt}`, `{orgId, actorId, createdAt}`, `{orgId, entity, entityId, createdAt}`. Append-only: never update or delete rows.
- `Outbox`: `orgId?, to[], cc[], subject, html, text, attachments[{ filename, mime, size, fileId }], provider 'resend'|'outbox'` (`outbox` = no provider, the spec's `none`), `status 'queued'|'sent'|'failed'|'logged', providerId` (Resend id), `error, kind, entity, entityId`. Kinds: `invite, password_reset, security, subscription, subscription_invoice, invoice, quote, statement, payslip, letter, claim_otp, reminder, contact, other`.
- `Invite`: `memberId`, `revokedAt`, `name`, `title`, `employeeId` (linked on accept), `sentAt`, `sendCount`. No TTL index: expired invites stay listable.
- Constants: `SUBSCRIPTION_STATUSES`, `ORG_PLANS`, `BILLING_CYCLES` (Org), `MOTION_PREFS` (User), `MEMBER_STATUSES`, `NOTIFICATION_KINDS`, `CLIENT_STATUSES`, `CLIENT_KINDS`, `PUNCH_TYPES`, `ATTENDANCE_STATUSES`.
- Flowbit's own subscription models (`SubscriptionInvoice`, `BillingEvent`) belong to the settings agent under `src/models/subscription/` (not core).

Member display names live on `User` (`Member.userId → User.name/email`). To show people:
```ts
const members = await ctx.db(Member).find({ status: 'active' }).lean()
const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, email: 1 }).lean()
```
(`User` is global, not org-scoped; only look up users you reached through Members of `ctx.orgId`.)

### Writing a product model
```ts
// src/models/work/Task.ts
import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked', 'done'] as const

const TaskSchema = new Schema(
  {
    ...tenantFields,                                   // orgId (required, indexed) — typed
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
    dueDate: { type: String },                         // 'YYYY-MM-DD'
  },
  { timestamps: true },                                // createdAt/updatedAt typed
)
TaskSchema.plugin(tenant)
TaskSchema.index({ orgId: 1, status: 1, order: 1 })

export const Task = defineModel('Task', TaskSchema)
```
`defineModel(name, schema)` registers once (safe across dev reloads) and infers types from the schema. Collection names are Mongoose plurals (`Task` → `tasks`).

## 5. Server actions

### `action(schema, fn, opts?)` — `@/lib/actions`
```ts
action<S extends z.ZodType, O = void>(
  schema: S,
  fn: (input: z.output<S>, ctx: Ctx) => Promise<ActionResult<O>>,
  opts?: { perm?: Permission; anyPerm?: Permission[]; product?: ProductKey; feature?: FeatureKey; allowReadOnly?: boolean },
): (input: FormData | z.input<S>) => Promise<ActionResult<O>>
```
Order: session → product → feature → perm → read-only → zod parse → `fn`. Catches `ZodError` (field errors), `UserError`/`ForbiddenError`/`NotFoundError`/`ReadOnlyError` (their message), anything else (logged, generic message). `redirect()`/`notFound()` pass through.

`publicAction(schema, fn)` — same without a member (auth flows). `platformAction(schema, fn)` (in `@/lib/platform`) — same for Flowbit staff (§6). Building blocks also exported: `actionInput(input)` (FormData → object), `toResultError(error, scope)`, `fieldErrorsFrom(zodError)`.

Read-only: `action()` refuses writes unless `allowReadOnly: true`. Mark as `allowReadOnly` only: subscription/checkout/billing-details actions, profile, password, sessions, appearance prefs, marking notifications read, sign out and workspace switching.

```ts
export type ActionResult<T = void> =
  | { ok: true; message?: string; data?: T; redirect?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
ok(message?, data?, redirect?)      // ok('Client added', { id }, `/app/clients/${id}`)
fail(error, fieldErrors?)           // fail('Name is taken', { name: 'Already used' })
```

FormData → object rules (`formDataToObject`): blank strings become `undefined`; repeated keys or keys ending in `[]` become arrays; dotted keys nest (`address.city`, `lines.0.qty`); `File`s are kept (empty file inputs become `undefined`).

Errors (`@/lib/errors`): `UserError(message, fieldErrors?)`, `ForbiddenError(message?)`, `NotFoundError(what?)` → "Task was not found…", `ReadOnlyError(message)`.

A `'use server'` file may only export async functions, so define actions as `export const x = action(...)` and keep types/constants elsewhere.

### Core actions — `@/lib/core-actions`
`punchAction({ type: 'in'|'break_start'|'break_end'|'out', note? })` → `ActionResult<TodayState>`; `setSoundPrefAction({ sound })`; `setMotionPrefAction({ motion: 'system'|'reduce'|'full' })` (Settings → Appearance; keeps `reducedMotion` in sync); `setReducedMotionAction({ reducedMotion })` (legacy); `switchOrgAction(orgId)`; `markNotificationReadAction({ id })`; `markAllNotificationsReadAction({})`.

## 6. lib reference

### `@/lib/catalog` (client-safe)
`PRODUCT_KEYS`, `ProductKey` (`'work'|'muster'|'orbit'|'folio'`), `AreaKey`, `PRODUCTS: Record<ProductKey, ProductDef>` (`name, shortName, slug, tagline, description, accent, accentVar, icon, home, features[]`), `featureByKey(key)`, `PERMISSION_DEFS`, `Permission`, `ALL_PERMISSIONS`, `permissionsOf(area)`, `isPermission(s)`, `PAGES: PageDef[]` (`href, title, area, products?, perm?, feature?, owner`), `findPage(pathname)`, `breadcrumbFor(pathname): Crumb[]`, `RAIL_TOP`, `RAIL_BOTTOM`, `railItemActive`, `SIDE_PANELS`, `panelFor(pathname)`, `IconName`, `ICON_NAMES`.
```ts
<PageHeader title="Invoices" breadcrumb={breadcrumbFor('/app/folio/invoices')} />
```

### `@/lib/permissions` (client-safe)
`BUILTIN_ROLE_KEYS`, `RoleKey`, `BUILTIN_ROLES: Record<RoleKey, { key, label, description, permissions }>`, `isBuiltInRole(role)`, `resolvePermissions(role, customRoles?) → Set<Permission>`, `roleLabel(role, customRoles?)`, `builtInRoleDocs()`.

### `@/lib/plans` (client-safe; pricing page and checkout)
| Export | Notes |
|---|---|
| `TRIAL_DAYS` 15, `READ_ONLY_DAYS` 30, `GST_PERCENT` 18, `YEARLY_MONTHS` 10 | |
| `PLAN_PRICES: Record<PlanKey, { key, label, unit, monthlyPaise, minimum, flat?, note }>` | keys `work, muster_starter, muster_business, orbit, folio, suite` |
| `quote(selection: PlanSelection): Quote` | `{ lines[{key,label,unit,quantity,unitPaise,amountPaise}], subtotalPaise, gstPaise, totalPaise, cycle, perMonthPaise }`; applies minimums, Folio flat, yearly = 10× |
| `PlanSelection` | `{ suite, work, muster: 'starter'\|'business'\|null, orbit, folio, seats, orbitSeats?, cycle }` |
| `suiteSavings(seats, cycle)` | paise saved vs buying all four |
| `gstOn(paise)` | 18% rounded |
| `newTrialSubscription(now?)` | |
| `isTrial(org)`, `trialDaysLeft(org, now?)`, `readOnlyDaysLeft(org, now?)` | |
| `accessState(org, now?)` | `'full'\|'read_only'\|'blocked'` |
| `READ_ONLY_MESSAGE` | "Your trial has ended — choose a plan to keep editing" |
| `musterTier(org)`, `entitled(org, p)`, `enabled(org, p)`, `has(org, p)`, `activeProducts(org)`, `hasFeature(org, key)`, `seatLimit(org)` | |
| `effectiveStatus(sub, now?)` | `{ status, since? }` derived from stored dates: trialing past `trialEndsAt` → `expired`; active past `currentPeriodEnd` → `past_due`; canceled past period end → `expired` |
| `accessLevel(sub, now?)` | full (trialing, active, canceled in period, past due within `PAST_DUE_GRACE_DAYS` = 7) → read_only for `READ_ONLY_DAYS` (30) → blocked. `accessState(org)` = `accessLevel(org.subscription)`, blocked when `org.disabled` or `org.deletedAt` |
| `readOnlyMessage(org)` | `READ_ONLY_MESSAGE` (trial) or `READ_ONLY_SUBSCRIPTION_MESSAGE` ("Your subscription has ended — choose a plan to keep editing") |
| `readOnlyDaysLeft(org, now?)` | days of read-only left (counts from the end of the past-due grace) |
```ts
const q = quote({ suite: true, work: false, muster: null, orbit: false, folio: false, seats: 20, cycle: 'yearly' })
formatINR(q.totalPaise)
```
`countSeats(orgId)` is in `@/lib/seats` (server-only): active + invited members.

### `@/lib/billing` (client-safe; Flowbit's own subscription maths, platform spec 6.3–6.12)
| Export | Notes |
|---|---|
| `quoteSelection(selection, cycle, { persons? })` | `Selection = { plan: 'suite', seats } \| { plan: 'custom', work?, muster?: { tier, employees }, orbit?, folio? }` → `{ lines[{ key, label, quantity, requested, minimumApplied, unitPaise, amountPaise }], monthlySubtotalPaise, periodAmountPaise, cycle, months, yearlySavingsPaise, suiteComparisonPaise? }` (Suite hint only when Suite ≤ custom). Asserts every worked example in the spec |
| `isEmptySelection(s)` | custom with nothing picked |
| `subscriptionInvoiceTotals(lines, supplyType)` | 18% per line; intra-state CGST = SGST levelled to the smaller half; total rounded to the rupee once → `{ lines, taxableValuePaise, cgstPaise, sgstPaise, igstPaise, taxPaise, roundOffPaise, totalPaise }` |
| `supplyTypeFor(supplierState2, customerState2)` | `'intra_state'` only when both known and equal |
| `addPeriod(date, cycle)` | +1 / +12 months, day clamped (31 Jan → 28 Feb) |
| `prorate({ oldAmountPaise, newAmountPaise, periodStart, periodEnd, now? })` | IST days → `{ remainingDays, totalDays, amountPaise }` |
| `capacity(sub, usage, now?)` | `Usage = { members, pendingInvites, employees, orbitUsers, folioUsers, persons }` → rows `{ key, label, used, limit (null = unlimited), ok }`; trial unlimited, Suite = persons vs seats, custom per product (Folio 3 users = `FOLIO_INCLUDED_USERS`). Counting `usage` needs Muster's on-payroll predicate, so the settings agent writes `usage(ctx)` |
```ts
const q = quoteSelection({ plan: 'suite', seats: 12 }, 'monthly')
const t = subscriptionInvoiceTotals(q.lines, supplyTypeFor(flowbitSupplier().stateCode2, billing.address.stateCode))   // ₹2,110.00
```

### `@/lib/platform` (server-only; cross-tenant access)
| Export | Use |
|---|---|
| `requirePlatformAdmin()` | `/platform` layouts/pages: signed out → `/login?next=/platform`; not `isPlatformAdmin` → `notFound()` |
| `getPlatformCtx()` | route handlers: `PlatformCtx` or null |
| `platformDb(reason)` | throws `ForbiddenError` unless platform admin; returns `PlatformCtx` |
| `platformAction(schema, fn(input, pctx))` | server action for `/platform` (admin asserted; ignores workspace read-only) |
| `elevated(reason, fn(db))` | system flows with no member (Razorpay webhook, token lookups); logs the reason |
`PlatformCtx = { user, session, userId, raw(Model) /* unscoped model */, forOrg(orgId).db(Model) /* scoped */, audit(orgId, entry) /* platform: true, 'Flowbit support' */ }`.
```ts
const p = await platformDb('list workspaces')
const orgs = await p.raw(Org).find({}).sort({ createdAt: -1 }).limit(50).lean()
const invoices = await p.forOrg(orgId).db(SubscriptionInvoice).find({}).lean()
await p.audit(orgId, { action: 'platform.trial_extended', entity: 'Subscription', entityId: orgId, summary: 'Trial extended to 30 Oct 2026', meta: { reason } })
```

### `@/lib/audit` · `@/lib/notify` (server-only)
```ts
await audit(ctx, { action: 'invoice.issued', entity: 'Invoice', entityId: inv._id, summary: `Issued ${inv.number} to ${client.name}`, product: 'folio', meta: { totalPaise } })
await audit(ctx, { action: 'employee.updated', entity: 'Employee', entityId: e._id, summary: `Changes saved for ${name}`, product: 'muster', changes: { before: old, after: updated, redactIds: true } })
await notify(ctx, { userIds: billingUserIds, title: 'Your trial ends in 3 days', href: '/app/settings/subscription', kind: 'reminder', event: 'subscription.trial_ending', dedupeKey: 'trial-3d' })
await notifyPermission(ctx, 'billing.manage', { title: 'Subscription active: Suite, 12 people', kind: 'success', event: 'subscription.activated' })
await notify(ctx, { userIds: [userId], title: 'Leave approved', body: '2 days, 20–21 Oct', href: '/app/me/leave', kind: 'approval', product: 'muster' })
await notifyMembers(ctx, task.assigneeIds, { title: `You were assigned "${task.title}"`, href: `/app/work/tasks/${task._id}`, kind: 'assignment' })
await notifyRoles(ctx, ['finance', 'owner'], { title: 'Payroll ready for approval', href: `/app/hr/payroll/${id}`, kind: 'approval' })
```
`notify` skips the actor unless `includeSelf: true` and returns how many were created; with `dedupeKey` each user gets it at most once per org, ever (repeat calls create 0). `event` is the fine-grained `'<area>.<event>'` from the platform spec kinds catalog (10.3); `kind` stays one of `info, assignment, mention, approval, reminder, success, warning, system`. `notifyPermission(ctx, perm, input)` / `userIdsWithPermission(orgId, perm)` reach custom roles too (prefer them over `notifyRoles`). `notify` accepts `{ orgId, userId? }` so system code can call it without a member.

`audit` never throws; it records `actorMemberId`, `actorRole` (when the ctx has them), IP and user agent. `changes: { before, after, redactIds? }` stores only the changed keys in `meta.before`/`meta.after` (create: after only; delete/void: before only; secrets redacted, `*accountNumber` masked to the last 4, `redactIds` hides PAN/UAN/ESIC/Aadhaar). `diff(before, after, opts)` and `maskAccount(n)` are also exported (pure, from `@/lib/audit-diff`). `auditAsPlatform(orgId, { userId?, name? }, entry)` writes `platform: true` rows (default actor "Flowbit support").

### `@/lib/mail` (server-only)
`sendMail({ to, cc?, subject, html, text?, attachments?: { filename, content: Buffer, mime?, fileId? }[], orgId?, kind?, entity?, entityId? }) → { ok, id, provider, error? }` (`kind` is a `MailKind`, default `'other'`; Settings → Email log filters by it) — Resend when `RESEND_API_KEY`, always stored in `Outbox`. `emailLayout({ title, paragraphs: string[], cta?: { label, href }, footer? }) → { html, text }` (branded; `href` may be a path).
```ts
const mail = emailLayout({ title: `Invoice ${inv.number}`, paragraphs: ['Please find the invoice attached.'], cta: { label: 'View invoice', href: `/app/folio/invoices/${id}` } })
await sendMail({ to: client.email, subject: `Invoice ${inv.number}`, ...mail, attachments: [{ filename: `${inv.number}.pdf`, content: pdf, mime: 'application/pdf' }], orgId: ctx.orgId, kind: 'invoice', entity: 'Invoice', entityId: inv._id })
```

### `@/lib/files` (server-only)
`saveFile(ctx, { name, mime, data: Buffer, kind, entity?, entityId? })`, `saveUpload(ctx, file: File | null, { kind, entity?, entityId?, accept?: string[], maxBytes? })` (null when empty; throws `UserError` on size/type), `readStoredFile(orgId, id)` (bytes in memory), `findStoredFile(orgId, id)` (record only), `streamStoredFile(file)`, `deleteStoredFile(orgId, id)`, `fileUrl(id, { download? })` → `/api/files/<id>`, `MAX_UPLOAD_BYTES` (env `MAX_UPLOAD_MB`, default 10; 4 on Vercel), `IMAGE_TYPES` (png, jpeg, webp, gif — **no SVG**), `DOCUMENT_TYPES`, `findSharedAvatar(viewerUserId, id)`. Bytes go through the storage driver (`@/lib/storage`: `storage().put/get/stream/delete/exists`, `STORAGE_DRIVER=local|s3`); never use `fs` for stored files. Route handlers stream with `storedFileResponse(file, { disposition, cacheControl })` from `@/lib/file-response`. Client code shows the cap with `MAX_UPLOAD_LABEL` / `fileTooLargeMessage` from `@/lib/upload-limit` (client-safe). Server actions accept bodies up to the cap + 1 MB. `/api/files/[id]` always downloads scriptable types (SVG, HTML, XML) and serves `kind: 'avatar'` files to anyone who shares an active workspace with the uploader (so a profile photo works in every workspace).
```ts
const file = await saveUpload(ctx, input.receipt as File | undefined, { kind: 'receipt', entity: 'Claim', entityId: claim._id, accept: DOCUMENT_TYPES })
```
In zod use `z.instanceof(File).optional()` for file fields.

### `@/lib/sequence`
`nextSeq(orgId, key, session?) → Promise<number>` (atomic, starts at 1), `peekSeq(orgId, key)`, `bumpSeq(orgId, key, value)`, `formatSeq(n, { prefix?, suffix?, pad? })`, `prefixFrom(name, max = 3)`, `PLATFORM_ORG_ID` (fixed ObjectId `000000000000000000f10b17` for series spanning all workspaces, e.g. `nextSeq(PLATFORM_ORG_ID, 'fb-invoice:2026-27', session)` → `FB/2026-27/0001`; no Org has this id).
```ts
const n = await nextSeq(ctx.orgId, `invoice:${entityId}:${fiscalYear(issueDate)}`)
const number = formatSeq(n, { prefix: 'INV/', suffix: `/${fiscalYear(issueDate)}`, pad: 3 })   // INV/012/2026-27
```

### `@/lib/money` (client-safe)
`rupeesToPaise(rupees | '1,234.50')`, `paiseToRupees(p)`, `formatINR(p, { decimals?: 0 | 2 })` → `₹1,23,456.78`, `formatINRCompact(p)` → `₹3.4L`, `formatNumber(n, decimals?)`, `pct(part, whole)`, `splitPaise(total, percents[])`, `amountInWords(p)` → "Rupees One Lakh … Only".

### `@/lib/dates` (client-safe; IST)
`TIMEZONE`, `WEEKDAY_SHORT` (index = getDay), `DEFAULT_WORK_WEEK` (`[1..6]`), `formatWorkWeek([1..6])` → "Mon–Sat", `dayBoundsIST(iso) → { start, end }` (IST midnight instants, end exclusive), `todayIST()`, `isoDateIST(date)`, `minutesOfDayIST(date)`, `istInstant('2026-10-01', '10:00') → Date`, `parseHHMM`, `addDays(iso, n)`, `weekday(iso)` (0 = Sun), `daysBetween(a, b)`, `formatDate(iso|Date, { withWeekday?, short? })` → "20 Jul 2026", `formatDateTime`, `formatTime` → "3:45 pm", `formatDuration(min)` → "2h 53m", `timeAgo(date)`, `monthRange('2026-10') → { start, end, days }`, `monthOf(iso?)`, `shiftMonth(month, ±n)`, `formatMonth(month)` → "October 2026", `eachDay(from, to)`, `workingDaysBetween(from, to, workWeek?, holidays?)`, `fiscalYear(date)` → '2026-27', `greeting(date?)`, `startOfWeek(iso)`.

### `@/lib/validation` (zod helpers)
`objectId`, `isoDate`, `isoMonth`, `hhmm`, `paise` (rupees in → paise out), `paiseInt`, `email`, `phone`, `gstin`, `pan`, `ifsc`, `pincode` (6 digits, not starting with 0), `slug`, `requiredText(label, max?)`, `optionalText(max?)`, `checkbox` (form 'on'/'true' → boolean), `intField(label, min?, max?)`, `listOf(item)`, `stateCode` (2-letter, from the table), `gstinStateIssue(gstin, code2)` (the "registered in Maharashtra (27), but the state is Madhya Pradesh (23)" message, or null).

**The one Indian state table** (`@/lib/india-states`, pure, re-exported here; use it everywhere — Orbit and Folio must not keep their own): `INDIA_STATES: { code2, gstCode, name, isUT }[]` (36 states/UTs + `OT` 97 Other Territory; codes `UK` Uttarakhand, `OD` Odisha, `CG`, `TS`, `DN` 26), `stateByCode2('MP')`, `stateByGstCode('23')`, `stateOfGstin(gstin)`, `gstinMatchesState(gstin, 'MP')`, `stateLabel('MP')` → "Madhya Pradesh (23)", `STATE_OPTIONS` (Select options, OT excluded). Records store `code2`; GST maths uses `gstCode`. `INDIAN_STATES` (`{ MP: { name, gst: '23', isUT } }`) stays for old callers. Client components should import from `@/lib/india-states` (no mongoose).
```ts
const schema = z.object({ name: requiredText('Name'), email: email.optional(), gstin: gstin.optional(), amount: paise, dueDate: isoDate, clientId: objectId, urgent: checkbox })
```

### `@/lib/serialize`
`plain(doc)` (ObjectId → string, Date → ISO; typed `Plain<T>`) for passing to client components; `idOf(x)`; `oid(string) → ObjectId`.

### `@/lib/list` (client-safe)
`parseListParams(sp, { pageSize?, sort?, dir? }) → { page, pageSize, skip, q, sort, dir, get(key), raw }`, `mongoSort(params, fallback?)`, `buildHref(basePath, current, patch)`, `totalPages(total, size)`, `first(value)`, `SearchParams` type.

### `@/lib/status` (client-safe)
`statusTone(status) → Tone`, `statusLabel('in_progress')` → "In progress", `TONE_COLOR[tone]` (CSS var for charts), `Tone` = `success|warning|danger|info|pink|orange|violet|orchid|neutral`. The map already covers task, priority, project, approval, attendance, invoice, CRM, member, payroll, subscription and letter statuses.

### `@/lib/attendance` (server-only) · `@/lib/attendance-core` (pure)
Core: `computeDay({ punches, status? }, officeHours?, now?) → { status, workedMinutes, breakMinutes, firstIn, lastOut, state, stateSince, late }`, `allowedPunches(state)`, `dayProgress(officeHours, now?)` (0..1 for the workday timeline), `DEFAULT_OFFICE_HOURS`, types `Punch, PunchType, PunchState, AttendanceStatus, OfficeHours, DayResult, TodayState`.
Server: `todayState(ctx) → TodayState`, `punch(ctx, type, note?)`, `officeHoursOf(ctx)`. Rules: late = first in after start + grace (15 min); half day = checked out with less than `halfDayHours`; leave/holiday/weekoff/on_duty are preserved; locked days refuse punches.

### `@/lib/search` (server-only)
`searchWorkspace(ctx, q) → SearchHit[]` — clients, people, plus the `tasks` (`title`, `key`) and `projects` (`name`, `code`) collections when Work exists. Hrefs: `/app/work/tasks/<id>`, `/app/work/projects/<id>`, `/app/clients/<id>`.

### `@/lib/sound` · `@/lib/toast` (client)
`play('click'|'toggle'|'success'|'error'|'notify'|'pop'|'whoosh')`, `useSoundPref() → [on, setOn]`, `isSoundOn()`, `setSoundLocal(on)`.
`toast.success(msg)` (plays success), `toast.error(msg)` (error), `toast.info(msg)` (pop), `toast.message(msg)` (silent), `toast.promise`, `toast.dismiss`. `Button` already plays `click`; dialogs/menus play `pop`; chips/switches/tabs play `toggle`; `ActionForm`/`useAction` toast with sound.

### `@/lib/pdf/base` (server)
`PdfDocument({ org: { name, addressLines?, gstin?, pan?, email?, phone?, logoSrc? }, issuer?: PdfOrg, watermark?: string, title, subtitle?, meta?: {label,value}[], footerNote?, documentTitle?, size?, children })` — `issuer` replaces the letterhead (Flowbit on subscription invoices via `flowbitSupplier()`, a Folio entity on invoices); `watermark` prints large diagonal text ('DRAFT', 'CANCELLED', 'TEST'), `PdfSection({ label?, children })`, `PdfTable({ columns: { key, header, width: '40%' | flexNumber, align? }[], rows: Record<string,string>[] })`, `PdfKeyValue({ items: { label, value, strong? }[], width? })`, `pdfStyles`, `PDF_COLORS`, `PDF_FONT` ('Work Sans', verified), `renderPdf(element) → Buffer`, `pdfResponse(buffer, filename, inline = true) → Response`. Primitives (`View`, `Text`, `Image`, `StyleSheet`) come from `@react-pdf/renderer`. Use `₹` freely.

### Other
- `@/lib/utils`: `cn(...)`, `initials(name)`, `firstName(name)`, `slugify(s)`, `escapeRegex(s)` (always for user search terms), `pluralize(n, one, many?)`.
- `@/lib/env`: `serverEnv()`, `isGoogleConfigured()`, `isResendConfigured()`, `isRazorpayConfigured()`, `isRazorpayWebhookConfigured()`, `razorpayMode()` (`'live'|'test'|'none'`), `isAnthropicConfigured()`, `platformAdminEmails()`, `appUrl(path)`, `flowbitSupplier()` → `{ legalName, gstin|null, pan|null, address, stateCode2|null, sac, supportEmail }` (from `FLOWBIT_LEGAL_NAME` default "Flowbit Technologies", `FLOWBIT_GSTIN`, `FLOWBIT_PAN`, `FLOWBIT_ADDRESS`, `FLOWBIT_STATE`, `FLOWBIT_SAC` default 998314, `SUPPORT_EMAIL` default support@flowbit.app; GSTIN null → print "not registered" and a DRAFT watermark). Also `RAZORPAY_WEBHOOK_SECRET`.
- `@/lib/db`: `dbConnect()`, `withTransaction(async (session) => …)` (pass `{ session }` to writes), `mongoose`.
- `@/lib/rate-limit`: `await rateLimit(key, limit, windowMs) → { ok, retryAfterSeconds }`, `await clearRateLimit(key)`, `RATE_LIMITS` (§3), `await assertRateLimit(scope, key)` (throws `UserError`), `rateLimitMessage(seconds)`. In-memory first check, then a fixed-window counter in MongoDB (`RateLimit`, TTL) shared by every instance.
- `@/lib/cron`: `cronHandler(job, (db, asOf) => …)` for `GET /api/cron/<job>` (bearer `CRON_SECRET`, one run at a time per job via `CronLock`), `eachOrg(db, job, include, fn)` (per-workspace, failures isolated). Jobs must be idempotent (use `dedupeKey`).
- `@/lib/request` (server-only): `requestIp()`, `requestUserAgent()` (safe outside a request).
- `@/lib/search`: also searches the `invoices` (`number`; `folio.read`), `leads` (`companyName`, `contactName`; `orbit.read`, own unless `orbit.view_all`) and `deals` (`title`; same scope) collections. Keep those field names.
- `@/lib/workspace`: `TEAM_SIZES`, `WORKSPACE_MODES`, `RESERVED_SLUGS`, `isSlugAvailable`, `suggestSlug`, `createWorkspace`.
- `@/lib/seed-types`: `SeedCtx` (§11.7).

## 7. UI components (`@/components/ui` or `@/components/ui/<file>`)

Styled per `docs/DESIGN.md` (see §0a: real glass with lit hairlines, radius 8–16, pill inputs/buttons, chip-active `#56397D`, the Figma gradients). **Server-safe** (no `'use client'`): Input, Textarea, NativeSelect, DateInput, Badge, StatusPill, PriorityLabel, Avatar, AvatarStack, Card, CardHeader, SectionLabel, StatCard, PageHeader, EmptyState, DataTable, Pagination, MonthCalendar, Progress, SegmentedBar, KeyValue, Timeline, Stepper, Skeleton, Icon, Logo, BurstMark, `buttonClass` (from `button-styles`). Everything else is a client component.

| Component | Props (main) | Example |
|---|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'outline'\|'ghost'\|'danger'\|'violet'`, `size: 'sm'\|'md'\|'lg'`, `loading`, `icon`, `iconRight`, `href` (renders Link), `sound` (default `'click'`, `false` silences) + button attrs | `<Button variant="primary" icon={<Plus className="size-4" />} href="/app/folio/invoices/new">New invoice</Button>` |
| `IconButton` | `label` (required), `size`, `variant` (default ghost), children icon | `<IconButton label="Edit"><Pencil className="size-4" /></IconButton>` |
| `buttonClass(variant?, size?, className?)` | from `@/components/ui/button-styles` — style a `Link` in server components | `<Link className={buttonClass('outline')} href=…>` |
| `Input` | input attrs + `icon`, `trailing`, `inputSize` | `<Input name="title" placeholder="Task title" icon={<Search />} />` |
| `Textarea` | textarea attrs | `<Textarea name="notes" rows={4} />` |
| `NativeSelect` | `options`, `placeholder` + select attrs | `<NativeSelect name="state" options={STATE_OPTIONS} placeholder="State" />` |
| `DateInput` | `type: 'date'\|'month'\|'time'\|'datetime-local'` | `<DateInput name="dueDate" defaultValue={todayIST()} />` |
| `Select` | `name`, `options: {value,label,hint?,disabled?}[]`, `value/defaultValue`, `onValueChange`, `placeholder`, `size`, `required` (no empty-string values) | `<Select name="priority" defaultValue="medium" options={[{ value: 'low', label: 'Low' }, …]} />` |
| `Checkbox` | `name`, `value` ('on'), `checked/defaultChecked`, `onCheckedChange`, `label`, `description` | `<Checkbox name="billable" label="Billable" />` (zod: `checkbox`) |
| `Switch` | `name` (submits 'true'/'false'), `checked/defaultChecked`, `onCheckedChange`, `label`, `description` | `<Switch name="pinned" label="Pin to top" />` |
| `RadioCards` | `name`, `options: {value,title,description?,icon?,children?}[]`, `value/defaultValue`, `onValueChange`, `columns`, `selectedLabel` | plan picker, mode choice |
| `ChipGroup` | `options: {value,label,count?}[]`, single (`value/defaultValue/onValueChange`) or `multiple`, `name` (multiple submits `name[]`), `size` | `<ChipGroup name="tags" multiple options={…} />` |
| `Badge` | `tone`, `icon`, `size` (filled pill; no dot) | `<Badge tone="orchid">Retainer</Badge>` |
| `StatusPill` | `status`, `label?`, `tone?` | `<StatusPill status={inv.status} />` |
| `PriorityLabel` | `priority` | `<PriorityLabel priority="high" />` |
| `Avatar` / `AvatarStack` | `name`, `src?`, `size: xs\|sm\|md\|lg\|xl` / `people`, `max` | `<AvatarStack people={assignees} max={3} />` |
| `Card` / `CardHeader` / `SectionLabel` | `interactive`, `padded`, `variant: 'glass'\|'solid'\|'table'` / `label`, `icon`, `title`, `description`, `actions` | `<Card><CardHeader label="Project overview" icon={<FolderKanban />} actions={…} />…</Card>` |
| `StatCard` | `label`, `value`, `icon`, `delta` (±%), `invert`, `trend: number[]`, `color` (CSS), `hint`, `href` | `<StatCard label="Overdue" value={4} delta={-12} invert trend={[…]} color="var(--danger)" />` |
| `PageHeader` | `title`, `description`, `breadcrumb`, `back: {href,label}`, `actions`, `icon`, children (tabs/filters row) | §11.1 |
| `LinkTabs` | `tabs: {href,label,count?,icon?,prefix?}[]` — active by path and query | `<LinkTabs tabs={[{ href: `/app/clients/${id}`, label: 'Overview' }, { href: `/app/clients/${id}?tab=contacts`, label: 'Contacts' }]} />` |
| `Tabs` | `items: {value,label,content,count?}[]`, `defaultValue/value/onValueChange` | in-page tabs |
| `Segmented` | `options`, `value`, `onChange` | List / Board / Calendar switch |
| `Dialog` | `trigger` (asChild), `title`, `description`, `footer`, `open/onOpenChange`, `size: sm\|md\|lg\|xl` | §11.3 |
| `DialogClose` | Radix Close (asChild) | `<DialogClose asChild><Button>Cancel</Button></DialogClose>` |
| `ConfirmDialog` | `trigger`, `title`, `description`, `confirmLabel`, `tone: 'danger'\|'primary'`, `onConfirm(reason?) → ActionResult \| void`, `reason?: { label, placeholder?, required? }` | `<ConfirmDialog trigger={<Button variant="danger">Void</Button>} title="Void invoice?" reason={{ label: 'Reason', required: true }} onConfirm={(reason) => voidInvoice({ id, reason })} />` |
| `Sheet` | `trigger`, `title`, `description`, `footer`, `open/onOpenChange`, `side: right\|left\|bottom` | filters, quick create |
| `DropdownMenu` | `trigger`, `items: ({label,icon?,onSelect?,href?,danger?,disabled?,shortcut?} \| {type:'separator'} \| {type:'label',label})[]`, `align`, `header` | row actions |
| `Popover` / `PopoverClose` | `trigger`, `align`, `open/onOpenChange` | |
| `Tooltip` | `content`, `side`, children trigger (provider is in the shell) | |
| `EmptyState` | `icon`, `title`, `description`, `action`, `compact` | `<EmptyState icon={<FileText />} title="No invoices yet" description="Create your first GST invoice." action={<Button variant="primary" href="/app/folio/invoices/new">New invoice</Button>} />` |
| `DataTable` | `columns: {key,header,cell?,sortable?,align?,className?,hideOnMobile?}[]`, `rows`, `rowKey`, `rowHref?`, `basePath`, `params`, `empty`, `rowClassName?`, `footer?` (server component) | §11.4 |
| `Pagination` | `page`, `pageSize`, `total`, `basePath`, `params` | §11.4 |
| `SearchInput` | `placeholder`, `param` ('q') — debounced 300 ms, resets page | §11.4 |
| `FileUpload` | `name`, `accept`, `multiple`, `maxMb` (10), `hint`, `onFiles` — real file input, works with FormData | `<FileUpload name="receipt" accept="image/*,application/pdf" />` |
| `MonthCalendar` | `month` 'YYYY-MM', `marks: Record<date,{tone,label?,dots?}>`, `selected`, `prevHref/nextHref`, `dayHref(date)`, `renderDay(date)`, `weekStartsOn` (default 0 = Sunday), `size: sm\|lg`, `title`, `hideHeader` | attendance, leave calendar |
| `Progress` | `value` 0–100, `tone?`, `label?`, `size: sm (8px)\|md (16px)\|lg (42px, label inside)` | `<Progress value={64} label="Done" />` |
| `SegmentedBar` | `segments: {label,value,tone,color?}[]`, `showLegend`, `size: md (24px)\|lg (48px)` | On time / Late / Absent |
| `KeyValue` | `items: {label,value,hidden?}[]`, `columns` | detail panels |
| `Timeline` | `items: {id,title,description?,at?,icon?,tone?,meta?}[]`, `empty` | activity |
| `Stepper` | `steps: {key,label,description?}[]`, `current` (index; = length when done) | payroll stages |
| `Kanban` / `KanbanCard` | `columns: {id,title,tone?,meta?}[]`, `items: {id,columnId,…}[]`, `renderItem(item,{dragging})`, `onMove(itemId,toColumnId,toIndex) → boolean\|void` (false/throw reverts), `columnFooter`, `disabled`, `emptyLabel` | §11.6 |
| `ActionForm` | `action`, `onDone?(result)`, `resetOnSuccess?`, `noRefresh?`, `className`, `id` | §11.3 |
| `SubmitButton` | Button props + `pendingLabel` (default "Saving…") | |
| `FormField` | `name` (links the field error), `label`, `required`, `help`, `inline`, `htmlFor` | |
| `useAction(fn, { onDone?, noRefresh? })` | `→ [run(input) → Promise<ActionResult>, pending]` with toast/sound/redirect/refresh | `const [run, pending] = useAction(completeTask)` |
| `useFieldError(name)` / `useFormPending()` | inside ActionForm | custom fields |
| `Skeleton` | `className` | `loading.tsx` |
| `Icon` | `name: IconName` + lucide props | `<Icon name="Banknote" size={16} />` |
| `Logo` / `BurstMark` / `ArcMark` | `size` (height), `showText`, `variant: 'gradient'\|'white'` / `size`, `animated`, `variant` / `size` | marketing header, auth |
| `BrandMesh` | `className`, `style`, children (server-safe container with the drifting mesh) | auth hero, marketing hero |
| `Swatch` | `tone` or `color`, `shape: 'square'\|'round'` (12px legend key) | chart legends |

Status colours: `TONE_CLASSES[tone]` (filled badge classes), `TONE_DOT[tone]` (`bg-*`) and `TONE_TEXT[tone]` (coloured words on dark) from `badge.tsx`.

### Tailwind tokens (globals.css)
Colours: `bg-bg`, `bg-bg-2` (= `bg-canvas`, `bg-panel`), `bg-surface`, `bg-surface-2`, `bg-surface-3`, `bg-solid`, `bg-control`, `bg-control-active`, `bg-menu`, `border-subtle`, `border-strong`, `border-line`, `bg-line-soft`, `text-fg`/`text-fg-2`/`text-fg-3`/`text-fg-4` (also `text-1`/`text-2`/`text-3`), `text-icon-muted`, `text-name`, `text-link`, `indigo`, `orchid`, `blush`, `violet`, `violet-2`, `chip-active`, `success`, `warning`, `danger`, `info`, `pink`, `orange`, `mint`, `absent`, `work`, `muster`, `orbit`, `folio` (all usable as `bg-/text-/border-/ring-`, with `/opacity`). Radii `rounded-card` (12px), `rounded-hero` (16px), `rounded-rail` (10px); `rounded-xl` 10, `rounded-2xl` 12, `rounded-3xl` 16. Materials: `glass`, `glass-hero`, `lit-edge`, `lit-edge-bright`, `card-solid`, `card-table`, `edge-stroke` (+ `[--stroke:…]`), `edge-selected`. Utilities: `scroll-fade-y`, variants `short:` (max-height 760px), `rail-short:` (940px) and `tiny:` (600px), `lift` (hover -1px + press 0.98), `press`, `shimmer` (one light sweep on hover), `bg-grad-brand` (drifting mesh), `bg-grad-button` (drifting), `bg-grad-button-alt`, `bg-grad-rail`, `bg-grad-progress`, `bg-grad-mauve`, `bg-grad-page`, `bg-surface-table`, `text-gradient` (wordmark only), `section-label`, `scrollbar-none`. Animations: `animate-fade-in`, `animate-scale-in`, `animate-slide-up`, `animate-slide-in-right`, `animate-pulse-soft`, `animate-float` (ribbon float), `animate-gradient`. Shadows `shadow-card` (inset highlight), `shadow-pop`. Reduced motion (OS or user pref) stops every loop at its first frame. CSS vars `--grad-*`, `--edge`, `--work` etc. are available in inline styles.

## 8. Charts (`@/components/charts`) — SVG, responsive, server-safe

| Chart | Props |
|---|---|
| `Sparkline` | `data: number[]`, `color` (CSS, e.g. `'var(--info)'`), `height` (40), `area` (default false), `glow`, `marker` (index of the end-marker), `draw` (reveal once, default true) |
| `AreaChart` | `data: {label,value}[]`, `color`, `height` (200), `formatValue`, `labelEvery` |
| `LineChart` | `series: {name,color,data}[]`, `labels: string[]`, `height`, `formatValue` |
| `BarChart` | `labels`, `series: {name,color,data}[]`, `stacked`, `horizontal`, `height`, `formatValue` |
| `Donut` | `data: {label,value,color}[]`, `size`, `thickness`, `centerValue`, `centerLabel`, `legend`, `formatValue` |
| `RingChart` | `rings: {label,value (0–100),color}[]` (outer first), `size` (186), `thickness` (14; strokes thin 1px per ring inward), `gap` (12), `centerValue`, `centerLabel` |
```tsx
<RingChart rings={[{ label: 'Done', value: 62, color: 'var(--orange)' }, { label: 'In progress', value: 28, color: 'var(--info)' }, { label: 'Blocked', value: 10, color: 'var(--pink)' }]} centerValue="48" centerLabel="tasks" />
<BarChart labels={months} series={[{ name: 'Collected', color: 'var(--folio)', data }]} formatValue={(v) => formatINRCompact(v)} />
```
Pass functions (`formatValue`) only from server components or client components — not across the server→client boundary.

## 9. Shell (`@/components/shell`)

`app/app/layout.tsx` renders `<AppShell>` for every `/app/*` page, as the Figma frame: the Flowbit lockup top-left, top bar inside the outlined main panel (breadcrumb from the catalog, Work's timer, bell with a numeric count, white avatar menu with sound toggle and sign out), gradient rail (catalog items with the Figma glyphs; locked products show a lock and open the preview; switched-off products hide; HR falls back to `/app/me` without `people.read`), side panel (workspace row and switcher, ⌘K search pill, sections from `SIDE_PANELS[panelFor(path)]`, check-in card), trial / read-only banners, command palette, mobile bottom bar + side sheet. On md+ the content scrolls inside `<main id="main">`, not the window. Your pages render only their content (the shell adds 28px left / 33px right padding).

- **Do not** wrap pages in another frame or add page-level padding.
- Short viewports: the rail's item list and the side panel scroll (with a soft fade); below 760 px height (`short:` variant) spacing tightens and the whole side panel scrolls as one; below 600 px (`tiny:`) rail labels become screen-reader only. The active rail item scrolls into view. Use `short:`/`tiny:` in your own pages if needed (defined in globals.css), plus the `scroll-fade-y` utility.
- Motion: the shell sets `<html data-motion="system|reduce|full">` from `User.prefs.motion`; `reduce` (or the OS setting, unless `full`) disables animations and hover lift.
- `Org.disabled` → `app/app/layout.tsx` renders `DisabledWorkspace` (`components/shell/disabled-workspace.tsx`) instead of the shell.
- `useShell()` (client, inside /app): `user` (`name, email, isPlatformAdmin, sound, reducedMotion, motion`), `org, orgs, roleLabel, permissions, products, features, hasEmployee, projects, teams, today, unread, trialDaysLeft, readOnlyDaysLeft, readOnlyMessage, access, can(perm), has(product), hasFeature(key), openUpgrade(product), openCommand()`.
- **Work side panel contract**: the shell reads the `projects` collection (`{ orgId, name, color?, status }`, excluding `completed`/`cancelled`, newest `updatedAt` first, 6 max) and the `teams` collection (`{ orgId, name, color? }`) directly — no import of your models. Keep those field names. The "+" buttons link to `/app/work/projects?new=1` and `/app/work/teams?new=1`: open your create dialog when `new=1` is present.
- **Search contract**: tasks are searched on `title`/`key`, projects on `name`/`code`, invoices on `number` (status as subtitle), leads on `companyName`/`contactName`, deals on `title` (stage as subtitle), in the `tasks`/`projects`/`invoices`/`leads`/`deals` collections. Lead/deal hits respect `ownerId`/`reviewerId` without `orbit.view_all`.
- Invite button → `/app/settings/members?invite=1` (settings agent: open the invite dialog on `invite=1`).
- Upgrade/plan links → `/app/settings/subscription?add=<product>`.
- Bell → `/app/notifications`; avatar menu → `/app/settings/profile`, `/app/settings`, `/platform` (platform admins).
- `getShellData(ctx)` (`components/shell/data.ts`) is what the layout passes in.

## 10. Catalog keys and permissions

Products: `work` (Flowbit Work, violet `#C084FC`), `muster` (Muster, mint `#5EEAB0`), `orbit` (Orbit, sky `#60A5FA`), `folio` (Folio, amber `#F5B85C`). Features (for marketing/pricing): `work.{tasks,spaces,projects,teams,meetings,posts,time,whiteboards,reports,arc}`, `muster.{people,attendance,leave,claims,payroll*,letters,self_service,reports}` (*Muster Business only), `orbit.{leads,deals,contacts,activities,reports}`, `folio.{invoices,quotes,receipts,recurring,credit_notes,ledger,reports}`.

Permissions:
- core: `org.manage, org.delete, members.manage, roles.manage, billing.manage, audit.read, clients.read, clients.write, clients.delete`
- work: `tasks.read, tasks.write, tasks.manage, spaces.manage, projects.read, projects.write, teams.manage, meetings.write, posts.write, posts.manage, time.write, time.approve, whiteboards.write, work.reports, arc.use`
- muster: `people.read` (open People), `people.read_all` (every employee's rows), `people.read_team` (reporting chain), `people.read_sensitive` (PAN/UAN/ESIC/Aadhaar/bank), `people.write`, `people.import`, `people.salary` (edit salary structures = spec `salary.write`), `attendance.read`, `attendance.manage` (mark/override = spec `attendance.write`), `attendance.lock` (lock and reopen = spec `attendance.lock`/`attendance.unlock`), `attendance.approve`, `leave.read, leave.approve, leave.manage`, `approvals.escalated`, `claims.read` (see all claims), `claims.review, claims.pay, claims.forms`, `payroll.read` (the switch that exposes pay), `payroll.run` (= spec `payroll.prepare`), `payroll.approve, payroll.lock, payroll.unlock, payroll.release`, `letters.read, letters.write, letters.templates`, `hr.reports, hr.settings`
- orbit: `orbit.read` (open Orbit; own records), `orbit.view_all` (everyone's leads/deals/activities = spec `orbit.viewAll`), `orbit.close` (reviewer: lost/won, reopen, reassign, edit any = spec `orbit.close`), `leads.write, deals.write, contacts.write, activities.write` (together = spec `orbit.write`), `orbit.reports`, `orbit.settings` (= spec `orbit.admin`)
- folio: `folio.read, invoices.write, invoices.issue, invoices.void, quotes.write, receipts.write, recurring.write, credit_notes.write, collections.write` (follow-ups and reminders), `folio.reports, folio.settings`
- Work mapping for the Work spec's suggested keys: `tasks.manage` = see and edit every non-personal task (`tasks.read_all` + `tasks.manage`), `projects.write` = `projects.manage`, `posts.manage` = `posts.announce` + `posts.moderate`.

Role highlights: owner = all; admin = all but `billing.manage`, `org.delete`; hr_admin = all muster + work basics + `clients.read`, `audit.read`; hr_exec = `people.read/read_all/write/import`, attendance read/manage/approve, all leave, `claims.read/review/forms`, `letters.read/write`, `payroll.read`, `hr.reports` (no `people.read_sensitive`, `people.salary`, `attendance.lock`, `payroll.run/approve/lock/unlock/release`, `claims.pay`, `letters.templates`); finance = `payroll.read/approve/lock/release`, `claims.read/review/pay`, `people.read/read_all/read_sensitive`, `attendance.read`, `letters.read`, `hr.reports`, all folio, `orbit.read/reports`, `work.reports`, `clients.read/write`, `audit.read`; manager = all work + `leave.read/approve`, `attendance.read/approve`, `people.read/read_team`, `letters.read`, `orbit.read/view_all`, `clients.read/write`; sales = all orbit (incl. `view_all`, `close`) + `clients.read/write`, `folio.read`, `quotes.write`; member = work basics (`tasks.read/write, projects.read, meetings.write, posts.write, time.write, whiteboards.write, arc.use`) + `clients.read`. Self-service (`/app/me/*`) needs a linked employee (`ctx.member.employeeId`), not a permission.

Page hrefs with their `perm`/`feature` are in `PAGES` (`src/lib/catalog.ts`). Pages added in patch 1:

| Href | Title | Perm | Owner |
|---|---|---|---|
| `/app/folio/receipts/[id]` | Receipt | `folio.read` | folio (folio-b) |
| `/app/folio/recurring/plans/new` | New billing plan | `recurring.write` | folio (folio-a) |
| `/app/folio/recurring/plans/[id]` | Billing plan | `folio.read` | folio (folio-a) |
| `/app/folio/credit-notes/new` | New credit note (`?invoiceId=`) | `credit_notes.write` | folio (folio-a) |
| `/app/folio/credit-notes/[id]` | Credit note | `folio.read` | folio (folio-a) |
| `/app/folio/ledger` | Ledgers (index) | `folio.read` | folio (folio-b) |
| `/app/folio/collections` | Collections (acting needs `collections.write`) | `folio.read` | folio (folio-b) |
| `/app/hr/reports/gratuity` | Gratuity (`feature: 'muster.payroll'`) | `payroll.read` | muster-b |

Changed: `/app/hr/people/import` → `people.import`; `/app/hr/claims` → `claims.read` (actions need `claims.review`). Retainers have no detail route (dialog on `/app/folio/recurring`); Orbit and Work need no routes beyond SPEC §6. Guard each page with the same values:
```ts
const ctx = await requireMember({ product: 'muster', perm: 'payroll.read', feature: 'muster.payroll' })
```
Clients pages: `requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.read' })`.

## 11. Recipes

### 11.1 A page (server component)
```tsx
// src/app/app/orbit/leads/page.tsx
import type { Metadata } from 'next'
import { Plus, Target } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Lead } from '@/models/orbit/Lead'

export const metadata: Metadata = { title: 'Leads' }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'orbit', perm: 'orbit.read' })
  const leads = await ctx.db(Lead).find({}).sort({ createdAt: -1 }).limit(20).lean()
  return (
    <>
      <PageHeader
        title="Leads"
        description="Everyone you are talking to, by stage."
        breadcrumb={breadcrumbFor('/app/orbit/leads')}
        icon={<Target />}
        actions={ctx.can('leads.write') ? <Button variant="primary" icon={<Plus className="size-4" />} href="/app/orbit/leads/new">New lead</Button> : null}
      />
      {/* content */}
    </>
  )
}
```
Grid: `<div className="grid grid-cols-12 gap-4"><Card className="col-span-12 lg:col-span-8">…</Card></div>`.

### 11.2 An action (`'use server'` file in your module)
```ts
// src/modules/orbit/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { NotFoundError } from '@/lib/errors'
import { email, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { Lead } from '@/models/orbit/Lead'

const leadSchema = z.object({ name: requiredText('Name'), email: email.optional(), valuePaise: paise.optional(), notes: optionalText() })

export const createLead = action(
  leadSchema,
  async (input, ctx) => {
    const lead = await ctx.db(Lead).create({ ...input, ownerId: ctx.memberId, stage: 'new' })
    await audit(ctx, { action: 'lead.created', entity: 'Lead', entityId: lead._id, summary: `Added lead ${lead.name}`, product: 'orbit' })
    revalidatePath('/app/orbit/leads')
    return ok(`Lead "${lead.name}" added`, { id: String(lead._id) }, `/app/orbit/leads/${lead._id}`)
  },
  { product: 'orbit', perm: 'leads.write' },
)

export const deleteLead = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const res = await ctx.db(Lead).deleteOne({ _id: id })
    if (!res.deletedCount) throw new NotFoundError('That lead')
    revalidatePath('/app/orbit/leads')
    return ok('Lead deleted', undefined, '/app/orbit/leads')
  },
  { product: 'orbit', perm: 'leads.write' },
)
```

### 11.3 A form with ActionForm (client component)
```tsx
'use client'
import { createLead } from '@/modules/orbit/actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input, Textarea } from '@/components/ui/input'

export function LeadForm() {
  return (
    <ActionForm action={createLead} className="grid gap-4 sm:grid-cols-2">
      <FormField name="name" label="Name" required><Input id="name" name="name" /></FormField>
      <FormField name="email" label="Email"><Input id="email" name="email" type="email" /></FormField>
      <FormField name="valuePaise" label="Value (₹)" help="Estimated deal size"><Input id="valuePaise" name="valuePaise" inputMode="decimal" /></FormField>
      <FormField name="notes" label="Notes" className="sm:col-span-2"><Textarea id="notes" name="notes" /></FormField>
      <div className="sm:col-span-2 flex justify-end"><SubmitButton>Add lead</SubmitButton></div>
    </ActionForm>
  )
}
```
Inside a dialog: `<Dialog trigger={<Button variant="primary">New lead</Button>} title="New lead"><LeadForm /></Dialog>`; pass `onDone` to close it (control `open`). Field names map to `fieldErrors` keys (`contacts.0.email`). Input is kept on refusal; success toasts, refreshes and follows `redirect`.

Non-form button: `const [run, pending] = useAction(deleteLead); <Button variant="danger" loading={pending} onClick={() => run({ id })}>Delete</Button>` — wrap destructive ones in `ConfirmDialog` (pass `onConfirm={() => deleteLead({ id })}`).

### 11.4 A list: DataTable + SearchInput + Pagination
```tsx
import { escapeRegex } from '@/lib/utils'
import { mongoSort, parseListParams, type SearchParams } from '@/lib/list'
import { formatDate } from '@/lib/dates'
import { DataTable, type Column } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { StatusPill } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.read' })
  const p = parseListParams(sp, { pageSize: 20, sort: 'name', dir: 'asc' })
  const filter = { ...(p.q ? { name: new RegExp(escapeRegex(p.q), 'i') } : {}), ...(p.get('status') ? { status: p.get('status') } : {}) }
  const [rows, total] = await Promise.all([
    ctx.db(Client).find(filter).sort(mongoSort(p)).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(Client).countDocuments(filter),
  ])
  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Client', sortable: true },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
    { key: 'createdAt', header: 'Added', sortable: true, hideOnMobile: true, cell: (r) => formatDate(r.createdAt) },
  ]
  return (
    <>
      <PageHeader title="Clients" actions={<SearchInput placeholder="Search clients" />} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => String(r._id)} rowHref={(r) => `/app/clients/${r._id}`} basePath="/app/clients" params={sp}
        empty={<EmptyState icon={<Building2 />} title={p.q ? `No clients match "${p.q}"` : 'No clients yet'} action={<Button variant="primary" href="/app/clients/new">Add client</Button>} compact />} />
      <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath="/app/clients" params={sp} />
    </>
  )
}
```
Filters as links: `buildHref('/app/clients', sp, { status: 'active', page: undefined })`, or `<LinkTabs>` with `?status=` hrefs.

### 11.5 A detail page with tabs
```tsx
export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await requireMember({ anyProduct: ['work', 'orbit', 'folio'], perm: 'clients.read' })
  if (!isValidObjectId(id)) notFound()
  const client = await ctx.db(Client).findById(id).lean()
  if (!client) notFound()
  const tab = first(sp.tab) ?? 'overview'
  const base = `/app/clients/${id}`
  return (
    <>
      <PageHeader title={client.name} back={{ href: '/app/clients', label: 'Clients' }} actions={…}>
        <LinkTabs tabs={[
          { href: base, label: 'Overview' },
          { href: `${base}?tab=contacts`, label: 'Contacts', count: client.contacts.length },
          ...(ctx.has('folio') ? [{ href: `${base}?tab=invoices`, label: 'Invoices' }] : []),
        ]} />
      </PageHeader>
      {tab === 'overview' ? <Overview client={client} /> : tab === 'contacts' ? <Contacts client={plain(client)} /> : null}
    </>
  )
}
```
(`isValidObjectId` from `mongoose`, `notFound` from `next/navigation`.) Pass `plain(doc)` to client components.

### 11.6 A kanban
```tsx
'use client'
import { Kanban, KanbanCard } from '@/components/ui/kanban'
import { moveTask } from '@/modules/work/actions'
import { toast } from '@/lib/toast'

export function TaskBoard({ tasks }: { tasks: { id: string; columnId: string; title: string }[] }) {
  return (
    <Kanban
      columns={[{ id: 'todo', title: 'To do' }, { id: 'in_progress', title: 'In progress', tone: 'info' }, { id: 'blocked', title: 'Blocked', tone: 'pink' }, { id: 'done', title: 'Done', tone: 'success' }]}
      items={tasks}
      renderItem={(t) => <KanbanCard><p className="text-sm text-fg">{t.title}</p></KanbanCard>}
      onMove={async (id, status, index) => {
        const res = await moveTask({ id, status, index })
        if (!res.ok) toast.error(res.error)
        else if (res.message) toast.success(res.message)
        return res.ok
      }}
    />
  )
}
```
Map server rows to `{ id: String(t._id), columnId: t.status, ... }`. Store an `order` number and renumber the target column in the action.

### 11.7 A PDF route
```tsx
// src/app/api/folio/invoices/[id]/pdf/route.tsx
import { PdfDocument, PdfKeyValue, PdfSection, PdfTable, pdfResponse, renderPdf } from '@/lib/pdf/base'
import { getCtx } from '@/lib/ctx'
import { formatINR } from '@/lib/money'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx()
  if (!ctx || !ctx.can('folio.read')) return new Response('Not allowed', { status: 403 })
  const { id } = await params
  const inv = await ctx.db(Invoice).findById(id).lean()
  if (!inv) return new Response('Not found', { status: 404 })
  const pdf = await renderPdf(
    <PdfDocument org={{ name: ctx.org.name, addressLines: [ctx.org.address?.line1 ?? ''], gstin: ctx.org.gstin }} title="TAX INVOICE" meta={[{ label: 'Invoice no.', value: inv.number ?? 'Draft' }]}>
      <PdfSection label="Items"><PdfTable columns={[{ key: 'd', header: 'Description', width: 3 }, { key: 'a', header: 'Amount', width: 1, align: 'right' }]} rows={[{ d: 'Retainer', a: formatINR(inv.totalPaise) }]} /></PdfSection>
      <PdfKeyValue items={[{ label: 'Total', value: formatINR(inv.totalPaise), strong: true }]} />
    </PdfDocument>,
  )
  return pdfResponse(pdf, `${inv.number ?? 'invoice'}.pdf`)
}
```
Route files containing JSX must be `.tsx`.

### 11.8 A seed file
```ts
// src/modules/orbit/seed.ts — models and pure helpers only (no lib/ctx, lib/audit, lib/mail…)
import type { SeedCtx } from '@/lib/seed-types'
import { Client } from '@/models/Client'
import { Deal } from '@/models/orbit/Deal'
import { rupeesToPaise } from '@/lib/money'

export async function seed(ctx: SeedCtx): Promise<void> {
  const clients = await ctx.db(Client).find({}).lean()
  await ctx.db(Deal).insertMany(clients.slice(0, 4).map((c, i) => ({
    title: `${c.name} — website revamp`, clientId: c._id, valuePaise: rupeesToPaise(150000 + i * 25000),
    stage: 'proposal', probability: 50, ownerId: ctx.members.sales._id, status: 'open', expectedCloseDate: '2026-10-28',
  })))
  ctx.log(`deals: 4`)
}
```
`SeedCtx`: `orgId`, `org` (`_id, name, slug, officeHours, workWeek`), `users: Record<RoleKey, { _id, name, email }>`, `members: Record<RoleKey, Member>` (owner, admin, hr_admin, hr_exec, finance, manager, sales, member), `allMembers` (16: the eight role members plus eight demo people with titles/departments), `db(Model)`, `log(msg)`. Core seed already created 8 Clients (with GSTIN/state/contacts) and 30 days of AttendanceDay for every member. Products run in order work → muster → orbit → folio, then `src/modules/settings/seed.ts`, `src/modules/subscription/seed.ts` and `src/modules/marketing/seed.ts` (each only if it exists, same `seed(ctx)` signature). Use Indian names, ₹ amounts and dates around October 2026. Run order is fixed; read data created by earlier products defensively.

### 11.9 A test
```ts
// src/modules/folio/gst.test.ts — pure functions only
import { describe, expect, it } from 'vitest'
import { splitGst } from './gst'

describe('splitGst', () => {
  it('uses CGST+SGST within the state', () => {
    expect(splitGst({ taxablePaise: 100_000, ratePercent: 18, sameState: true })).toEqual({ cgst: 9_000, sgst: 9_000, igst: 0 })
  })
})
```
Run with `npx vitest run src/modules/folio`. Tests may import `@/lib/{money,dates,plans,billing,permissions,catalog,sequence,status,list,validation,india-states,audit-diff,rate-limit,attendance-core}`.

## 12. Gotchas

- **Installed packages** you may use: `@radix-ui/react-{dialog,dropdown-menu,popover,select,tabs,tooltip,checkbox}`, `sonner`, `lucide-react` (v1 names, e.g. `House`, `SquareCheckBig`, `ChartColumn`, `LoaderCircle`), `motion`, `@dnd-kit/{core,sortable,utilities}`, `date-fns` v4, `zod` v4 (`{ error: '…' }` for messages), `@react-pdf/renderer`, `bcryptjs`, `papaparse` (+ types), `resend`, `@excalidraw/excalidraw` (load with `next/dynamic` and `ssr: false`; import its CSS `@excalidraw/excalidraw/index.css` in that client component), `clsx`, `tailwind-merge`. `.npmrc` sets `legacy-peer-deps=true` (Excalidraw).
- A `'use client'` module's non-component exports are client references on the server: style server Links with `buttonClass` from `button-styles.ts`, not from `button.tsx`.
- Radix `Select` forbids `''` as an item value — use a placeholder and an "All" value like `'all'`.
- Hidden inputs: `Switch` submits `'true'/'false'`; `Checkbox` submits `'on'` only when checked — parse both with `checkbox` from `@/lib/validation`.
- Prefer `.lean()` reads; pass `plain()` objects to client components.
- Use `escapeRegex` for any user search term in a RegExp.
- `revalidatePath` after writes; `ActionForm` also calls `router.refresh()` unless `noRefresh`.
- Legal/financial records (issued invoices/letters, released payroll) are voided with a reason via `ConfirmDialog`'s `reason` option — never hard-deleted.
- Day numbering: `workWeek`, `weekday()` and `DEFAULT_WORK_WEEK` use getDay (0 = Sunday). `[1,2,3,4,5,6]` is Mon–Sat.
- Member ↔ Employee: when `Member.employeeId` is set, Muster's `Employee.managerId`/`departmentId` are the source of truth for approvals; Settings shows them read-only ("Managed in HR → People").
- Notifications that must not repeat (trial reminders, overdue nudges) pass `dedupeKey`. Fine-grained types go in `event`, not `kind`.
- Flowbit-issued numbers (`FB/{FY}/NNNN`) use `nextSeq(PLATFORM_ORG_ID, …, session)` inside the activation transaction.
- Seed logins (all roles) are in `seed-logins.local.md` (git-ignored). Owner: `sanskaar@vistaarsws.com`. Re-seed with `npm run db:seed -- --reset` (drops only the `flowbit` database).
