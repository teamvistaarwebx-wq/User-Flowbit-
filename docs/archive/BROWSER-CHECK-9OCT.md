# Browser check, 9 Oct 2026 (port 4500, owner and Console admin sessions)

Done in Claude's in-app browser at desktop width (800 px) and on a phone (375 px). Sessions were minted directly; nobody signed in with a password.

## Works

- **Tasks**
  - The board loads.
  - Clicking a card opens the side panel: header fields, Details column, client visibility and "Ask the client to approve".
  - Esc closes the panel.
- **Product tour:** shows on first visit.
- **Posts:** type chips, pinned section, sort, composer.
- **Clients:** KPI tiles, filters, Cards/List toggle, Import and Export.
- **Folio → Reports → Charts:** aging buckets, invoiced vs collected, top 10.
- **HR dashboard** and **Orbit leads**, including the filters and Sequences in the nav.
- **Settings**
  - Integrations groups AI apps, Slack, Webhooks and Email to task.
  - Connected apps (`/app/settings/integrations/ai`) shows the MCP URL with steps for Claude and ChatGPT.
  - Security (2FA).
- **Console home:** metrics, nav, Call today, Alerts.
- **Phone (375 px):**
  - Home shows the setup guide and Load sample agency, with bottom nav and quick check-in.
  - Posts and Clients stack cleanly.
- **Console log:** no errors, only font preload warnings.

## To fix

1. **Folio → Charts → "Invoiced vs collected":** the month labels on the x-axis run together ("NovDecJanFeb…"). Show every 2nd or 3rd label, angle them, or use short single letters at narrow widths. **Fixed 9 Oct** `29a170f`.
2. **Console top bar:** at about 800 px the staff name and role ("Demo Console Admin · Admin") wrap onto three lines. Truncate with an ellipsis, or show only the avatar or initials below `lg`. **Fixed 9 Oct** `f01797f`.
3. **Settings → Security:** the 2FA QR code and secret key render on page load, before the user chooses to set up 2FA. Show a "Set up two-factor sign-in" button first, and generate the secret only after the click. **Fixed 9 Oct** `8eacf83`.
4. **Product tour:** clicking Skip and then quickly clicking a task showed the tour again. The "seen" save was aborted by the navigation. Mark the tour seen on the client straight away (state and localStorage) and save to the server in the background. **Fixed 9 Oct** `f0e5a1a`.
5. **Email-to-task card on Integrations:** the address shown begins with `http://127.0.0.1…`. It should be an email address (`tasks+…@<inbound domain>`). When `INBOUND_EMAIL_DOMAIN` is unset, show "Set INBOUND_EMAIL_DOMAIN to enable" instead of a URL. **Fixed 9 Oct** `eba142b`.

## Not checked in the browser

- Write flows end to end:
  - creating posts, polls, kudos;
  - bank import;
  - sequences;
  - meetings upload.
- The portal sign-in.
- The MCP consent screen.

These need real form submissions on a demo database. Do them next if the owner wants.
