import type { Ctx } from '@/lib/ctx'

/** Which product columns the viewer gets on the Clients page. */
export const clientColumns = (ctx: Ctx) => ({
  orbit: ctx.has('orbit') && ctx.can('orbit.read'),
  folio: ctx.has('folio') && ctx.can('folio.read'),
  work: ctx.has('work') && ctx.can('projects.read'),
  /** Margin needs salary cost (Muster payroll) and revenue (Folio). */
  margin: ctx.has('muster') && ctx.can('payroll.read') && ctx.has('folio') && ctx.can('folio.read'),
})
