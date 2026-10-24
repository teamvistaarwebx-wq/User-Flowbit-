# Breach runbook (draft for the lawyer, 8 Oct 2026)

What Flowbit does when personal data in a workspace may have been exposed. It covers the DPDP Act 2023 and its Rules (Flowbit is the **data processor**; each workspace is the **data fiduciary** for its clients' and team's data) and CERT-In's 2022 directions on cyber incidents.

**Check with the lawyer before relying on it:** the timelines below come from the DPDP Rules and the CERT-In directions as published. The DPDP obligations apply from May 2027; an earlier date (Nov 2026) has been reported but not confirmed.

## Who does what

| Role | Person | Does |
|---|---|---|
| Incident lead | The founder (or the Admin the founder names) | Decides, signs off every notice, owns the timeline |
| Engineer on call | Whoever built or runs the affected part | Contains, collects logs, finds the cause |
| Support | support@useflowbit.com | Answers workspace owners, keeps the reference in every reply |

Keep one shared note per incident with the reference (`INC-<year>-<number>`), every step and its time (IST).

## The clock

| When | What |
|---|---|
| **Hour 0** | Someone finds or reports it. Start the note. |
| **Within 6 hours** | Report to **CERT-In** (incident@cert-in.org.in) if it is a reportable cyber incident: unauthorised access to systems or data, a data leak, compromised accounts, ransomware and the like. |
| **Within 24 hours** | Facts known so far written down; the founder decides who is affected. |
| **As soon as it is confirmed** | **Tell each affected workspace** (Console → Incidents). Do not wait for every detail: the workspace has its own deadline. |
| **Within 72 hours** of the workspace becoming aware | The **workspace** (the fiduciary) gives the Data Protection Board its detailed report and tells the people affected. Flowbit gives them whatever they need for it. |

## Steps

1. **Contain.** Stop the exposure first:
   - rotate the leaked key (`APP_SECRET` only as a last resort: it invalidates every signed link), Razorpay, Resend or Interakt keys;
   - revoke sessions: `Session` for customers, `StaffSession` for the Console (Console → Staff → Reset sign-in signs a person out);
   - block the route or turn off the feature, or set `LIFECYCLE_DELETE_ENABLED` and `RETENTION_PRUNE_ENABLED` off so no evidence is deleted while you investigate.
   - Keep the logs: Vercel logs, MongoDB Atlas access logs, `AuditLog`, `StaffAudit`, `Message`, the provider dashboards. Export them before they roll over.
2. **Assess.** Answer in writing:
   - What happened, how, and since when?
   - Which workspaces? (Console → Accounts; `orgId` on every row.)
   - Which kinds of records and fields? (Clients, contacts, leads, employees, salary, bank details, PAN, messages…)
   - How many people, roughly?
   - Is it still going on?
3. **Decide** (founder). Is personal data affected? Which workspaces must be told? Is it reportable to CERT-In?
4. **Notify the workspaces.** Console → **Incidents** (Admin, permission `breach.notify`):
   - paste the affected workspace ids or slugs (one per line; nothing is sent if one is wrong);
   - fill in what happened, which data, what Flowbit did and what the owner should do;
   - tick the confirmation and send.

   Every active owner gets an essential email (no unsubscribe) and a bell alert. Each workspace's audit log and the Console staff audit record the notice. The email tells the owner about their own 72-hour duty and offers logs and record lists.
5. **Report to CERT-In** when reportable (form on cert-in.org.in, within 6 hours). Keep the acknowledgement in the note.
6. **Help the workspaces.** For a workspace that asks:
   - a list of the affected records (ids and kinds, from the database, sent through the owner's support thread);
   - the timeline;
   - Settings → Privacy can export or erase one person's data if someone asks.
7. **Close.** Root cause, the fix, what changes (tests, alerts, access), and the date each workspace was told. File the note with the reference.

## Templates

**Email to owners:** the Console builds it from the form (`modules/console/breach-notice.ts`). Keep the facts plain and short; say what you do not know yet.

**CERT-In:** use their incident reporting form. Include the reference, time found, systems affected, what was done and a contact.

## After the incident

- Tell the owners when it is resolved (a normal support email with the reference).
- Add a test or an alert for the cause.
- Review this runbook.
