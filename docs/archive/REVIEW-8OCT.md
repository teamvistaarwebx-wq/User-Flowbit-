# The 8 Oct 2026 review: every item asked for

Source: the Shahpura 188 recording, plus 2 references from 186. The "Status" column was filled after a code check; "Done 9 Oct" marks the v2.0 lock (Tier 1) build.

## A. Changes to build

| # | Area | What to do | Status |
|---|---|---|---|
| 1 | Home | Quick add in the "Assigned to me" widget: type a title, press Enter, the task joins the list. Keep the widget uncluttered. | Done 9 Oct: inline "Add a task for me…" on the All tab; the row shows at once (`components/work/dashboard/assigned-quick-add.tsx`) |
| 2 | Home / Check-in | Break types: Lunch Break, Power Nap, Tea/Coffee Break, Personal/Rest Break | Done 9 Oct: Lunch, Power Nap, Tea/Coffee, Personal/Rest, each paid/unpaid with a daily limit (HR settings → Attendance rules); stored on the break punch; effective vs payable hours (`lib/break-types.ts`) |
| 3 | Home / Check-in | Break icons with a glass effect, like the existing icon, plus a few animations | Partly done 9 Oct: a simple Lucide icon per break type in the picker, sheet and register; glass icons and animation left for later, as the plan advises |
| 4 | Projects | Upload a client or project logo (JPEG, PNG) | Done 9 Oct: JPEG/PNG logo, resized in the browser, on Projects (Settings tab) and Clients (Overview) (`modules/work/projects/logo-actions.ts`, `modules/clients/logo-actions.ts`) |
| 5 | Projects | More colour options | Done 9 Oct: custom colour picker after the 8 presets (`components/work/spaces/color-swatches.tsx`) |
| 6 | Teams | Card view and list view | Missing: card view only (`app/app/work/teams/page.tsx`) |
| 7 | Teams | The card shows the member and the other projects they are on | Missing: card shows lead, member avatars and open tasks, not members' projects (`components/work/teams/team-card.tsx`) |
| 8 | Teams | A light hover or animated border on the card | Partial: card lifts on hover; no animated border (`team-card.tsx`, `lift` in `globals.css`) |
| 9 | Posts | Redesign the page, after researching how modern tech products do posts | Done 9 Oct: type chips, pinned and scheduled sections, cleaner mobile-safe cards with polls, policy strip and kudos people (STATUS v2.1 step 4). Was: not started (`app/app/work/posts/page.tsx`) |
| 10 | Posts | Image and GIF upload. Images don't upload even today, so this is a bug. | Done 9 Oct: JPEG, PNG, GIF and WebP in posts, replies and task comments, with thumbnails and a lightbox (`lib/inline-images.ts`, `modules/work/images.ts`) |
| 11 | Posts | More categories beyond Announcement, Discussion, Idea and Update | Done 9 Oct: ten types (Announcement, Update, Kudos, Celebration, Policy, Question, Poll, Win, Welcome, Event); old categories read as Questions |
| 12 | Posts | Proper icons; the current ones look like Slack's | Done 9 Oct: Phosphor duotone icons per type, tinted pills (`components/work/posts/post-type-icon.tsx`) |
| 13 | Tasks | Task detail panel like ClickUp's, with better icons | Missing: task detail is a full page, no side panel (`app/app/work/tasks/[id]/page.tsx`) |
| 14 | Tasks | Picking a client puts the client's logo on the task, and the task moves into that client's work automatically | Partly done 9 Oct: the client logo shows on task rows, board cards and task detail; the client page still has no Tasks tab (Tier 2) |
| 15 | Tasks | Comments respond very slowly; fix the performance (the dev owns this) | Done 9 Oct: only the comment is saved before the response; watchers, activity and notifications run in `after()`; only the task page is revalidated; the composer is optimistic (`modules/work/tasks/comment-actions.ts`, `comment-effects.ts`) |
| 16 | Tasks | Add a blocker, and comment on the blocker | Exists: Blocked asks for a reason with @mentions; stored, logged and notified (`components/work/tasks/blocked-dialog.tsx`, `mutate.ts:88-111`) |
| 17 | Tasks / Email | A digest so that task emails don't crowd the inbox | Exists: hourly / end-of-day digest, comments always hourly, quiet hours (`modules/messaging/digest.ts`, Profile → My alerts) |
| 18 | Spaces | A view beyond card and table, such as Kanban (question raised) | Exists: a space's Tasks tab has List / Board / Calendar (`app/app/work/spaces/[id]/page.tsx:125`); the space list itself is cards only |
| 19 | Clients | The page opens very slowly; fix the performance | Bug: reported slow, no obvious cause in code (paged at 25, batched queries, indexes present); measure it (`modules/clients/queries.ts:57-87`) |
| 20 | Clients | Better outer dashboard: pie charts, and filters for new or latest clients by onboarding date | Partial: owner, tag and status filters and sort by recent; no charts and no onboarding-date filter (`app/app/clients/page.tsx`) |
| 21 | Clients | Import (only Export exists today) | Done 9 Oct: Import button on the Clients page opens the Contacts and companies or Folio clients importer, and returns to Clients |
| 22 | Meetings | Schedule a meeting with Google connected and the Meet link created automatically | Partial: meeting link is pasted by hand and goes into the .ics invite; no Google connection (`modules/work/meetings/actions.ts:17`) |
| 23 | Meetings | A Flowbit bot joins every meeting made in Flowbit, records it and transcribes it | Missing |
| 24 | Meetings | Transcription with the Sarvam AI API, in Hindi and English | Missing |
| 25 | Meetings | MOM from the transcript: Agenda, Notes, Action items | Partial: agenda, notes and action items are typed by hand; nothing is generated (`models/work/Meeting.ts`) |
| 26 | Meetings | Action item to task in one click, or created automatically by AI | Partial: one-click Create task (one item or all) exists; no AI (`modules/work/meetings/item-actions.ts:60`) |
| 27 | Branding | PDFs use the company's own branding (logo, colours) instead of Flowbit's | Partial: logo and details are the company's; heading colour is fixed Flowbit purple (`lib/pdf/base.tsx:36`) |
| 28 | Branding | Themes and avatars per company | Partial: brand colours (Suite or trial only, `lib/brand-theme.ts:88`); no themes or avatars per company |
| 29 | Orbit | Select leads, then set email automation and reminders (mail, message, call). Only Assign, Export and Clear exist today. | Missing: bulk actions are Assign, Disqualify, Export and Clear (`components/orbit/lead-table.tsx:51-78`) |
| 30 | Folio | Charts in Reports | Missing: reports are tables and CSV only (`app/app/folio/reports/page.tsx`) |
| 31 | Settings / Appearance | The gradient does not change everywhere; the old gradient still shows | Done 9 Oct: brand colours set `--grad-button-alt`, `--grad-selected`, `--grad-step` and new Arc, check-in and auth tokens; the hard-coded gradients use them |
| 32 | Settings / Appearance | The Flowbit logo does not change | Done 9 Oct: the workspace logo replaces Flowbit's in the side panel and phone top bar, Flowbit as the fallback (`components/shell/workspace-logo.tsx`) |
| 33 | Settings | Red "test" text appears (bug) | Checked 9 Oct, not found: no red "test" text in the UI code; the only "Test" labels are amber (Test mode, Test keys) or violet (automation run). Needs the screenshot |
| 34 | Settings / Notifications | Icons are not right | Missing: not started (`components/settings/notification-grid.tsx`) |
| 35 | Support access | It covers CSV upload only. Make it clear where CSV can be uploaded (billing, inventory, services and so on). | Partial: read-only (1–72 h) and import-only (7 days) modes; the page does not list what can be imported; 9 importers, none for billing or inventory (`app/app/settings/support/page.tsx:35`, `modules/imports/types.ts:8`) |
| 36 | WhatsApp | **Hide it for now** and keep email; it comes back later through Interakt | Done 9 Oct: `FEATURE_WHATSAPP` (default off) plus Console → Settings → Features hide every WhatsApp surface; actions refuse, webhooks 404, sends skip to email (`modules/features/flags.ts`) |

