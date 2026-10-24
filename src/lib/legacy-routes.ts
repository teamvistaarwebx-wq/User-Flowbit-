/**
 * Routes that were renamed, merged or retired. Each old path keeps working
 * through a redirect (next.config.ts reads this list), so bookmarks, emails
 * and the manual's older links still land on the right page. Pure data.
 *
 * Rules (checked by legacy-routes.test.ts):
 * - `from` has no catalog page and no page file of its own any more.
 * - `to` (without its query) is a catalog page.
 */

export type LegacyRoute = Readonly<{ from: string; to: string; why: string }>

export const LEGACY_ROUTES: readonly LegacyRoute[] = [
  { from: '/app/hr/people/import', to: '/app/settings/import/employees?from=people', why: 'One import screen per importer: employees import in Settings → Import (audit A9).' },
  { from: '/app/settings/billing', to: '/app/settings/subscription?tab=bills', why: 'Subscription and Billing merged into Plan & billing (audit A6).' },
  { from: '/app/settings/email-log', to: '/app/settings/messages', why: 'The Email log became the Messages log (every channel).' },
]

/** Redirect entries for next.config.ts (temporary, so a route can be reused later). */
export const legacyRedirects = () => LEGACY_ROUTES.map((r) => ({ source: r.from, destination: r.to, permanent: false }))
