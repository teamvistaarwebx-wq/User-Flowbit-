/** Demo request options. Pure and client-safe (the contact form renders them). */

export const DEMO_TEAM_SIZES = ['6-10', '11-50', '51-150', '150+'] as const
export type DemoTeamSize = (typeof DEMO_TEAM_SIZES)[number]

export const DEMO_PRODUCTS = ['work', 'muster', 'orbit', 'folio'] as const
export type DemoProduct = (typeof DEMO_PRODUCTS)[number]

export const DEMO_REQUEST_STATUSES = ['new', 'contacted', 'closed'] as const

export const TEAM_SIZE_LABELS: Record<DemoTeamSize, string> = {
  '6-10': '6–10',
  '11-50': '11–50',
  '51-150': '51–150',
  '150+': '150+',
}

export const NAME_MIN = 2
export const NAME_MAX = 80
export const COMPANY_MIN = 2
export const COMPANY_MAX = 120
export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 2000
/** Name of the hidden honeypot field. People never see it; bots fill it. */
export const HONEYPOT_FIELD = 'website'

/** What the contact form shows after a successful submit. */
export type DemoRequestResult = { firstName: string; email: string }