## B. Release and positioning

| # | What | Status |
|---|---|---|
| 37 | Version 2.0 (straight from 1.0.1) | Done 9 Oct: package.json 2.0.0, "Flowbit 2.0" at the foot of Settings, `CHANGELOG.md` |
| 38 | Push an update to the build tonight. Lock the product tomorrow evening, then update week by week. Next version after 10 days. | |
| 39 | The team sends written feedback, compiled and pushed in one go | |
| 40 | Harsh's walkthrough | |
| 41 | Put the detailed user manual on the website as it is | Missing: the manual exists in `flowbit-launch/manual`, but no website page serves it |
| 42 | Old vs New comparison page (pages, code, tests, lines, file size, themes) | Missing: no page; the numbers are ready in `docs/FEATURES.md` §1 |
| 43 | Messaging: "It is not a vibe-coded product" | |
| 44 | AI feature: only a design brief today; it needs an API | |

## C. Already approved: no work

- Projects console (pie chart, health, completed count)
- Whiteboard: smooth and shareable. It uses the open-source canvas; no need to build our own.
- Time tracking, billable / non-billable and time approval
- Quick add in Tasks, and "assigned to me" as the default with reassignment
- My Alerts, hourly and EOD digest, quiet hours
- Payslip view and download
- Font is final
- Check-in synced with HRMS (wallet deduction on late check-in)

## D. Dropped

- Clock colour changing like a pie chart (could look unprofessional)

## E. Outside Flowbit

- Prachi's EOD / receivables tracking moves to Flowbit once it is live, with task links and screenshots
- Finish the Vistaar website before Saturday
