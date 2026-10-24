import { cronHandler } from '@/lib/cron'
import { runBillingCron } from '@/modules/billing/dunning'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json): Flowbit billing reminders, autopay pre-debit notices, expiry of unverified offline payments and of 12-month-old WhatsApp wallet credit. */
export const GET = cronHandler('billing', runBillingCron)
