/**
 * The one list of providers (sub-processors) and the one sentence on where
 * data lives (B20, B21), used by the Privacy policy, the Data processing terms,
 * the Security page and the FAQ. Pure and client-safe.
 */

export type Provider = Readonly<{ name: string; purpose: string; when?: string }>

export const SUB_PROCESSORS: readonly Provider[] = [
  { name: 'Vercel', purpose: 'runs the Flowbit app (Mumbai region)' },
  { name: 'MongoDB Atlas', purpose: 'stores workspace data (Mumbai, AWS ap-south-1)' },
  { name: 'An S3-compatible file store', purpose: 'stores uploaded and generated files, privately' },
  { name: 'Resend', purpose: 'sends email' },
  { name: 'Razorpay', purpose: 'collects Flowbit subscription and wallet payments, and payments through your own payment links when you switch them on' },
  { name: 'Google', purpose: '"Sign in with Google", and Gmail and Calendar', when: 'only if a person connects them' },
  { name: 'Slack', purpose: 'Slack notifications', when: 'only if your workspace connects it' },
  { name: 'Anthropic', purpose: 'drafts Arc and Meetings AI suggestions from the text needed', when: 'only when the AI provider is switched on' },
  { name: 'Sarvam AI', purpose: 'transcribes meeting recordings', when: 'only with Meetings AI' },
  { name: 'Recall.ai', purpose: 'sends the meeting notetaker to Meet, Zoom or Teams calls', when: 'only when someone sends the notetaker' },
  { name: 'Your GST Suvidha Provider (GSP)', purpose: 'generates e-invoice IRNs and e-way bills', when: 'only when your workspace connects one' },
  { name: 'Interakt (Jio Haptik) and Meta', purpose: 'delivers WhatsApp messages and their delivery status', when: 'only when WhatsApp messaging is switched on' },
]

/** "Vercel: runs the Flowbit app (Mumbai region)." / "… (only if …)." */
export const providerLine = (p: Provider): string => `${p.name}: ${p.purpose}${p.when ? ` (${p.when})` : ''}.`

/** Where data is stored and processed (the same words everywhere). */
export const DATA_LOCATION =
  'Workspace data is stored in India: the app runs on Vercel and the database on MongoDB Atlas, both in Mumbai (AWS ap-south-1). Some providers process data outside India when their feature is used, such as email (Resend), AI drafting (Anthropic) and the meeting notetaker (Recall.ai).'

/** Cookies by purpose (B19). Flowbit sets no advertising or third-party tracking cookies. */
export const COOKIES: readonly Readonly<{ purpose: string; names: string }>[] = [
  { purpose: 'Keeping you signed in (essential)', names: 'fb_session (up to 30 days); fb_2fa during a two-step sign-in (10 minutes); fb_2fa_device if you tick "remember this device" (30 days); fb_oauth during Google sign-in; fb_console for Flowbit staff only' },
  { purpose: 'Finishing something you started (essential)', names: 'fb_plan, the plan you picked on the pricing page (7 days); fb_slack and fb_gint while connecting Slack or Google; fb_portal for the client portal; fb_claim for a public claim form; fb_ps for a payslip link' },
  { purpose: 'Signup attribution', names: 'fb_utm remembers which link or campaign brought you to sign up (30 days). It is first-party, used only to count where signups come from, and never shared with advertisers' },
]
